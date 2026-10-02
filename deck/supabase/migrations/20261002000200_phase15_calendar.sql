-- The Deck: Phase 1.5 slice 1, part 2. Calendars, feed secrets, display and parent calendar
-- settings, and the 1.5 event fields (docs/parent-screens.md "Calendar"; REVIEW.md A14, A43,
-- A57).
--
-- Who sees an event (kids):
--   the Holidays calendar      always
--   kids_default = never       never (work), whatever the event says
--   event kid_visibility       shown / hidden override the calendar
--   inherit                    the calendar's kids_default = shown
-- Feed URLs are secrets: they live in private.calendar_feeds, which no API role can reach
-- (written by a definer RPC in slice 10). Synced events are read-only apart from their kid layer.

create type public.calendar_source as enum ('feed', 'built_in');
create type public.calendar_provider as enum ('apple', 'google');
create type public.kids_default as enum ('shown', 'hidden', 'never');
create type public.display_mode as enum ('off', 'busy', 'title');
create type public.kid_visibility as enum ('inherit', 'shown', 'hidden');

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  source public.calendar_source not null,
  provider public.calendar_provider,
  -- Built-in calendars: 'holidays' (drives the accents; always reaches kids) and 'deck'
  -- (events typed into The Deck in Phase 1, REVIEW.md A43).
  builtin_key text check (builtin_key in ('holidays', 'deck')),
  color public.accent not null default 'cyan',
  owner_user_id uuid,
  kids_default public.kids_default not null default 'hidden',
  last_synced_at timestamptz,
  -- Why the last sync failed, as a fixed code (never free text, which could quote the link).
  last_error text check (last_error is null or last_error in ('unreachable', 'not_found', 'forbidden', 'not_a_calendar', 'too_large', 'timeout', 'unreadable')),
  synced_count integer not null default 0 check (synced_count >= 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, family_id),
  unique (family_id, builtin_key),
  check ((source = 'built_in') = (builtin_key is not null)),
  check ((source = 'feed') = (provider is not null)),
  check (builtin_key is distinct from 'holidays' or kids_default = 'shown'),
  foreign key (family_id, owner_user_id) references public.parents (family_id, user_id) on delete set null (owner_user_id)
);

create table private.calendar_feeds (
  calendar_id uuid primary key,
  family_id uuid not null,
  url text not null check (char_length(url) between 12 and 2000 and url ~* '^(https|webcal)://'),
  updated_at timestamptz not null default now(),
  foreign key (calendar_id, family_id) references public.calendars (id, family_id) on delete cascade
);
alter table private.calendar_feeds enable row level security;
revoke all on private.calendar_feeds from public, anon, authenticated;

-- Every family has the two built-in calendars.
create function private.family_builtin_calendars() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.calendars (family_id, name, source, builtin_key, color, kids_default, sort_order) values
    (new.id, 'Holidays', 'built_in', 'holidays', 'yellow', 'shown', 90),
    (new.id, 'Added in The Deck', 'built_in', 'deck', 'lilac', 'shown', 80)
  on conflict (family_id, builtin_key) do nothing;
  return null;
end;
$$;
create trigger families_builtin_calendars after insert on public.families
  for each row execute function private.family_builtin_calendars();
insert into public.calendars (family_id, name, source, builtin_key, color, kids_default, sort_order)
  select f.id, x.name, 'built_in', x.key, x.color::public.accent, 'shown', x.sort
  from public.families f
  cross join (values ('Holidays', 'holidays', 'yellow', 90), ('Added in The Deck', 'deck', 'lilac', 80)) as x(name, key, color, sort)
on conflict (family_id, builtin_key) do nothing;

-- Built-in calendars can't be renamed into feeds, re-keyed, or removed. Guards apply to direct
-- API writes only (pg_trigger_depth() = 1): a cascade from Delete family or from removing a
-- calendar must go through.
create function private.calendar_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) = 'authenticated' and pg_trigger_depth() = 1 then
    if tg_op = 'DELETE' then
      if old.source = 'built_in' then
        raise exception 'built-in calendars can''t be removed' using errcode = '42501';
      end if;
      return old;
    end if;
    if new.source is distinct from old.source or new.builtin_key is distinct from old.builtin_key
       or new.provider is distinct from old.provider or new.family_id is distinct from old.family_id then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger calendars_guard before update or delete on public.calendars
  for each row execute function private.calendar_guard();

alter table public.calendars enable row level security;
create policy calendars_update on public.calendars for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy calendars_delete on public.calendars for delete to authenticated
  using ((select private.is_parent_of(family_id)) and source = 'feed');
-- Adding a calendar takes its feed URL, so it goes through an RPC (slice 10); no direct insert.
grant select (id, family_id, name, source, provider, builtin_key, color, owner_user_id, kids_default,
              last_synced_at, last_error, synced_count, sort_order, created_at) on public.calendars to authenticated;
grant update (name, color, kids_default, sort_order) on public.calendars to authenticated;
grant delete on public.calendars to authenticated;

-- Per display: Not here (off), Busy or Title, per calendar.
create table public.device_calendars (
  family_id uuid not null references public.families (id) on delete cascade,
  device_id uuid not null,
  calendar_id uuid not null,
  mode public.display_mode not null default 'busy',
  primary key (family_id, device_id, calendar_id),
  foreign key (device_id, family_id) references public.devices (id, family_id) on delete cascade,
  foreign key (calendar_id, family_id) references public.calendars (id, family_id) on delete cascade
);
-- Display modes are a Family display setting.
create function private.check_device_calendar() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.devices d where d.id = new.device_id and d.family_id = new.family_id and d.job = 'display') then
    raise exception 'calendar display modes are for Family displays' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger device_calendars_display before insert or update of device_id on public.device_calendars
  for each row execute function private.check_device_calendar();

alter table public.device_calendars enable row level security;
create policy device_calendars_select on public.device_calendars for select to authenticated
  using ((select private.is_parent_of(family_id)) or device_id = (select private.my_device_id()));
create policy device_calendars_insert on public.device_calendars for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy device_calendars_update on public.device_calendars for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy device_calendars_delete on public.device_calendars for delete to authenticated
  using ((select private.is_parent_of(family_id)));
grant select, delete on public.device_calendars to authenticated;
grant insert (family_id, device_id, calendar_id, mode) on public.device_calendars to authenticated;
grant update (mode) on public.device_calendars to authenticated;

-- The calling iPad's job (kid or display), or null.
create function private.my_device_job() returns public.device_job
language sql stable security definer
set search_path = ''
as $$
  select d.job from public.devices d
  where private.is_anonymous_session() and d.device_user_id = auth.uid() and d.revoked_at is null
$$;
grant execute on function private.my_device_job() to authenticated;

-- How the calling Family display shows a calendar (A14): its device_calendars mode; built-in
-- calendars (Holidays, Added in The Deck) default to Title, feeds to Not here.
create function private.my_display_mode(cal uuid) returns public.display_mode
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select dc.mode from public.device_calendars dc where dc.calendar_id = cal and dc.device_id = private.my_device_id()),
    (select case when c.source = 'built_in' then 'title' else 'off' end::public.display_mode from public.calendars c where c.id = cal),
    'off')
$$;
grant execute on function private.my_display_mode(uuid) to authenticated;

-- Parents see every calendar. A kid iPad sees calendars whose events can reach kids. A Family
-- display sees the calendars it shows (Busy or Title), nothing set to Not here.
create policy calendars_select on public.calendars for select to authenticated
  using ((select private.is_parent_of(family_id))
         or ((select private.is_device_of(family_id)) and (
               ((select private.my_device_job()) = 'kid' and kids_default <> 'never')
               or ((select private.my_device_job()) = 'display' and private.my_display_mode(id) <> 'off'))));

-- Each parent's own calendar toggles on the phone. Nobody else's, not even the other parent's.
create table public.parent_calendar_prefs (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null,
  calendar_id uuid not null,
  shown boolean not null default true,
  primary key (family_id, user_id, calendar_id),
  foreign key (family_id, user_id) references public.parents (family_id, user_id) on delete cascade,
  foreign key (calendar_id, family_id) references public.calendars (id, family_id) on delete cascade
);
alter table public.parent_calendar_prefs enable row level security;
create policy parent_calendar_prefs_select on public.parent_calendar_prefs for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)));
create policy parent_calendar_prefs_insert on public.parent_calendar_prefs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)));
create policy parent_calendar_prefs_update on public.parent_calendar_prefs for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)))
  with check (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)));
create policy parent_calendar_prefs_delete on public.parent_calendar_prefs for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_parent_of(family_id)));
grant select, delete on public.parent_calendar_prefs to authenticated;
grant insert (family_id, user_id, calendar_id, shown) on public.parent_calendar_prefs to authenticated;
grant update (shown) on public.parent_calendar_prefs to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Events: the calendar they came from, the feed's fields (server-written), and the kid layer.
-- ---------------------------------------------------------------------------------------------

alter table public.events
  add column calendar_id uuid,
  add column external_uid text check (external_uid is null or char_length(external_uid) between 1 and 300),
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column all_day boolean not null default true,
  add column repeats text check (repeats is null or char_length(repeats) <= 80),
  add column synced_at timestamptz,
  -- The kid layer (editable on synced events too).
  add column kid_visibility public.kid_visibility not null default 'inherit',
  add column countdown boolean not null default false,
  add column kid_title text check (kid_title is null or char_length(btrim(kid_title)) between 1 and 40),
  add column kid_icon text check (kid_icon is null or char_length(kid_icon) between 1 and 40),
  add column holiday_key text check (holiday_key is null or char_length(holiday_key) between 1 and 40),
  add column birthday_kid_id uuid,
  add constraint events_id_family unique (id, family_id),
  add constraint events_times check (ends_at is null or starts_at is null or ends_at >= starts_at);

-- Phase 1 events move into the family's "Added in The Deck" calendar with what they meant:
-- kids saw it (a countdown) or they didn't.
update public.events e
   set calendar_id = c.id,
       kid_visibility = case when e.visible_to_kids then 'inherit' else 'hidden' end::public.kid_visibility,
       countdown = e.visible_to_kids
  from public.calendars c
 where c.family_id = e.family_id and c.builtin_key = 'deck';

-- The old column, its policy and its grants go; the new ones are below.
revoke insert, update on public.events from authenticated;
drop policy events_select on public.events;
alter table public.events drop column visible_to_kids;
alter table public.events
  alter column calendar_id set not null,
  add constraint events_calendar_fk foreign key (calendar_id, family_id) references public.calendars (id, family_id) on delete cascade,
  add constraint events_birthday_kid_fk foreign key (birthday_kid_id, family_id) references public.kids (id, family_id) on delete set null (birthday_kid_id);
create unique index events_external on public.events (family_id, calendar_id, external_uid) where external_uid is not null;
create index events_calendar_date on public.events (family_id, calendar_id, on_date);

-- True when kids can see events of this calendar with this override.
create function private.event_kid_visible(cal uuid, vis public.kid_visibility) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when c.builtin_key = 'holidays' then true
      when c.kids_default = 'never' then false
      when vis = 'shown' then true
      when vis = 'hidden' then false
      else c.kids_default = 'shown'
    end
    from public.calendars c where c.id = cal), false)
$$;
grant execute on function private.event_kid_visible(uuid, public.kid_visibility) to authenticated;

-- New events from the app go into the family's "Added in The Deck" calendar. API writes may
-- add to that calendar only; synced events are read-only apart from the kid layer; nothing
-- moves between calendars or families.
create function private.event_guard() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  src public.calendar_source;
  bkey text;
  api boolean := current_setting('role', true) = 'authenticated' and pg_trigger_depth() = 1;
begin
  if tg_op = 'INSERT' and new.calendar_id is null then
    select c.id into new.calendar_id from public.calendars c where c.family_id = new.family_id and c.builtin_key = 'deck';
  end if;
  select c.source, c.builtin_key into src, bkey from public.calendars c
   where c.id = coalesce(new.calendar_id, old.calendar_id) and c.family_id = coalesce(new.family_id, old.family_id);
  if api then
    if tg_op in ('INSERT', 'DELETE') and bkey is distinct from 'deck' then
      raise exception 'synced events are changed in Apple or Google Calendar' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      if new.calendar_id is distinct from old.calendar_id or new.family_id is distinct from old.family_id then
        raise exception 'not allowed' using errcode = '42501';
      end if;
      if src = 'feed' and (new.title, new.icon, new.on_date, new.repeats_yearly, new.external_uid, new.starts_at, new.ends_at, new.all_day, new.repeats)
                 is distinct from (old.title, old.icon, old.on_date, old.repeats_yearly, old.external_uid, old.starts_at, old.ends_at, old.all_day, old.repeats) then
        raise exception 'synced events are changed in Apple or Google Calendar; only the kid layer is editable here' using errcode = '42501';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger events_guard before insert or update or delete on public.events
  for each row execute function private.event_guard();

-- A kid iPad reads events kids can see. A Family display reads only those whose calendar it
-- shows as Title (A14); Busy blocks and hidden events reach it only through a redacting RPC
-- (slice 10), never as rows with titles.
create policy events_select on public.events for select to authenticated
  using ((select private.is_parent_of(family_id))
         or ((select private.is_device_of(family_id)) and private.event_kid_visible(calendar_id, kid_visibility)
             and ((select private.my_device_job()) = 'kid' or private.my_display_mode(calendar_id) = 'title')));

grant insert (family_id, calendar_id, title, icon, on_date, kind, repeats_yearly,
              kid_visibility, countdown, kid_title, kid_icon, holiday_key, birthday_kid_id) on public.events to authenticated;
grant update (title, icon, on_date, kind, repeats_yearly,
              kid_visibility, countdown, kid_title, kid_icon, holiday_key, birthday_kid_id) on public.events to authenticated;

-- The kid layer's "which kids" (no rows = every kid who can see it).
create table public.event_kids (
  family_id uuid not null references public.families (id) on delete cascade,
  event_id uuid not null,
  kid_id uuid not null,
  primary key (family_id, event_id, kid_id),
  foreign key (event_id, family_id) references public.events (id, family_id) on delete cascade,
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
alter table public.event_kids enable row level security;
create policy event_kids_select on public.event_kids for select to authenticated
  using ((select private.is_parent_of(family_id))
         or ((select private.is_device_of(family_id)) and exists (
               select 1 from public.events e where e.id = event_kids.event_id and e.family_id = event_kids.family_id
                 and private.event_kid_visible(e.calendar_id, e.kid_visibility)
                 and ((select private.my_device_job()) = 'kid' or private.my_display_mode(e.calendar_id) = 'title'))));
create policy event_kids_insert on public.event_kids for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy event_kids_delete on public.event_kids for delete to authenticated
  using ((select private.is_parent_of(family_id)));
grant select, delete on public.event_kids to authenticated;
grant insert (family_id, event_id, kid_id) on public.event_kids to authenticated;

revoke execute on function private.family_builtin_calendars() from public, anon, authenticated;
revoke execute on function private.calendar_guard() from public, anon, authenticated;
revoke execute on function private.event_guard() from public, anon, authenticated;
revoke execute on function private.check_device_calendar() from public, anon, authenticated;
