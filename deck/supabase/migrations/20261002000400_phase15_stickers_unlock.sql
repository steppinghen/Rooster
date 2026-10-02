-- The Deck: Phase 1.5 slice 1, part 4. Weekly decks, sticker awards, and the kitchen hub's
-- display unlock (docs/stickers-and-holidays.md; CLAUDE.md req. 3; REVIEW.md A6, A56).
--
-- No API role writes these tables. Decks, offers, picks and placements are written by
-- definer RPCs (slice 8) that check the caller, so a device can never place a sticker it
-- wasn't offered or go over four a day. Unlocks are created only by the server function that
-- checks the parent PIN (slice 15).

create type public.deck_world as enum ('skate', 'surf', 'snow', 'trail', 'tropical', 'winter');
create type public.award_source as enum ('routine', 'chore', 'last_run');

create table public.kid_decks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  design_key text not null check (char_length(design_key) between 1 and 60),
  colorway smallint not null default 1 check (colorway in (1, 2)),
  world public.deck_world not null,
  holiday_key text check (holiday_key is null or char_length(holiday_key) between 1 and 40),
  rerolls_used smallint not null default 0 check (rerolls_used between 0 and 3),
  created_at timestamptz not null default now(),
  unique (id, family_id),
  unique (family_id, kid_id, week_start),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);

create table public.sticker_awards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null,
  kid_deck_id uuid not null,
  source_kind public.award_source not null,
  source_id uuid not null,
  -- The family-local day it was earned; the four-a-day cap counts these.
  award_date date not null,
  offered_keys text[] not null check (cardinality(offered_keys) between 1 and 3 and private.short_ids(offered_keys, 3)),
  sticker_key text check (sticker_key is null or sticker_key = any (offered_keys)),
  x real check (x between 0 and 1),
  y real check (y between 0 and 1),
  size smallint check (size between 86 and 96),
  tilt real check (abs(tilt) between 5 and 12),
  awarded_at timestamptz not null default now(),
  placed_at timestamptz,
  unique (id, family_id),
  -- One sticker per routine per day.
  unique (family_id, kid_id, source_kind, source_id, award_date),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade,
  foreign key (kid_deck_id, family_id) references public.kid_decks (id, family_id) on delete cascade,
  -- Placed means picked and positioned, all at once.
  check ((placed_at is null) = (x is null) and (placed_at is null) = (y is null)
         and (placed_at is null) = (size is null) and (placed_at is null) = (tilt is null)
         and (placed_at is null or sticker_key is not null))
);
create index sticker_awards_day on public.sticker_awards (family_id, kid_id, award_date);
create index sticker_awards_deck on public.sticker_awards (family_id, kid_deck_id);

-- At most four a day per kid, and a placed sticker never moves or changes.
create function private.sticker_award_rules() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('sticker_awards:' || new.kid_id::text || ':' || new.award_date::text, 0));
    if (select count(*) from public.sticker_awards a
         where a.family_id = new.family_id and a.kid_id = new.kid_id and a.award_date = new.award_date) >= 4 then
      raise exception 'four stickers a day' using errcode = '23514';
    end if;
    if not exists (select 1 from public.kid_decks d where d.id = new.kid_deck_id and d.family_id = new.family_id and d.kid_id = new.kid_id) then
      raise exception 'that deck belongs to another kid' using errcode = '23514';
    end if;
    if not exists (select 1 from public.kid_decks d where d.id = new.kid_deck_id and new.award_date between d.week_start and d.week_start + 6) then
      raise exception 'an award goes on the deck of the week it was earned' using errcode = '23514';
    end if;
    if (select count(distinct k) from unnest(new.offered_keys) k) <> cardinality(new.offered_keys) then
      raise exception 'an offer is different stickers' using errcode = '23514';
    end if;
    -- (That the source is a sticker routine of this family serving this kid is the award RPC's
    -- job, slice 8: chores have no table yet.)
  elsif tg_op = 'UPDATE' then
    if (new.family_id, new.kid_id, new.kid_deck_id, new.source_kind, new.source_id, new.award_date, new.offered_keys, new.awarded_at)
       is distinct from (old.family_id, old.kid_id, old.kid_deck_id, old.source_kind, old.source_id, old.award_date, old.offered_keys, old.awarded_at) then
      raise exception 'an award''s offer is fixed' using errcode = '23514';
    end if;
    if old.sticker_key is not null and new.sticker_key is distinct from old.sticker_key then
      raise exception 'a picked sticker stays picked' using errcode = '23514';
    end if;
    if old.placed_at is not null and (new.x, new.y, new.size, new.tilt, new.placed_at) is distinct from (old.x, old.y, old.size, old.tilt, old.placed_at) then
      raise exception 'a placed sticker never moves' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger sticker_awards_rules before insert or update on public.sticker_awards
  for each row execute function private.sticker_award_rules();

alter table public.kid_decks enable row level security;
alter table public.sticker_awards enable row level security;
create policy kid_decks_select on public.kid_decks for select to authenticated using ((select private.is_member_of(family_id)));
create policy sticker_awards_select on public.sticker_awards for select to authenticated using ((select private.is_member_of(family_id)));
grant select on public.kid_decks to authenticated;
grant select on public.sticker_awards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Display unlock: a short-lived parent session on a Family display, after the 6-digit parent
-- PIN checks out on the server. Expiry slides with activity, never past 30 minutes from the
-- unlock (REVIEW.md A56). Lock ends it at once (ended_at).
-- ---------------------------------------------------------------------------------------------

create table public.display_unlocks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  device_id uuid not null,
  parent_user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  foreign key (device_id, family_id) references public.devices (id, family_id) on delete cascade,
  foreign key (family_id, parent_user_id) references public.parents (family_id, user_id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  check (ended_at is null or ended_at >= created_at)
);
create index display_unlocks_device on public.display_unlocks (family_id, device_id, expires_at desc);

-- Backstops for the server function (slice 15): an unlock only for an unrevoked Family display
-- with Parent unlock on, and Lock is final.
create function private.display_unlock_rules() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.devices d where d.id = new.device_id and d.family_id = new.family_id
                   and d.job = 'display' and d.parent_unlock and d.revoked_at is null) then
      raise exception 'only an unrevoked Family display with Parent unlock on can be unlocked' using errcode = '23514';
    end if;
  elsif old.ended_at is not null and (new.ended_at is distinct from old.ended_at or new.expires_at is distinct from old.expires_at) then
    raise exception 'a locked display stays locked' using errcode = '23514';
  elsif (new.device_id, new.family_id, new.parent_user_id) is distinct from (old.device_id, old.family_id, old.parent_user_id) then
    raise exception 'an unlock can''t be moved' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger display_unlocks_rules before insert or update on public.display_unlocks
  for each row execute function private.display_unlock_rules();

-- Wrong parent PINs, for the lockout (like pin_attempts: RLS on, no grants).
create table public.display_unlock_attempts (
  family_id uuid not null references public.families (id) on delete cascade,
  device_user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index display_unlock_attempts_device on public.display_unlock_attempts (device_user_id, attempted_at);
create index display_unlock_attempts_family on public.display_unlock_attempts (family_id, attempted_at);

alter table public.display_unlocks enable row level security;
alter table public.display_unlock_attempts enable row level security;
-- Parents see their family's unlocks (who unlocked the kitchen, when). The display learns its
-- own state through an RPC (slice 15); no direct device reads.
create policy display_unlocks_select on public.display_unlocks for select to authenticated
  using ((select private.is_parent_of(family_id)));
grant select on public.display_unlocks to authenticated;

revoke execute on function private.sticker_award_rules() from public, anon, authenticated;
revoke execute on function private.display_unlock_rules() from public, anon, authenticated;
