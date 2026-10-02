-- LOCAL ONLY. Runs on `supabase db reset`; `supabase db push` never sends it to a hosted
-- project. Placeholder data only (Parent A / Parent B / Kid A / Kid B / Kid C).

-- Parent A may sign in locally (the hosted equivalent is the one-off bootstrap insert at Gate 2).
insert into public.parent_allowlist (email, family_id) values ('parent-a@example.test', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Test helpers for pgTAP (supabase/tests) and Playwright fixtures.
-- ---------------------------------------------------------------------------------------------

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Create an auth user directly (bypasses GoTrue; the before_user_created hook does not run).
create or replace function tests.create_user(p_email text default null, p_anonymous boolean default false, p_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(p_id, gen_random_uuid());
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_anonymous,
          case when p_anonymous then '{"provider":"anonymous"}'::jsonb else '{"provider":"email"}'::jsonb end,
          '{}'::jsonb, now(), now(), case when p_anonymous then null else now() end);
  return uid;
end;
$$;

-- Act as a signed-in user for the rest of the transaction.
create or replace function tests.authenticate(p_uid uuid, p_aal text default 'aal2', p_anonymous boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'is_anonymous', p_anonymous)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as a request carrying only the anon key.
create or replace function tests.as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Two-family fixture used by the RLS tests. Fixed ids (last block of hex) keep assertions readable:
--   f1 / f2      families
--   a1           Parent A (family 1)     a2  Parent A2 (family 1; tests use it at aal1)
--   b1           Parent B (family 2)
--   d1 / d9      family 1 iPad / revoked family 1 iPad    d2  family 2 iPad
--   e1           signed-in user on no allowlist and in no family ("stranger")
--   e2           anonymous user that never paired
--   ca / cb      Kid A / Kid B (family 1)     cc  Kid C (family 2)
--   101 / 201    routines (family 1 / family 2)
create or replace function tests.make_two_families()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform tests.create_user('fx-parent-a@example.test', false, '00000000-0000-4000-8000-0000000000a1');
  perform tests.create_user('fx-parent-a2@example.test', false, '00000000-0000-4000-8000-0000000000a2');
  perform tests.create_user('fx-parent-b@example.test', false, '00000000-0000-4000-8000-0000000000b1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d9');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d2');
  perform tests.create_user('fx-stranger@example.test', false, '00000000-0000-4000-8000-0000000000e1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000e2');

  insert into public.families (id, name) values
    ('00000000-0000-4000-8000-0000000000f1', 'Family One'),
    ('00000000-0000-4000-8000-0000000000f2', 'Family Two');
  insert into public.parents (family_id, user_id, display_name) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'Parent A'),
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'Parent A2'),
    ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b1', 'Parent B');
  insert into public.devices (id, family_id, device_user_id, label, revoked_at) values
    ('00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', 'Kitchen iPad', null),
    ('00000000-0000-4000-8000-000000000dd9', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d9', 'Old iPad', now() - interval '1 day'),
    ('00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000d2', 'Their iPad', null);
  insert into public.kids (id, family_id, nickname, age_band, pin_hash, birthday_month, birthday_day) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', 'Kid A', 'reader', extensions.crypt('1234', extensions.gen_salt('bf', 8)), 3, 14),
    ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-0000000000f1', 'Kid B', 'prereader', null, null, null),
    ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', 'Kid C', 'reader', null, null, null);
  insert into public.routines (id, family_id, slot, name, starts_at, steps) values
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1', 'morning', 'Dawn Patrol', '06:30',
      '[{"id":"teeth","text":"Brush teeth","icon":"toothbrush"},{"id":"dress","text":"Get dressed","icon":"shirt"}]'),
    ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f2', 'morning', 'Dawn Patrol', '07:00',
      '[{"id":"teeth","text":"Brush teeth","icon":"toothbrush"}]');
  -- Typed-in events land in each family's "Added in The Deck" calendar (event_guard).
  insert into public.events (id, family_id, title, on_date, kind, kid_visibility, countdown) values
    ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000f1', 'Beach trip', current_date + 12, 'trip', 'inherit', true),
    ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000f1', 'Parents night out', current_date + 3, 'other', 'hidden', false),
    ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-0000000000f2', 'Zoo', current_date + 5, 'trip', 'inherit', true);
  insert into public.feelings_checkins (family_id, kid_id, feeling, size) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'choppy', 3),
    ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'pumping', 2);
  -- New kids already get a focus row from the kids_created trigger (slice 2).
  insert into public.kid_focus (kid_id, family_id, mode) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', 'everything'),
    ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', 'everything')
  on conflict (family_id, kid_id) do nothing;
  insert into public.family_modules (family_id, module_key) values
    ('00000000-0000-4000-8000-0000000000f1', 'routines'), ('00000000-0000-4000-8000-0000000000f1', 'wave_check'),
    ('00000000-0000-4000-8000-0000000000f2', 'routines'), ('00000000-0000-4000-8000-0000000000f2', 'wave_check');
  insert into public.reset_plans (kid_id, family_id, tools) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', '{turtle}');
  insert into public.usage_events (family_id, kid_id, module_key, action) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'opened');
  insert into public.usage_monthly (family_id, month, kid_id, module_key, action, events) values
    ('00000000-0000-4000-8000-0000000000f1', '2026-01-01', '00000000-0000-4000-8000-0000000000ca', 'routines', 'opened', 3),
    ('00000000-0000-4000-8000-0000000000f2', '2026-01-01', '00000000-0000-4000-8000-0000000000cc', 'routines', 'opened', 1);
  insert into public.parent_allowlist (email, family_id, joined_at) values
    ('fx-parent-a@example.test', '00000000-0000-4000-8000-0000000000f1', now()),
    ('fx-invited@example.test', '00000000-0000-4000-8000-0000000000f2', null);
  perform tests.add_phase15_rows();
end;
$$;


-- Phase 1.5 rows for both families, added at the end of make_two_families so every table has
-- rows in both families for the catalog-driven sweeps. Fixed ids (last block of hex):
--   d3 / dd3     Kid A's iPad (job kid, used by Kid A). dd1 Kitchen iPad becomes a Family display.
--   102          After School, Kid A only, finish by bus; 101 Dawn Patrol earns a sticker
--   c1a/c1b/c1c  family 1 calendars: Family (Apple, shown), Grandma's (Apple, hidden),
--                Parent A's work (Google, never); c2a family 2 Family
--   e1a..e1e     synced events; e2a family 2
--   a1a/a1b a2a  meals;   dc1 dc2  decks;   5a10 5a20 5b10  sticker awards;   ee1  an active unlock
create or replace function tests.add_phase15_rows()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  f1 constant uuid := '00000000-0000-4000-8000-0000000000f1';
  f2 constant uuid := '00000000-0000-4000-8000-0000000000f2';
  ka constant uuid := '00000000-0000-4000-8000-0000000000ca';
  kb constant uuid := '00000000-0000-4000-8000-0000000000cb';
  k2 constant uuid := '00000000-0000-4000-8000-0000000000cc';
  monday date := date_trunc('week', current_date)::date;
  checkin uuid;
  checkin2 uuid;
begin
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d3');

  update public.parents set color = 'cyan' where user_id = '00000000-0000-4000-8000-0000000000a1';

  update public.devices set job = 'display', parent_unlock = true where id = '00000000-0000-4000-8000-000000000dd1';
  insert into public.devices (id, family_id, device_user_id, label, job) values
    ('00000000-0000-4000-8000-000000000dd3', f1, '00000000-0000-4000-8000-0000000000d3', 'Kid A''s iPad', 'kid');
  insert into public.device_kids (family_id, device_id, kid_id) values (f1, '00000000-0000-4000-8000-000000000dd3', ka);

  update public.routines set earns_sticker = true where id = '00000000-0000-4000-8000-000000000101';
  insert into public.routines (id, family_id, slot, name, starts_at, steps, days, finish_by, finish_label, earns_sticker) values
    ('00000000-0000-4000-8000-000000000102', f1, 'after_school', 'After School', '15:30',
     jsonb_build_array(jsonb_build_object('id', 'snack', 'text', 'Snack', 'icon', 'apple'),
                       jsonb_build_object('id', 'bag', 'text', 'Unpack bag', 'icon', 'backpack', 'who', jsonb_build_array(ka::text)),
                       jsonb_build_object('id', 'wave', 'text', 'Wave Check', 'icon', 'waves', 'kind', 'wave_check')),
     '{1,2,3,4,5}', '16:15', 'bus', true);
  insert into public.routine_kids (family_id, routine_id, kid_id) values (f1, '00000000-0000-4000-8000-000000000102', ka);

  insert into public.checkin_moments (family_id, kid_id, label, at_time, anchor_routine_id) values
    (f1, ka, 'After school', null, '00000000-0000-4000-8000-000000000102'),
    (f1, ka, 'Bedtime', '19:45', null);

  select id into checkin from public.feelings_checkins where kid_id = ka order by created_at desc limit 1;
  insert into public.feelings_notes (family_id, checkin_id, author_user_id, body) values (f1, checkin, '00000000-0000-4000-8000-0000000000a1', 'A bit teary at breakfast.');
  update public.feelings_notes set author_user_id = '00000000-0000-4000-8000-0000000000a1' where checkin_id = checkin;

  insert into public.calendars (id, family_id, name, source, provider, color, owner_user_id, kids_default) values
    ('00000000-0000-4000-8000-000000000c1a', f1, 'Family', 'feed', 'apple', 'cyan', null, 'shown'),
    ('00000000-0000-4000-8000-000000000c1b', f1, 'Grandma''s', 'feed', 'apple', 'orange', null, 'hidden'),
    ('00000000-0000-4000-8000-000000000c1c', f1, 'Parent A''s work', 'feed', 'google', 'lime', '00000000-0000-4000-8000-0000000000a1', 'never'),
    ('00000000-0000-4000-8000-000000000c2a', f2, 'Family', 'feed', 'apple', 'cyan', null, 'shown');
  insert into private.calendar_feeds (calendar_id, family_id, url) values
    ('00000000-0000-4000-8000-000000000c1a', f1, 'webcal://p00-caldav.icloud.com/published/2/FAKE-FAMILY-ONE'),
    ('00000000-0000-4000-8000-000000000c1b', f1, 'webcal://p00-caldav.icloud.com/published/2/FAKE-GRANDMA-ONE'),
    ('00000000-0000-4000-8000-000000000c1c', f1, 'https://calendar.google.com/calendar/ical/fake-work-one/private-x/basic.ics'),
    ('00000000-0000-4000-8000-000000000c2a', f2, 'webcal://p00-caldav.icloud.com/published/2/FAKE-FAMILY-TWO');
  insert into public.device_calendars (family_id, device_id, calendar_id, mode) values
    (f1, '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c1a', 'title'),
    (f1, '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c1b', 'title'),
    (f1, '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c1c', 'busy');
  insert into public.parent_calendar_prefs (family_id, user_id, calendar_id, shown) values
    (f1, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000c1c', true),
    (f1, '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000c1c', false);

  insert into public.events (id, family_id, calendar_id, external_uid, title, on_date, starts_at, ends_at, all_day, kind, kid_visibility, countdown, kid_title, kid_icon) values
    ('00000000-0000-4000-8000-00000000e1a0', f1, '00000000-0000-4000-8000-000000000c1a', 'fam-soccer', 'Soccer practice', current_date + 1, now() + interval '1 day', now() + interval '1 day 1 hour', false, 'other', 'inherit', false, null, null),
    ('00000000-0000-4000-8000-00000000e1b0', f1, '00000000-0000-4000-8000-000000000c1a', 'fam-dentist', 'Dentist', current_date + 2, null, null, true, 'other', 'hidden', false, null, null),
    ('00000000-0000-4000-8000-00000000e1c0', f1, '00000000-0000-4000-8000-000000000c1b', 'gma-choir', 'Choir rehearsal', current_date, null, null, true, 'other', 'inherit', false, null, null),
    ('00000000-0000-4000-8000-00000000e1d0', f1, '00000000-0000-4000-8000-000000000c1b', 'gma-visit', 'Visit Grandma', current_date + 4, null, null, true, 'trip', 'shown', true, 'Grandma''s house', 'house'),
    ('00000000-0000-4000-8000-00000000e1e0', f1, '00000000-0000-4000-8000-000000000c1c', 'work-review', 'Quarterly review', current_date, now() + interval '2 hours', now() + interval '3 hours', false, 'other', 'shown', false, null, null),
    ('00000000-0000-4000-8000-00000000e2a0', f2, '00000000-0000-4000-8000-000000000c2a', 'fam2-party', 'Party', current_date + 6, null, null, true, 'other', 'inherit', true, null, null);
  insert into public.event_kids (family_id, event_id, kid_id) values (f1, '00000000-0000-4000-8000-00000000e1d0', ka);

  insert into public.meals (id, family_id, name, default_sides, icon) values
    ('00000000-0000-4000-8000-000000000a1a', f1, 'Burgers', 'fries', 'hamburger'),
    ('00000000-0000-4000-8000-000000000a1b', f1, 'Spaghetti', null, 'spaghetti'),
    ('00000000-0000-4000-8000-000000000a2a', f2, 'Tacos', null, 'taco');
  insert into public.dinner_plan (family_id, on_date, kind, meal_id, sides, options) values
    (f1, current_date, 'meal', '00000000-0000-4000-8000-000000000a1a', 'fries', '{}'),
    (f1, current_date + 1, 'undecided', null, null, '{leftovers,out}'),
    (f1, current_date + 2, 'none', null, null, '{}'),
    (f2, current_date, 'meal', '00000000-0000-4000-8000-000000000a2a', null, '{}');

  insert into public.weather_cache (family_id, fetched_at, location, today, days) values
    (f1, now() - interval '20 minutes', '{"lat": 35.31, "lon": -78.79}', '{"code": 61, "high": 58, "low": 47}', '[{"date": "x", "code": 61}]'),
    (f2, now() - interval '13 hours', '{"lat": 40.71, "lon": -74.01}', '{"code": 0, "high": 70, "low": 55}', '[]');

  insert into public.kid_decks (id, family_id, kid_id, week_start, design_key, world) values
    ('00000000-0000-4000-8000-000000000dc1', f1, ka, monday, 'sunset-stripes', 'surf'),
    ('00000000-0000-4000-8000-000000000dc2', f2, k2, monday, 'pine-peaks', 'snow');
  insert into public.sticker_awards (id, family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys, sticker_key, x, y, size, tilt, placed_at) values
    ('00000000-0000-4000-8000-000000005a10', f1, ka, '00000000-0000-4000-8000-000000000dc1', 'routine', '00000000-0000-4000-8000-000000000101', current_date,
     '{surfboard,octopus,shell}', 'octopus', 0.3, 0.5, 90, -8, now()),
    ('00000000-0000-4000-8000-000000005a20', f1, ka, '00000000-0000-4000-8000-000000000dc1', 'routine', '00000000-0000-4000-8000-000000000102', current_date,
     '{wheel,rocket,shamrock}', null, null, null, null, null, null),
    ('00000000-0000-4000-8000-000000005b10', f2, k2, '00000000-0000-4000-8000-000000000dc2', 'routine', '00000000-0000-4000-8000-000000000201', current_date,
     '{peak,goggles,cocoa}', 'cocoa', 0.6, 0.4, 88, 7, now());

  insert into public.display_unlocks (id, family_id, device_id, parent_user_id, expires_at) values
    ('00000000-0000-4000-8000-000000000ee1', f1, '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '2 minutes');

  -- Family 2 gets a row in every 1.5 table too.
  update public.devices set job = 'display', parent_unlock = true where id = '00000000-0000-4000-8000-000000000dd2';
  insert into public.device_kids (family_id, device_id, kid_id) values (f2, '00000000-0000-4000-8000-000000000dd2', k2);
  insert into public.routine_kids (family_id, routine_id, kid_id) values (f2, '00000000-0000-4000-8000-000000000201', k2);
  insert into public.checkin_moments (family_id, kid_id, label, at_time) values (f2, k2, 'Bedtime', '19:30');
  select id into checkin2 from public.feelings_checkins where kid_id = k2 order by created_at desc limit 1;
  insert into public.feelings_notes (family_id, checkin_id, body) values (f2, checkin2, 'Family two note.');
  update public.feelings_notes set author_user_id = '00000000-0000-4000-8000-0000000000b1' where checkin_id = checkin2;
  insert into public.device_calendars (family_id, device_id, calendar_id, mode) values
    (f2, '00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-000000000c2a', 'title');
  insert into public.parent_calendar_prefs (family_id, user_id, calendar_id, shown) values
    (f2, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c2a', true);
  insert into public.event_kids (family_id, event_id, kid_id) values (f2, '00000000-0000-4000-8000-00000000e2a0', k2);
  insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values
    (f2, '00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-0000000000b1', now() + interval '1 minute');
  insert into public.display_unlock_attempts (family_id, device_user_id) values
    (f1, '00000000-0000-4000-8000-0000000000d1'), (f2, '00000000-0000-4000-8000-0000000000d2');
end;
$$;

-- The Phase 1.5 fixture: both families with their 1.5 rows, plus a third kid in family 1
-- (Kid C, id ...cd) so tests prove nothing assumes two kids.
create or replace function tests.make_phase15()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform tests.make_two_families();
  insert into public.kids (id, family_id, nickname, age_band, sort_order)
  values ('00000000-0000-4000-8000-0000000000cd', '00000000-0000-4000-8000-0000000000f1', 'Kid C', 'reader', 2);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
-- The security-definer helpers are for postgres-run fixtures only.
revoke execute on function tests.create_user(text, boolean, uuid) from anon, authenticated;
revoke execute on function tests.make_two_families() from anon, authenticated;
revoke execute on function tests.make_phase15() from anon, authenticated;
revoke execute on function tests.add_phase15_rows() from anon, authenticated;
