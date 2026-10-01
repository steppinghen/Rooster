-- The Deck: Phase 1 tables, membership helpers, RLS, and explicit grants.
--
-- Tenancy: every family-owned row carries family_id (FK to families, ON DELETE CASCADE).
-- Child rows that point at a kid or routine use composite foreign keys (kid_id, family_id), so a
-- row can never reference a kid or routine from another family.
--
-- Roles (decided per request from the JWT, never from the UI):
--   parent  real user, MFA passed (aal2), has a parents row for the family
--   device  anonymous user with an unrevoked devices row for the family
--   anyone else (anon key, unlisted signed-in user, revoked device, aal1 parent) gets nothing.
--
-- Grants: the API roles get only the privileges listed in this file (see the foundation
-- migration). `anon` gets nothing on any table.

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

create type public.age_band as enum ('prereader', 'reader');
create type public.volume as enum ('normal', 'focus');
create type public.ground_setting as enum ('auto', 'day', 'night', 'device');
create type public.accent as enum ('magenta', 'cyan', 'yellow', 'lime', 'lilac', 'orange');
create type public.routine_slot as enum ('morning', 'after_school', 'bedtime');
create type public.event_kind as enum ('birthday', 'holiday', 'trip', 'other');
create type public.feeling as enum ('pumping', 'rolling', 'flat', 'choppy');
create type public.checkin_moment as enum ('morning', 'after_school', 'bedtime', 'anytime');
create type public.focus_mode as enum ('everything', 'session', 'lights_out');
create type public.usage_action as enum ('opened', 'completed', 'abandoned', 'skipped');
create type public.module_audience as enum ('kid', 'parent', 'both');

-- ---------------------------------------------------------------------------------------------
-- Families and membership
-- ---------------------------------------------------------------------------------------------

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name = btrim(name)),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now()
);

create table public.parents (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- Emails allowed to sign in. family_id null = a bootstrap row (Parent A before any family
-- exists), inserted by hand with SQL at go-live; it is never visible through the API.
-- Keyed per family (not globally by email), so inserting an email never reveals whether
-- another family has listed it. One family per person is enforced at join (parents.user_id
-- is unique).
create table public.parent_allowlist (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  family_id uuid references public.families (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique nulls not distinct (family_id, email),
  -- Stored lowercase ASCII, so comparisons are exact and no look-alike character can match a
  -- listed address (citext's operators aren't on the empty search_path the functions use).
  check (email::text = lower(email::text) and email::text ~ '^[!-~]+$')
);
create index parent_allowlist_email on public.parent_allowlist (email);

create function private.allowlist_lower() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email::text));
  return new;
end;
$$;
create trigger parent_allowlist_lower before insert or update of email on public.parent_allowlist
  for each row execute function private.allowlist_lower();

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  device_user_id uuid not null unique references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  ground public.ground_setting not null default 'auto',
  paired_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  unique (id, family_id)
);

create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  code_hash text not null,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  used_by_device uuid,
  -- A code can only point at a device in its own family.
  foreign key (used_by_device, family_id) references public.devices (id, family_id) on delete set null (used_by_device),
  check (expires_at <= created_at + interval '10 minutes'),
  check (code_hash like '$2_$%')
);

-- The server owns a code's clock: created_at is now and the code lives 10 minutes at most,
-- whatever the writer sends.
create function private.pairing_code_clock() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.expires_at := least(coalesce(new.expires_at, now() + interval '10 minutes'), now() + interval '10 minutes');
  return new;
end;
$$;
create trigger pairing_codes_clock before insert on public.pairing_codes
  for each row execute function private.pairing_code_clock();
create index pairing_codes_active on public.pairing_codes (expires_at) where used_at is null;

-- Failed pairing / PIN attempts, for lockouts. Internal: no API grants at all.
create table public.pairing_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index pairing_attempts_user on public.pairing_attempts (user_id, attempted_at);

-- ---------------------------------------------------------------------------------------------
-- Membership helpers (security definer: they read parents/devices without tripping those
-- tables' own policies). search_path is empty, so every reference is schema-qualified.
-- ---------------------------------------------------------------------------------------------

create function private.is_parent_of(fid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_aal2_user()
     and exists (
       select 1 from public.parents p
       where p.family_id = fid and p.user_id = auth.uid()
     )
$$;

create function private.is_device_of(fid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_anonymous_session()
     and exists (
       select 1 from public.devices d
       where d.family_id = fid and d.device_user_id = auth.uid() and d.revoked_at is null
     )
$$;

create function private.is_member_of(fid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_parent_of(fid) or private.is_device_of(fid)
$$;

-- Member of any family (for global, non-family rows such as the module catalog).
create function private.is_any_member() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (private.is_aal2_user() and exists (select 1 from public.parents p where p.user_id = auth.uid()))
      or (private.is_anonymous_session() and exists (
            select 1 from public.devices d where d.device_user_id = auth.uid() and d.revoked_at is null))
$$;

-- ---------------------------------------------------------------------------------------------
-- Kids
-- ---------------------------------------------------------------------------------------------

create table public.kids (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 24),
  avatar text not null default 'turtle' check (char_length(avatar) between 1 and 40),
  accent public.accent not null default 'magenta',
  age_band public.age_band not null,
  default_volume public.volume not null default 'normal',
  -- bcrypt hash of the optional 4-digit PIN. Never granted to any API role.
  pin_hash text,
  has_pin boolean generated always as (pin_hash is not null) stored,
  -- Month and day only (data minimization): no birth year.
  birthday_month smallint check (birthday_month between 1 and 12),
  birthday_day smallint check (birthday_day between 1 and 31),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, family_id),
  check ((birthday_month is null) = (birthday_day is null)),
  check (
    birthday_day is null or birthday_day <= case birthday_month
      when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end
  )
);

create table public.pin_attempts (
  kid_id uuid not null references public.kids (id) on delete cascade,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index pin_attempts_kid on public.pin_attempts (kid_id, user_id, attempted_at);

-- ---------------------------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------------------------

-- A JSON array of short id strings (kid_focus.pinned).
create function private.short_id_list(j jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= 20
     and not exists (select 1 from jsonb_array_elements(j) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 80)
$$;

-- Arrays devices may write hold short ids only.
create function private.short_ids(arr text[], max_items int) returns boolean
language sql immutable
set search_path = ''
as $$
  select cardinality(arr) <= max_items
     and not exists (select 1 from unnest(arr) e where e is null or char_length(e) not between 1 and 40)
$$;

-- Steps: ordered array of {id, text, icon}, ids unique and stable so completions and
-- "pinned" focus items can point at a step.
create function private.valid_routine_steps(steps jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(steps) = 'array'
     and jsonb_array_length(steps) between 1 and 15
     and not exists (
       select 1 from jsonb_array_elements(steps) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'id') is distinct from 'string'
          or jsonb_typeof(e -> 'text') is distinct from 'string'
          or jsonb_typeof(e -> 'icon') is distinct from 'string'
          or char_length(e ->> 'id') not between 1 and 40
          or char_length(btrim(e ->> 'text')) not between 1 and 60
          or char_length(e ->> 'icon') not between 1 and 40
     )
     and (select count(distinct e ->> 'id') from jsonb_array_elements(steps) e) = jsonb_array_length(steps)
$$;

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid, -- null = everyone
  slot public.routine_slot not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  starts_at time not null,
  steps jsonb not null check (private.valid_routine_steps(steps)),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
create trigger routines_touch before update on public.routines
  for each row execute function private.touch_updated_at();

create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  routine_id uuid not null,
  kid_id uuid not null,
  on_date date not null,
  completed_steps text[] not null default '{}' check (private.short_ids(completed_steps, 15)),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (family_id, routine_id, kid_id, on_date),
  foreign key (routine_id, family_id) references public.routines (id, family_id) on delete cascade,
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
create trigger routine_completions_touch before update on public.routine_completions
  for each row execute function private.touch_updated_at();

-- A completion must be for a kid the routine applies to.
-- A completion must be for a kid the routine applies to, on a sensible day. completed_at is
-- the server's: set when every step of the routine is done, never by the writer.
create function private.check_completion_kid() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  owner uuid;
  all_ids text[];
  today date;
begin
  select r.kid_id, array(select e ->> 'id' from jsonb_array_elements(r.steps) e) into owner, all_ids
    from public.routines r where r.id = new.routine_id and r.family_id = new.family_id;
  if owner is not null and owner <> new.kid_id then
    raise exception 'routine % is not assigned to kid %', new.routine_id, new.kid_id using errcode = '23514';
  end if;
  select (now() at time zone f.timezone)::date into today from public.families f where f.id = new.family_id;
  if new.on_date > today + 1 or new.on_date < today - 7 then
    raise exception 'routine progress must be for the last week' using errcode = '23514';
  end if;
  new.completed_at := case
    when all_ids <@ new.completed_steps then coalesce(case when tg_op = 'UPDATE' then old.completed_at end, now())
  end;
  return new;
end;
$$;
create trigger routine_completions_kid before insert or update on public.routine_completions
  for each row execute function private.check_completion_kid();

-- Time zones must be real ones (create_family checks too; this covers later edits).
create function private.check_timezone() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'unknown time zone %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger families_timezone before insert or update of timezone on public.families
  for each row execute function private.check_timezone();

-- Forgetting a device forgets its identity: that anonymous user can never pair again.
create function private.device_forgotten() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.pairing_attempts where user_id = old.device_user_id;
  delete from auth.users u where u.id = old.device_user_id and u.is_anonymous;
  return old;
end;
$$;
create trigger devices_forgotten after delete on public.devices
  for each row execute function private.device_forgotten();

-- ---------------------------------------------------------------------------------------------
-- Tour Dates
-- ---------------------------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  icon text not null default 'star' check (char_length(icon) between 1 and 40),
  on_date date not null,
  kind public.event_kind not null default 'other',
  visible_to_kids boolean not null default true,
  repeats_yearly boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Wave Check
-- ---------------------------------------------------------------------------------------------

-- Parent-only to read (a kid sees only their own current check-in, through an RPC).
-- 30-day retention by a scheduled job (slice 9). No scores or rewards attached.
create table public.feelings_checkins (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null,
  feeling public.feeling not null,
  size smallint not null check (size between 0 and 4),
  moment public.checkin_moment not null default 'anytime',
  created_at timestamptz not null default now(),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
create index feelings_checkins_kid_time on public.feelings_checkins (kid_id, created_at desc);
create index feelings_checkins_created on public.feelings_checkins (created_at);

create table public.reset_plans (
  kid_id uuid not null,
  family_id uuid not null references public.families (id) on delete cascade,
  body_signs text[] not null default '{}' check (private.short_ids(body_signs, 8)),
  tools text[] not null default '{}' check (private.short_ids(tools, 8)),
  updated_at timestamptz not null default now(),
  -- family_id leads the key so a conflict can never reveal another family's row.
  primary key (family_id, kid_id),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
create trigger reset_plans_touch before update on public.reset_plans
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Modules and focus
-- ---------------------------------------------------------------------------------------------

-- Global catalog (not family data). Navigation is built from this plus family_modules.
create table public.module_catalog (
  key text primary key,
  label text not null,
  icon text not null,
  audience public.module_audience not null,
  removable boolean not null default true,
  default_enabled boolean not null default true,
  -- Focus modes in which a kid can see this module. Wave Check is in every mode.
  visible_in public.focus_mode[] not null default '{everything}',
  sort_order smallint not null default 0
);

insert into public.module_catalog (key, label, icon, audience, removable, default_enabled, visible_in, sort_order) values
  ('routines',    'Routines',    'board',    'kid',    true,  true, '{everything}',                     10),
  ('wave_check',  'Wave Check',  'waves',    'kid',    false, true, '{everything,session,lights_out}', 20),
  ('tour_dates',  'Tour Dates',  'calendar', 'both',   true,  true, '{everything}',                     30),
  ('session',     'Session',     'book',     'kid',    true,  true, '{everything,session}',             40),
  ('today',       'Today',       'sun',      'parent', false, true, '{}',                               0),
  ('back_office', 'Back Office', 'lock',     'parent', false, true, '{}',                               90);

create table public.family_modules (
  family_id uuid not null references public.families (id) on delete cascade,
  module_key text not null references public.module_catalog (key) on delete cascade,
  enabled boolean not null default true,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  primary key (family_id, module_key)
);

-- Non-removable modules (Wave Check) can't be switched off.
create function private.check_module_removable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.enabled and exists (
    select 1 from public.module_catalog c where c.key = new.module_key and not c.removable
  ) then
    raise exception 'module % cannot be disabled', new.module_key using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger family_modules_removable before insert or update on public.family_modules
  for each row execute function private.check_module_removable();

-- Per-kid focus mode. Only parents write it (enforced by RLS below).
-- A pending switch (heads-up) is stored as pending_mode + switch_at; clients compute the
-- effective mode from these timestamps against server time, so reloading can't escape it.
create table public.kid_focus (
  kid_id uuid not null,
  family_id uuid not null references public.families (id) on delete cascade,
  mode public.focus_mode not null default 'everything',
  since timestamptz not null default now(),
  ends_at timestamptz,
  return_mode public.focus_mode,
  pending_mode public.focus_mode,
  switch_at timestamptz,
  pending_ends_at timestamptz,
  pending_return_mode public.focus_mode,
  -- Pinned activity/item ids (Phase 2): short strings only.
  pinned jsonb not null default '[]' check (private.short_id_list(pinned)),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (family_id, kid_id),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade,
  check ((pending_mode is null) = (switch_at is null)),
  check (ends_at is null or ends_at > since),
  -- Only real states: Everything is never timed, a return needs an end, and a pending end
  -- belongs to a pending switch and comes after it.
  check (ends_at is null or mode <> 'everything'),
  check (return_mode is null or ends_at is not null),
  check (pending_ends_at is null or (pending_mode is not null and pending_mode <> 'everything' and pending_ends_at > switch_at)),
  check (pending_return_mode is null or pending_ends_at is not null)
);
-- Server stamps who changed the mode and when; clients can't set these.
create function private.kid_focus_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger kid_focus_stamp before insert or update on public.kid_focus
  for each row execute function private.kid_focus_stamp();

-- ---------------------------------------------------------------------------------------------
-- Usage events (what was touched and for how long; no content). 90-day retention (slice 9).
-- ---------------------------------------------------------------------------------------------

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid,
  module_key text not null check (char_length(module_key) between 1 and 40),
  action public.usage_action not null,
  target_id text check (char_length(target_id) <= 80),
  duration_ms integer check (duration_ms between 0 and 86400000),
  created_at timestamptz not null default now(),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
create index usage_events_family_time on public.usage_events (family_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.families enable row level security;
alter table public.parents enable row level security;
alter table public.parent_allowlist enable row level security;
alter table public.devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.pairing_attempts enable row level security;
alter table public.kids enable row level security;
alter table public.pin_attempts enable row level security;
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;
alter table public.events enable row level security;
alter table public.feelings_checkins enable row level security;
alter table public.reset_plans enable row level security;
alter table public.module_catalog enable row level security;
alter table public.family_modules enable row level security;
alter table public.kid_focus enable row level security;
alter table public.usage_events enable row level security;

-- families: members read; parents rename. Created and deleted only through RPCs.
create policy families_select on public.families for select to authenticated
  using ((select private.is_member_of(id)));
create policy families_update on public.families for update to authenticated
  using ((select private.is_parent_of(id))) with check ((select private.is_parent_of(id)));

-- parents: visible to the family's parents only (devices never see parent rows).
create policy parents_select on public.parents for select to authenticated
  using ((select private.is_parent_of(family_id)));
create policy parents_update_self on public.parents for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)))
  with check (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)));

-- parent_allowlist: a family's parents manage their family's entries. Bootstrap rows
-- (family_id null) match no policy.
create policy allowlist_select on public.parent_allowlist for select to authenticated
  using (family_id is not null and (select private.is_parent_of(family_id)));
create policy allowlist_insert on public.parent_allowlist for insert to authenticated
  with check (family_id is not null and (select private.is_parent_of(family_id)));
create policy allowlist_delete on public.parent_allowlist for delete to authenticated
  using (family_id is not null and joined_at is null and (select private.is_parent_of(family_id)));

-- devices: parents see their family's devices; a device sees its own row (even when revoked,
-- so it can show "this iPad was unpaired"). Pairing and revocation go through RPCs.
create policy devices_select on public.devices for select to authenticated
  using ((select private.is_parent_of(family_id))
         or (device_user_id = (select auth.uid()) and (select private.is_anonymous_session()) and revoked_at is null));
create policy devices_update on public.devices for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy devices_delete on public.devices for delete to authenticated
  using ((select private.is_parent_of(family_id)) and revoked_at is not null);

-- pairing_codes: parents can list their family's codes (never the hash). Created and redeemed
-- only through RPCs.
create policy pairing_codes_select on public.pairing_codes for select to authenticated
  using ((select private.is_parent_of(family_id)));

-- pairing_attempts, pin_attempts: RLS on, no policies, no grants. RPC-only.

-- kids: members read (without pin_hash, by column grants); parents write.
create policy kids_select on public.kids for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy kids_insert on public.kids for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy kids_update on public.kids for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy kids_delete on public.kids for delete to authenticated
  using ((select private.is_parent_of(family_id)));

-- routines: members read; parents write.
create policy routines_select on public.routines for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy routines_insert on public.routines for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy routines_update on public.routines for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy routines_delete on public.routines for delete to authenticated
  using ((select private.is_parent_of(family_id)));

-- routine_completions: kid-facing data. Members read and write; parents delete.
create policy completions_select on public.routine_completions for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy completions_insert on public.routine_completions for insert to authenticated
  with check ((select private.is_member_of(family_id)));
create policy completions_update on public.routine_completions for update to authenticated
  using ((select private.is_member_of(family_id))) with check ((select private.is_member_of(family_id)));
create policy completions_delete on public.routine_completions for delete to authenticated
  using ((select private.is_parent_of(family_id)));

-- events: parents see all; devices see only kid-visible events. Parents write.
create policy events_select on public.events for select to authenticated
  using ((select private.is_parent_of(family_id)) or (visible_to_kids and (select private.is_device_of(family_id))));
create policy events_insert on public.events for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy events_update on public.events for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy events_delete on public.events for delete to authenticated
  using ((select private.is_parent_of(family_id)));

-- feelings_checkins: members insert; only parents read. No updates.
create policy feelings_insert on public.feelings_checkins for insert to authenticated
  with check ((select private.is_member_of(family_id)));
create policy feelings_select on public.feelings_checkins for select to authenticated
  using ((select private.is_parent_of(family_id)));
create policy feelings_delete on public.feelings_checkins for delete to authenticated
  using ((select private.is_parent_of(family_id)));

-- reset_plans: kid-facing (built with the kid on the iPad). Members read and write.
create policy reset_plans_select on public.reset_plans for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy reset_plans_insert on public.reset_plans for insert to authenticated
  with check ((select private.is_member_of(family_id)));
create policy reset_plans_update on public.reset_plans for update to authenticated
  using ((select private.is_member_of(family_id))) with check ((select private.is_member_of(family_id)));

-- module_catalog: readable by family members only (an unlisted or unpaired session gets
-- nothing at all, not even global config); nobody writes through the API.
create policy module_catalog_select on public.module_catalog for select to authenticated
  using ((select private.is_any_member()));

-- family_modules: members read; parents write.
create policy family_modules_select on public.family_modules for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy family_modules_insert on public.family_modules for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy family_modules_update on public.family_modules for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));

-- kid_focus: members read; ONLY parents write (devices are read-only for mode settings).
create policy kid_focus_select on public.kid_focus for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy kid_focus_insert on public.kid_focus for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy kid_focus_update on public.kid_focus for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
-- No delete policy: rows go away only with their kid. (Realtime doesn't apply RLS to DELETE
-- events, so published tables avoid client deletes.)

-- usage_events: members insert; parents read.
create policy usage_insert on public.usage_events for insert to authenticated
  with check ((select private.is_member_of(family_id)));
create policy usage_select on public.usage_events for select to authenticated
  using ((select private.is_parent_of(family_id)));

-- Trigger and check functions are never callable directly.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_aal2_user() to anon, authenticated;
grant execute on function private.is_anonymous_session() to anon, authenticated;
grant execute on function private.is_parent_of(uuid) to anon, authenticated;
grant execute on function private.is_device_of(uuid) to anon, authenticated;
grant execute on function private.is_member_of(uuid) to anon, authenticated;
grant execute on function private.is_any_member() to anon, authenticated;
-- valid_routine_steps backs a CHECK constraint, which runs with the writer's privileges.
grant execute on function private.valid_routine_steps(jsonb) to authenticated;
grant execute on function private.short_ids(text[], int) to authenticated;
grant execute on function private.short_id_list(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants (explicit; nothing is exposed by default). `anon` gets nothing.
-- Column lists keep secrets (pin_hash, code_hash) out of every API role's reach and keep
-- server-set columns (ids, timestamps, created_by) out of client writes.
-- ---------------------------------------------------------------------------------------------

grant select on public.families to authenticated;
grant update (name, timezone) on public.families to authenticated;

grant select on public.parents to authenticated;
grant update (display_name) on public.parents to authenticated;

grant select (id, email, family_id, created_at, joined_at) on public.parent_allowlist to authenticated;
grant insert (email, family_id) on public.parent_allowlist to authenticated;
grant delete on public.parent_allowlist to authenticated;

grant select (id, family_id, device_user_id, label, ground, paired_at, revoked_at, last_seen_at) on public.devices to authenticated;
grant update (label, ground) on public.devices to authenticated;
grant delete on public.devices to authenticated;

grant select (id, family_id, label, created_by, created_at, expires_at, used_at, used_by_device) on public.pairing_codes to authenticated;

grant select (id, family_id, nickname, avatar, accent, age_band, default_volume, has_pin, birthday_month, birthday_day, sort_order, created_at) on public.kids to authenticated;
grant insert (family_id, nickname, avatar, accent, age_band, default_volume, birthday_month, birthday_day, sort_order) on public.kids to authenticated;
grant update (nickname, avatar, accent, age_band, default_volume, birthday_month, birthday_day, sort_order) on public.kids to authenticated;
grant delete on public.kids to authenticated;

grant select on public.routines to authenticated;
grant insert (family_id, kid_id, slot, name, starts_at, steps, sort_order) on public.routines to authenticated;
grant update (kid_id, slot, name, starts_at, steps, sort_order) on public.routines to authenticated;
grant delete on public.routines to authenticated;

grant select on public.routine_completions to authenticated;
grant insert (family_id, routine_id, kid_id, on_date, completed_steps) on public.routine_completions to authenticated;
grant update (completed_steps) on public.routine_completions to authenticated;
grant delete on public.routine_completions to authenticated;

grant select on public.events to authenticated;
grant insert (family_id, title, icon, on_date, kind, visible_to_kids, repeats_yearly) on public.events to authenticated;
grant update (title, icon, on_date, kind, visible_to_kids, repeats_yearly) on public.events to authenticated;
grant delete on public.events to authenticated;

grant select on public.feelings_checkins to authenticated;
grant insert (family_id, kid_id, feeling, size, moment) on public.feelings_checkins to authenticated;
grant delete on public.feelings_checkins to authenticated;

grant select on public.reset_plans to authenticated;
grant insert (kid_id, family_id, body_signs, tools) on public.reset_plans to authenticated;
grant update (body_signs, tools) on public.reset_plans to authenticated;

grant select on public.module_catalog to authenticated;

grant select on public.family_modules to authenticated;
grant insert (family_id, module_key, enabled, settings) on public.family_modules to authenticated;
grant update (enabled, settings) on public.family_modules to authenticated;

-- kid_focus: read-only through the API. Every write goes through set_focus /
-- cancel_focus_switch (parents only), so only states those functions create can exist.
grant select on public.kid_focus to authenticated;

grant select on public.usage_events to authenticated;
grant insert (family_id, kid_id, module_key, action, target_id, duration_ms) on public.usage_events to authenticated;
