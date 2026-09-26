-- ==========================================================================
-- Coop TV — initial schema
--
-- Read this before pushing:
--   • Every table is coop_-prefixed and has RLS enabled.
--   • coop_settings and coop_kid_pins have NO anon policies at all — invisible.
--   • Every SECURITY DEFINER function REVOKEs execute from public/anon/
--     authenticated and GRANTs to only the intended callers.
--   • Only kid-callable function is coop_verify_kid_pin.
--   • Parent PIN verify + rotate + kid-pin admin are service_role only.
--
-- See coop/CLAUDE.md for the rules and coop plan for background.
-- ==========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- Secrets and lockout state. Never visible to anon.
create table coop_settings (
  id                   int         primary key default 1 check (id = 1),
  parent_pin_hash      text,
  pin_updated_at       timestamptz,
  failed_pin_attempts  int         not null default 0,
  lockout_until        timestamptz
);
alter table coop_settings enable row level security;
-- No policies. Anon and authenticated cannot see this table.

-- Kid-readable knobs. Anon can select, nothing more.
create table coop_public_settings (
  id           int         primary key default 1 check (id = 1),
  hide_shorts  bool        not null default true,
  updated_at   timestamptz not null default now()
);
alter table coop_public_settings enable row level security;
create policy "anon read" on coop_public_settings for select to anon using (true);

-- Kid profiles. No PIN column here (see coop_kid_pins).
create table coop_profiles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  avatar      text        not null,
  color       text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);
alter table coop_profiles enable row level security;
create policy "anon read" on coop_profiles for select to anon using (true);

-- Kid PINs, isolated. Never visible to anon.
create table coop_kid_pins (
  profile_id  uuid        primary key references coop_profiles(id) on delete cascade,
  pin_hash    text        not null,
  updated_at  timestamptz not null default now()
);
alter table coop_kid_pins enable row level security;
-- No policies.

-- Approved YouTube channels, deduplicated.
create table coop_channels (
  id                    text        primary key,               -- YouTube channel ID (UC…)
  handle                text,
  title                 text        not null,
  thumbnail_url         text,
  uploads_playlist_id   text        not null,
  added_at              timestamptz not null default now(),
  last_synced_at        timestamptz
);
alter table coop_channels enable row level security;
create policy "anon read" on coop_channels for select to anon using (true);

-- Which profiles see which channels.
create table coop_profile_channels (
  profile_id  uuid        not null references coop_profiles(id) on delete cascade,
  channel_id  text        not null references coop_channels(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (profile_id, channel_id)
);
alter table coop_profile_channels enable row level security;
create policy "anon read" on coop_profile_channels for select to anon using (true);

-- Cached video metadata.
-- channel_id is ON DELETE SET NULL so that is_oneoff=true videos survive
-- removal of their owning channel. remove_channel first deletes the
-- non-oneoff rows for the channel; the FK nulls the rest as the channel
-- row is dropped.
create table coop_videos (
  id                    text        primary key,               -- YouTube video ID
  channel_id            text        references coop_channels(id) on delete set null,
  title                 text        not null,
  thumbnail_url         text,
  channel_title         text,
  published_at          timestamptz,
  duration_seconds      int,
  is_short              bool,                                    -- NULL until probed
  is_live               bool        not null default false,
  is_upcoming           bool        not null default false,
  availability          text        not null default 'available'
                                    check (availability in ('available','unavailable')),
  blocked_by_keyword    bool        not null default false,
  is_oneoff             bool        not null default false,
  synced_at             timestamptz not null default now()
);
alter table coop_videos enable row level security;
create policy "anon read" on coop_videos for select to anon using (true);

create index coop_videos_channel_id_idx on coop_videos (channel_id);
create index coop_videos_visible_idx on coop_videos (availability, is_live, is_upcoming, blocked_by_keyword);

-- Per-profile explicit visibility for one-off videos.
create table coop_profile_videos (
  profile_id  uuid        not null references coop_profiles(id) on delete cascade,
  video_id    text        not null references coop_videos(id)   on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (profile_id, video_id)
);
alter table coop_profile_videos enable row level security;
create policy "anon read" on coop_profile_videos for select to anon using (true);

-- Per-profile "hide this video" (existing feature).
create table coop_profile_hidden_videos (
  profile_id  uuid        not null references coop_profiles(id) on delete cascade,
  video_id    text        not null references coop_videos(id)   on delete cascade,
  hidden_at   timestamptz not null default now(),
  primary key (profile_id, video_id)
);
alter table coop_profile_hidden_videos enable row level security;
create policy "anon read" on coop_profile_hidden_videos for select to anon using (true);

-- Global keyword blocklist. Stored lowercased; matched case-insensitive whole-word.
create table coop_blocklist_keywords (
  id         uuid        primary key default gen_random_uuid(),
  keyword    text        not null unique,
  added_at   timestamptz not null default now()
);
alter table coop_blocklist_keywords enable row level security;
create policy "anon read" on coop_blocklist_keywords for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 2. Functions (all SECURITY DEFINER, search_path locked)
--
--    Every function is created, then permissions are locked down explicitly:
--      REVOKE from public/anon/authenticated, then GRANT to the exact caller.
-- ---------------------------------------------------------------------------

-- Verify a kid PIN. Returns true if no PIN set (unlocked).
create or replace function coop_verify_kid_pin(p_profile_id uuid, p_pin text)
returns bool
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  select pin_hash into h from coop_kid_pins where profile_id = p_profile_id;
  if h is null then
    return true;  -- no PIN configured for this profile
  end if;
  return h = crypt(p_pin, h);
end;
$$;
revoke execute on function coop_verify_kid_pin(uuid, text) from public, anon, authenticated;
grant  execute on function coop_verify_kid_pin(uuid, text) to anon;

-- Verify the parent PIN with 5-strikes / 15-min lockout.
-- Locked-out state short-circuits before any bcrypt work.
create or replace function coop_verify_parent_pin(p_pin text)
returns bool
language plpgsql
security definer
set search_path = public
as $$
declare
  s coop_settings%rowtype;
begin
  select * into s from coop_settings where id = 1 for update;
  if not found or s.parent_pin_hash is null then
    return false;
  end if;
  if s.lockout_until is not null and s.lockout_until > now() then
    return false;
  end if;
  if s.parent_pin_hash = crypt(p_pin, s.parent_pin_hash) then
    update coop_settings
       set failed_pin_attempts = 0,
           lockout_until       = null
     where id = 1;
    return true;
  end if;
  -- Wrong PIN
  if s.failed_pin_attempts + 1 >= 5 then
    update coop_settings
       set failed_pin_attempts = 0,
           lockout_until       = now() + interval '15 minutes'
     where id = 1;
  else
    update coop_settings
       set failed_pin_attempts = failed_pin_attempts + 1
     where id = 1;
  end if;
  return false;
end;
$$;
revoke execute on function coop_verify_parent_pin(text) from public, anon, authenticated;
grant  execute on function coop_verify_parent_pin(text) to service_role;

-- Set or rotate the parent PIN. Bootstrap: also used by set-parent-pin.mjs.
create or replace function coop_set_parent_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into coop_settings (id, parent_pin_hash, pin_updated_at,
                             failed_pin_attempts, lockout_until)
       values (1, crypt(p_pin, gen_salt('bf')), now(), 0, null)
  on conflict (id) do update
     set parent_pin_hash     = excluded.parent_pin_hash,
         pin_updated_at      = excluded.pin_updated_at,
         failed_pin_attempts = 0,
         lockout_until       = null;
end;
$$;
revoke execute on function coop_set_parent_pin(text) from public, anon, authenticated;
grant  execute on function coop_set_parent_pin(text) to service_role;

-- Set or rotate a kid PIN.
create or replace function coop_set_kid_pin(p_profile_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into coop_kid_pins (profile_id, pin_hash, updated_at)
       values (p_profile_id, crypt(p_pin, gen_salt('bf')), now())
  on conflict (profile_id) do update
     set pin_hash   = excluded.pin_hash,
         updated_at = excluded.updated_at;
end;
$$;
revoke execute on function coop_set_kid_pin(uuid, text) from public, anon, authenticated;
grant  execute on function coop_set_kid_pin(uuid, text) to service_role;

-- Clear a kid PIN (profile becomes unlocked).
create or replace function coop_clear_kid_pin(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from coop_kid_pins where profile_id = p_profile_id;
end;
$$;
revoke execute on function coop_clear_kid_pin(uuid) from public, anon, authenticated;
grant  execute on function coop_clear_kid_pin(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Seed rows
-- ---------------------------------------------------------------------------

-- Bootstrap coop_settings so coop_verify_parent_pin has a row to update.
-- parent_pin_hash stays NULL until set-parent-pin.mjs is run.
insert into coop_settings (id) values (1) on conflict (id) do nothing;

-- Bootstrap coop_public_settings with hide_shorts = true.
insert into coop_public_settings (id) values (1) on conflict (id) do nothing;

-- Seed the blocklist.
insert into coop_blocklist_keywords (keyword) values ('milo'), ('chip')
  on conflict (keyword) do nothing;
