-- The Deck: Phase 1.5 slice 1, part 1. Families, kids, parents, devices, routines, check-in
-- moments and Wave Check notes (docs/data-model.md, "new in 1.5"; REVIEW.md A36–A41, A59).
--
-- Kid lists are join tables (routine_kids, device_kids; event_kids in part 2), not uuid
-- arrays, so composite (kid_id, family_id) foreign keys keep every reference inside its family
-- and deleting a kid cleans up after itself (REVIEW.md A40). "No rows" means everyone.

-- ---------------------------------------------------------------------------------------------
-- The list of tables The Deck owns. cleanup_orphans refuses to run if public holds anything
-- else, and the tests check every table is listed (so a new table can't be forgotten in the
-- export or Delete family).
-- ---------------------------------------------------------------------------------------------

create function private.deck_tables() returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    -- Phase 1
    'families', 'parents', 'parent_allowlist', 'devices', 'pairing_codes', 'pairing_attempts', 'kids', 'pin_attempts',
    'routines', 'routine_completions', 'events', 'feelings_checkins', 'reset_plans', 'module_catalog', 'family_modules',
    'kid_focus', 'usage_events', 'usage_monthly',
    -- Phase 1.5
    'routine_kids', 'device_kids', 'checkin_moments', 'feelings_notes',
    'calendars', 'device_calendars', 'parent_calendar_prefs', 'event_kids',
    'meals', 'dinner_plan', 'weather_cache',
    'kid_decks', 'sticker_awards', 'display_unlocks', 'display_unlock_attempts'
  ]::text[]
$$;
revoke execute on function private.deck_tables() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- families.settings: holiday switches, winter dates, the dog (pin and names), the five tip
-- temperatures, the home location for the weather and the units. Absent keys mean the
-- defaults in src/lib/familySettings.ts. Validated here so no client can store anything else.
-- ---------------------------------------------------------------------------------------------

create function private.valid_month_day(s text) returns boolean
language sql immutable
set search_path = ''
as $$
  select s ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
     and substr(s, 4, 2)::int <= case substr(s, 1, 2)::int when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end
$$;

create function private.valid_family_settings(s jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  holiday_keys constant text[] := array['halloween', 'thanksgiving', 'christmas', 'new_year', 'valentines', 'st_patricks', 'easter', 'fourth_of_july', 'birthday'];
  k text;
  v jsonb;
begin
  if jsonb_typeof(s) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(s) loop
    case k
      when 'holidays' then
        -- {"on": bool, "off": ["halloween", ...]}: the master switch and the holidays turned off.
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) x where x not in ('on', 'off')) then return false; end if;
        if v ? 'on' and jsonb_typeof(v -> 'on') <> 'boolean' then return false; end if;
        if v ? 'off' and (jsonb_typeof(v -> 'off') <> 'array'
            or exists (select 1 from jsonb_array_elements(v -> 'off') e where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (holiday_keys)))) then
          return false;
        end if;
      when 'winter' then
        -- {"start": "12-01", "end": "02-29"}; "02-29" means the end of February in any year.
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) x where x not in ('start', 'end')) then return false; end if;
        if exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) <> 'string' or not private.valid_month_day(e.value #>> '{}')) then return false; end if;
      when 'dog' then
        -- {"pin": "season"|"mara"|"costa", "names": {"mara": "...", "costa": "..."}}
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) x where x not in ('pin', 'names')) then return false; end if;
        if v ? 'pin' and coalesce(v ->> 'pin', '') not in ('season', 'mara', 'costa') then return false; end if;
        if v ? 'names' and (jsonb_typeof(v -> 'names') <> 'object'
            or exists (select 1 from jsonb_each(v -> 'names') e where e.key not in ('mara', 'costa')
                         or jsonb_typeof(e.value) <> 'string' or char_length(btrim(e.value #>> '{}')) not between 1 and 24)) then
          return false;
        end if;
      when 'tips' then
        -- The five tip temperatures, coldest first (defaults 35, 45, 65, 75, 85).
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 5
           or exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric not between -40 and 130
                        or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric))
           or exists (select 1 from generate_series(0, 3) i where (v ->> i)::numeric >= (v ->> (i + 1))::numeric) then
          return false;
        end if;
      when 'home' then
        -- The home location for the weather, already rounded to 2 decimals (about 1 km).
        if jsonb_typeof(v) <> 'object' or exists (select 1 from jsonb_object_keys(v) x where x not in ('lat', 'lon'))
           or jsonb_typeof(v -> 'lat') <> 'number' or jsonb_typeof(v -> 'lon') <> 'number'
           or (v ->> 'lat')::numeric not between -90 and 90 or (v ->> 'lon')::numeric not between -180 and 180
           or (v ->> 'lat')::numeric <> round((v ->> 'lat')::numeric, 2) or (v ->> 'lon')::numeric <> round((v ->> 'lon')::numeric, 2) then
          return false;
        end if;
      when 'units' then
        if coalesce(v #>> '{}', '') not in ('f', 'c') or jsonb_typeof(v) <> 'string' then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end;
$$;
grant execute on function private.valid_month_day(text) to authenticated;
grant execute on function private.valid_family_settings(jsonb) to authenticated;

-- The dogs' names are the family's to edit (REVIEW.md A59); new families start with these.
alter table public.families
  add column settings jsonb not null default '{"dog": {"names": {"mara": "Mara", "costa": "Costa"}}}'::jsonb
    check (private.valid_family_settings(settings));

grant update (settings) on public.families to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Module catalog: which modules a parent can put on a kid's dock, and which aren't built yet.
-- ---------------------------------------------------------------------------------------------

alter table public.module_catalog
  add column dock_pick boolean not null default false,
  -- Not built yet: "Phase 2", "Phase 3". Shown as "Comes in Phase N" and can't be picked.
  add column comes_in text check (comes_in is null or char_length(comes_in) between 1 and 20);

update public.module_catalog set dock_pick = true, comes_in = 'Phase 2' where key = 'session';
insert into public.module_catalog (key, label, icon, audience, removable, default_enabled, visible_in, sort_order, dock_pick, comes_in)
values ('tune_shop', 'Tune Shop', 'wrench', 'kid', true, false, '{everything}', 50, true, 'Phase 3');

-- ---------------------------------------------------------------------------------------------
-- Kids: "Can change their look" and the dock picks.
-- ---------------------------------------------------------------------------------------------

alter table public.kids
  add column can_change_look boolean not null default true,
  -- Ordered module keys after Home, My week and Wave Check: up to 3 for readers, 1 for pre-readers.
  add column dock_picks text[] not null default '{}' check (private.short_ids(dock_picks, 3));

create function private.check_dock_picks() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  cap int := 3;
begin
  if new.age_band = 'prereader' then
    cap := 1;
  end if;
  if cardinality(new.dock_picks) > cap then
    raise exception 'dock is full' using errcode = '23514';
  end if;
  if (select count(distinct p) from unnest(new.dock_picks) p) <> cardinality(new.dock_picks) then
    raise exception 'a module can be on the dock once' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.dock_picks) p
    where not exists (select 1 from public.module_catalog c where c.key = p and c.dock_pick and c.comes_in is null)
  ) then
    raise exception 'only built dock modules can be picked' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger kids_dock_picks before insert or update of dock_picks, age_band on public.kids
  for each row execute function private.check_dock_picks();

revoke select, insert, update on public.kids from authenticated;
grant select (id, family_id, nickname, avatar, accent, age_band, default_volume, has_pin, birthday_month, birthday_day, sort_order, created_at,
              can_change_look, dock_picks) on public.kids to authenticated;
grant insert (family_id, nickname, avatar, accent, age_band, default_volume, birthday_month, birthday_day, sort_order,
              can_change_look, dock_picks) on public.kids to authenticated;
grant update (nickname, avatar, accent, age_band, default_volume, birthday_month, birthday_day, sort_order,
              can_change_look, dock_picks) on public.kids to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Parents: the face on the kitchen hub's unlock (initial and color) and the 6-digit parent PIN.
-- ---------------------------------------------------------------------------------------------

alter table public.parents
  add column initial text check (initial is null or (char_length(initial) between 1 and 2 and initial = btrim(initial))),
  add column color public.accent not null default 'lilac',
  -- bcrypt hash of the kitchen hub's 6-digit parent PIN. Never granted to any API role; set on
  -- the phone only (slice 15).
  add column unlock_pin_hash text check (unlock_pin_hash is null or unlock_pin_hash like '$2_$%'),
  add column has_unlock_pin boolean generated always as (unlock_pin_hash is not null) stored;

-- The initial defaults to the first letter of the display name.
create function private.parent_initial() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.initial is null or btrim(new.initial) = '' then
    new.initial := upper(left(btrim(new.display_name), 1));
  end if;
  return new;
end;
$$;
create trigger parents_initial before insert or update of display_name, initial on public.parents
  for each row execute function private.parent_initial();
update public.parents set initial = upper(left(btrim(display_name), 1)) where initial is null;

revoke select, update on public.parents from authenticated;
grant select (family_id, user_id, display_name, created_at, initial, color, has_unlock_pin) on public.parents to authenticated;
grant update (display_name, initial, color) on public.parents to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Devices: the job (Family display or Kid's iPad) and the per-device settings.
-- ---------------------------------------------------------------------------------------------

create type public.device_job as enum ('kid', 'display');
create type public.start_view as enum ('today', 'calendar', 'dinners');

alter table public.devices
  add column job public.device_job not null default 'kid',
  add column start_view public.start_view not null default 'today',
  add column return_to_start boolean not null default true,
  -- Parent unlock: on for displays, off for kid iPads (the phone sets it with the job).
  add column parent_unlock boolean not null default false,
  add column unlock_minutes smallint not null default 2 check (unlock_minutes in (1, 2, 5)),
  add column sound boolean not null default true,
  add column read_aloud boolean not null default true,
  add column dim_at_lights_out boolean not null default true;

revoke select, update on public.devices from authenticated;
grant select (id, family_id, device_user_id, label, ground, paired_at, revoked_at, last_seen_at,
              job, start_view, return_to_start, parent_unlock, unlock_minutes, sound, read_aloud, dim_at_lights_out) on public.devices to authenticated;
grant update (label, ground, job, start_view, return_to_start, parent_unlock, unlock_minutes, sound, read_aloud, dim_at_lights_out) on public.devices to authenticated;

-- The calling iPad's own (unrevoked) devices row id, or null.
create function private.my_device_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select d.id from public.devices d
  where private.is_anonymous_session() and d.device_user_id = auth.uid() and d.revoked_at is null
$$;
grant execute on function private.my_device_id() to authenticated;

-- Kid's iPad: who uses it. One kid opens straight into their profile; several tap their avatar.
create table public.device_kids (
  family_id uuid not null references public.families (id) on delete cascade,
  device_id uuid not null,
  kid_id uuid not null,
  primary key (family_id, device_id, kid_id),
  foreign key (device_id, family_id) references public.devices (id, family_id) on delete cascade,
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
alter table public.device_kids enable row level security;
create policy device_kids_select on public.device_kids for select to authenticated
  using ((select private.is_parent_of(family_id)) or device_id = (select private.my_device_id()));
create policy device_kids_insert on public.device_kids for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy device_kids_delete on public.device_kids for delete to authenticated
  using ((select private.is_parent_of(family_id)));
grant select, delete on public.device_kids to authenticated;
grant insert (family_id, device_id, kid_id) on public.device_kids to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Routines: days, finish by, "Earns a sticker", step kind and who, and the kids it serves.
-- ---------------------------------------------------------------------------------------------

create type public.finish_label as enum ('bus', 'car');

-- Steps: ordered, up to 8, each {id, text, icon, kind?, who?}. kind is "task" (default) or
-- "wave_check"; who is "all" (default: everyone on the routine) or a list of kid ids.
create function private.valid_routine_steps_v2(steps jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(steps) = 'array'
     and jsonb_array_length(steps) between 1 and 8
     and not exists (
       select 1 from jsonb_array_elements(steps) e
       where jsonb_typeof(e) <> 'object'
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('id', 'text', 'icon', 'kind', 'who'))
          or jsonb_typeof(e -> 'id') is distinct from 'string'
          or jsonb_typeof(e -> 'text') is distinct from 'string'
          or jsonb_typeof(e -> 'icon') is distinct from 'string'
          or char_length(e ->> 'id') not between 1 and 40
          or char_length(btrim(e ->> 'text')) not between 1 and 60
          or char_length(e ->> 'icon') not between 1 and 40
          or (e ? 'kind' and coalesce(e ->> 'kind', '') not in ('task', 'wave_check'))
          or (e ? 'who' and not (
                (jsonb_typeof(e -> 'who') = 'string' and e ->> 'who' = 'all')
                or (jsonb_typeof(e -> 'who') = 'array' and jsonb_array_length(e -> 'who') between 1 and 8
                    and not exists (select 1 from jsonb_array_elements(e -> 'who') w
                                    where jsonb_typeof(w) <> 'string'
                                       or (w #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))))
     )
     and (select count(distinct e ->> 'id') from jsonb_array_elements(steps) e) = jsonb_array_length(steps)
$$;
grant execute on function private.valid_routine_steps_v2(jsonb) to authenticated;

alter table public.routines drop constraint routines_steps_check;
alter table public.routines
  add constraint routines_steps_check check (private.valid_routine_steps_v2(steps)),
  -- ISO weekdays, 1 = Monday.
  add column days smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(days) between 1 and 7 and days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add column finish_by time,
  add column finish_label public.finish_label,
  add column earns_sticker boolean not null default false,
  add constraint routines_finish_check check ((finish_by is null) = (finish_label is null));

-- A step's "who" can only name kids of the routine's own family.
create function private.check_routine_step_kids() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(new.steps) e, jsonb_array_elements_text(case when jsonb_typeof(e -> 'who') = 'array' then e -> 'who' else '[]' end) w
    where not exists (select 1 from public.kids k where k.id = w::uuid and k.family_id = new.family_id)
  ) then
    raise exception 'a step can only be for this family''s kids' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger routines_step_kids before insert or update of steps on public.routines
  for each row execute function private.check_routine_step_kids();

create table public.routine_kids (
  family_id uuid not null references public.families (id) on delete cascade,
  routine_id uuid not null,
  kid_id uuid not null,
  primary key (family_id, routine_id, kid_id),
  foreign key (routine_id, family_id) references public.routines (id, family_id) on delete cascade,
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade
);
insert into public.routine_kids (family_id, routine_id, kid_id)
  select family_id, id, kid_id from public.routines where kid_id is not null;

alter table public.routine_kids enable row level security;
create policy routine_kids_select on public.routine_kids for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy routine_kids_insert on public.routine_kids for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy routine_kids_delete on public.routine_kids for delete to authenticated
  using ((select private.is_parent_of(family_id)));
grant select, delete on public.routine_kids to authenticated;
grant insert (family_id, routine_id, kid_id) on public.routine_kids to authenticated;

-- A completion must be for a kid the routine serves (no routine_kids rows = everyone).
create or replace function private.check_completion_kid() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  all_ids text[];
  today date;
begin
  select array(select e ->> 'id' from jsonb_array_elements(r.steps) e) into all_ids
    from public.routines r where r.id = new.routine_id and r.family_id = new.family_id;
  if exists (select 1 from public.routine_kids rk where rk.routine_id = new.routine_id and rk.family_id = new.family_id)
     and not exists (select 1 from public.routine_kids rk where rk.routine_id = new.routine_id and rk.family_id = new.family_id and rk.kid_id = new.kid_id) then
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

revoke insert, update on public.routines from authenticated;
alter table public.routines drop column kid_id;
grant insert (family_id, slot, name, starts_at, steps, sort_order, days, finish_by, finish_label, earns_sticker) on public.routines to authenticated;
grant update (slot, name, starts_at, steps, sort_order, days, finish_by, finish_label, earns_sticker) on public.routines to authenticated;

-- Save a routine and the kids it serves in one go (two writes, so one transaction). Security
-- invoker: RLS and the column grants apply, so only the family's parents get through.
create function public.save_routine(
  p_id uuid, p_family_id uuid, p_name text, p_slot public.routine_slot, p_starts_at time, p_steps jsonb,
  p_kid_ids uuid[], p_days smallint[] default '{1,2,3,4,5,6,7}', p_finish_by time default null,
  p_finish_label public.finish_label default null, p_earns_sticker boolean default false)
returns uuid
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  rid uuid := p_id;
begin
  if rid is null then
    insert into public.routines (family_id, name, slot, starts_at, steps, days, finish_by, finish_label, earns_sticker)
    values (p_family_id, p_name, p_slot, p_starts_at, p_steps, p_days, p_finish_by, p_finish_label, p_earns_sticker)
    returning id into rid;
  else
    update public.routines
       set name = p_name, slot = p_slot, starts_at = p_starts_at, steps = p_steps, days = p_days,
           finish_by = p_finish_by, finish_label = p_finish_label, earns_sticker = p_earns_sticker
     where id = rid and family_id = p_family_id;
    if not found then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    delete from public.routine_kids where routine_id = rid and family_id = p_family_id;
  end if;
  insert into public.routine_kids (family_id, routine_id, kid_id)
    select distinct p_family_id, rid, k from unnest(coalesce(p_kid_ids, '{}')) k;
  return rid;
end;
$$;
revoke execute on function public.save_routine(uuid, uuid, text, public.routine_slot, time, jsonb, uuid[], smallint[], time, public.finish_label, boolean) from public, anon;
grant execute on function public.save_routine(uuid, uuid, text, public.routine_slot, time, jsonb, uuid[], smallint[], time, public.finish_label, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Check-in moments: up to three per kid, at a time or when a routine starts.
-- ---------------------------------------------------------------------------------------------

create table public.checkin_moments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  kid_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 30),
  at_time time,
  anchor_routine_id uuid,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  check (num_nonnulls(at_time, anchor_routine_id) = 1),
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade,
  foreign key (anchor_routine_id, family_id) references public.routines (id, family_id) on delete cascade
);
create index checkin_moments_kid on public.checkin_moments (family_id, kid_id);

create function private.check_checkin_moments() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('checkin_moments:' || new.kid_id::text, 0));
  if (select count(*) from public.checkin_moments m where m.kid_id = new.kid_id and m.family_id = new.family_id and m.id <> new.id) >= 3 then
    raise exception 'a kid has at most three check-in moments' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger checkin_moments_cap before insert or update of kid_id on public.checkin_moments
  for each row execute function private.check_checkin_moments();

alter table public.checkin_moments enable row level security;
create policy checkin_moments_select on public.checkin_moments for select to authenticated
  using ((select private.is_member_of(family_id)));
create policy checkin_moments_insert on public.checkin_moments for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
create policy checkin_moments_update on public.checkin_moments for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy checkin_moments_delete on public.checkin_moments for delete to authenticated
  using ((select private.is_parent_of(family_id)));
grant select, delete on public.checkin_moments to authenticated;
grant insert (family_id, kid_id, label, at_time, anchor_routine_id, sort_order) on public.checkin_moments to authenticated;
grant update (label, at_time, anchor_routine_id, sort_order) on public.checkin_moments to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Wave Check notes (REVIEW.md A37): a parent's note on a kid's check-in, with its author.
-- Parent-only, and gone with the check-in (the same 30-day purge).
-- ---------------------------------------------------------------------------------------------

alter table public.feelings_checkins add constraint feelings_checkins_id_family unique (id, family_id);

create table public.feelings_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  checkin_id uuid not null,
  author_user_id uuid default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  foreign key (checkin_id, family_id) references public.feelings_checkins (id, family_id) on delete cascade,
  foreign key (family_id, author_user_id) references public.parents (family_id, user_id) on delete set null (author_user_id)
);
create index feelings_notes_checkin on public.feelings_notes (family_id, checkin_id);

-- The author is whoever is signed in, never what the client sends.
create function private.feelings_note_author() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
create trigger feelings_notes_author before insert on public.feelings_notes
  for each row execute function private.feelings_note_author();

alter table public.feelings_notes enable row level security;
create policy feelings_notes_select on public.feelings_notes for select to authenticated
  using ((select private.is_parent_of(family_id)));
create policy feelings_notes_insert on public.feelings_notes for insert to authenticated
  with check ((select private.is_parent_of(family_id)));
-- Your own notes; a note whose author has left the family can be deleted by either parent.
create policy feelings_notes_delete on public.feelings_notes for delete to authenticated
  using ((select private.is_parent_of(family_id)) and (author_user_id = (select auth.uid()) or author_user_id is null));
grant select, delete on public.feelings_notes to authenticated;
grant insert (family_id, checkin_id, body) on public.feelings_notes to authenticated;

revoke execute on function private.check_dock_picks() from public, anon, authenticated;
revoke execute on function private.parent_initial() from public, anon, authenticated;
revoke execute on function private.check_routine_step_kids() from public, anon, authenticated;
revoke execute on function private.check_checkin_moments() from public, anon, authenticated;
revoke execute on function private.feelings_note_author() from public, anon, authenticated;
