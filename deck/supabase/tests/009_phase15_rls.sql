-- Phase 1.5 slice 1: every new table, column and rule, attacked from each role.
-- Fixture: tests.make_phase15() (see seed.sql). Roles used below:
--   a1  Parent A (family 1, aal2)     a2  Parent A2 (family 1; aal2 here, to test parent-to-parent privacy)
--   b1  Parent B (family 2)           d1  Kitchen iPad (family 1, Family display)
--   d3  Kid A's iPad (family 1, kid)  d9  revoked family 1 iPad     e1  stranger     anon key
-- Probes always roll back, so every assertion sees the fixture as written.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();

-- Run q as a user; return 'ok:<first value>' or 'err:<sqlstate>'. Always rolled back.
create function pg_temp.probe(uid uuid, aal text, anon boolean, q text) returns text language plpgsql as $$
declare r text;
begin
  begin
    if uid is null then perform tests.as_anon(); else perform tests.authenticate(uid, aal, anon); end if;
    execute q into r;
    raise exception 'probe-done' using detail = coalesce(r, 'null');
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm = 'probe-done' then
      get stacked diagnostics r = pg_exception_detail;
      return 'ok:' || r;
    end if;
    return 'err:' || sqlstate;
  end;
end $$;
create function pg_temp.a1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000a1', 'aal2', false, q) $$;
create function pg_temp.a2(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000a2', 'aal2', false, q) $$;
create function pg_temp.a1_aal1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000a1', 'aal1', false, q) $$;
create function pg_temp.b1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000b1', 'aal2', false, q) $$;
create function pg_temp.d1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d1', 'aal1', true, q) $$;
create function pg_temp.d3(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d3', 'aal1', true, q) $$;
create function pg_temp.d9(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d9', 'aal1', true, q) $$;
create function pg_temp.e1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000e1', 'aal2', false, q) $$;
create function pg_temp.anon(q text) returns text language sql as $$ select pg_temp.probe(null, null, null, q) $$;

-- ---------------------------------------------------------------------------------------------
-- 0. The table list: every table in public is The Deck's and is listed (export, delete, cleanup).
-- ---------------------------------------------------------------------------------------------
select set_eq($$select tablename::text from pg_tables where schemaname = 'public'$$, $$select unnest(private.deck_tables())$$,
  'deck_tables lists exactly the tables in public');
select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity$$,
  'every table in public and private has RLS on (calendar_feeds included)');

-- ---------------------------------------------------------------------------------------------
-- 1. families.settings
-- ---------------------------------------------------------------------------------------------
select is((select settings -> 'dog' -> 'names' ->> 'mara' from public.families where id = '00000000-0000-4000-8000-0000000000f1'), 'Mara',
  'settings: the dogs'' names default to Mara and Costa');
select is(pg_temp.a1($$with u as (update public.families set settings = '{"holidays":{"on":true,"off":["halloween"]},"winter":{"start":"12-01","end":"02-29"},"dog":{"pin":"costa","names":{"mara":"M","costa":"C"}},"tips":[30,40,60,70,80],"home":{"lat":35.31,"lon":-78.79},"units":"f"}' where id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  'ok:1', 'settings: a parent stores every 1.5 key');
select is(pg_temp.a1($$update public.families set settings = '{"surprise": 1}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: unknown key refused');
select is(pg_temp.a1($$update public.families set settings = '{"tips":[45,35,65,75,85]}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: tip temperatures must rise');
select is(pg_temp.a1($$update public.families set settings = '{"home":{"lat":35.30812,"lon":-78.79}}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: the home location must already be rounded to about 1 km');
select is(pg_temp.a1($$update public.families set settings = '{"dog":{"pin":"rex"}}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: dog pin is season, mara or costa');
select is(pg_temp.a1($$update public.families set settings = '{"winter":{"start":"02-30"}}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: winter dates are real days');
select is(pg_temp.a1($$update public.families set settings = '{"holidays":{"off":["arbor_day"]}}' where id = '00000000-0000-4000-8000-0000000000f1'$$), 'err:23514', 'settings: only the nine holidays');
select is(pg_temp.d1($$with u as (update public.families set settings = '{}' where id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  'ok:0', 'settings: a device cannot change them');
select is(pg_temp.b1($$with u as (update public.families set settings = '{}' where id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  'ok:0', 'settings: another family''s parent cannot change them');

-- ---------------------------------------------------------------------------------------------
-- 2. kids: dock picks and "Can change their look"
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.a1($$update public.kids set dock_picks = '{tune_shop}' where id = '00000000-0000-4000-8000-0000000000ca'$$), 'err:23514', 'dock: a module that comes in Phase 3 can''t be picked');
select is(pg_temp.a1($$update public.kids set dock_picks = '{session}' where id = '00000000-0000-4000-8000-0000000000ca'$$), 'err:23514', 'dock: Session (Phase 2) can''t be picked yet');
select is(pg_temp.a1($$update public.kids set dock_picks = '{wave_check}' where id = '00000000-0000-4000-8000-0000000000ca'$$), 'err:23514', 'dock: only dock modules (Wave Check is always there anyway)');
select is(pg_temp.a1($$update public.kids set dock_picks = '{a,b,c,d}' where id = '00000000-0000-4000-8000-0000000000ca'$$), 'err:23514', 'dock: at most three picks');
select is(pg_temp.a1($$with u as (update public.kids set can_change_look = false where id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$$), 'ok:1',
  'look: a parent turns "Can change their look" off');
select is(pg_temp.d3($$with u as (update public.kids set can_change_look = true, dock_picks = '{}' where id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::text from u$$), 'ok:0',
  'look: a kid iPad cannot change it, or the dock, directly');
select is(pg_temp.d3($$select count(*)::text from public.kids where can_change_look$$), 'ok:3', 'kids: an iPad reads its family''s three kids, can_change_look included');

-- ---------------------------------------------------------------------------------------------
-- 3. parents: the face and the kitchen PIN
-- ---------------------------------------------------------------------------------------------
select is((select initial from public.parents where user_id = '00000000-0000-4000-8000-0000000000a1'), 'P', 'parents: the initial defaults to the display name''s first letter');
select is(pg_temp.a1($$select unlock_pin_hash from public.parents limit 1$$), 'err:42501', 'parents: the kitchen PIN hash is unreadable, even by a parent');
select is(pg_temp.a1($$update public.parents set unlock_pin_hash = '$2a$08$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' where user_id = '00000000-0000-4000-8000-0000000000a1'$$), 'err:42501',
  'parents: the kitchen PIN can''t be written directly (slice 15 RPC only)');
select is(pg_temp.a1($$with u as (update public.parents set color = 'orange' where user_id = '00000000-0000-4000-8000-0000000000a2' returning 1) select count(*)::text from u$$), 'ok:0',
  'parents: a parent can''t restyle the other parent''s face');
select is(pg_temp.d1($$select count(*)::text from public.parents$$), 'ok:0', 'parents: the kitchen display can''t list parents (the unlock faces come from an RPC)');

-- ---------------------------------------------------------------------------------------------
-- 4. devices and device_kids
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.d1($$with u as (update public.devices set parent_unlock = true, unlock_minutes = 5, job = 'display' where id = '00000000-0000-4000-8000-000000000dd1' returning 1) select count(*)::text from u$$),
  'ok:0', 'devices: a display can''t change its own job, unlock or re-lock time');
select is(pg_temp.d3($$with u as (update public.devices set parent_unlock = true where id = '00000000-0000-4000-8000-000000000dd3' returning 1) select count(*)::text from u$$),
  'ok:0', 'devices: a kid iPad can''t turn the parent unlock on for itself');
select is(pg_temp.a1($$with u as (update public.devices set sound = false, read_aloud = false, start_view = 'dinners' where id = '00000000-0000-4000-8000-000000000dd1' returning 1) select count(*)::text from u$$),
  'ok:1', 'devices: a parent sets sound, read-aloud and start view');
select is(pg_temp.a1($$update public.devices set unlock_minutes = 3 where id = '00000000-0000-4000-8000-000000000dd1'$$), 'err:23514', 'devices: re-lock after 1, 2 or 5 minutes only');
select is(pg_temp.d3($$select string_agg(kid_id::text, ',') from public.device_kids$$), 'ok:00000000-0000-4000-8000-0000000000ca', 'device_kids: Kid A''s iPad reads that it''s Kid A''s');
select is(pg_temp.d1($$select count(*)::text from public.device_kids$$), 'ok:0', 'device_kids: another iPad doesn''t see it');
select is(pg_temp.d3($$insert into public.device_kids (family_id, device_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-0000000000cb') returning 'x'$$),
  'err:42501', 'device_kids: an iPad can''t add a kid to itself');
select is(pg_temp.a1($$insert into public.device_kids (family_id, device_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-0000000000cc') returning 'x'$$),
  'err:23503', 'device_kids: no kid from another family');
select is(pg_temp.d9($$select count(*)::text from public.device_kids$$), 'ok:0', 'device_kids: a revoked iPad reads nothing');

-- ---------------------------------------------------------------------------------------------
-- 5. routines, routine_kids and save_routine
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'Last Run', 'bedtime', '19:30',
    '[{"id":"pjs","text":"Pajamas","icon":"shirt"},{"id":"wave","text":"Wave Check","icon":"waves","kind":"wave_check"}]',
    array['00000000-0000-4000-8000-0000000000ca','00000000-0000-4000-8000-0000000000cd']::uuid[], '{1,2,3,4,5}', null, null, true) is not null$$), 'ok:true',
  'save_routine: a parent saves a routine for two of three kids');
-- (Counted in a second statement: a statement doesn't see its own function's writes.)
create function pg_temp.save_and_count() returns text language plpgsql as $f$
declare rid uuid;
begin
  rid := public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', array['00000000-0000-4000-8000-0000000000cb']::uuid[]);
  return (select count(*)::text from public.routine_kids where routine_id = rid);
end $f$;
grant execute on function pg_temp.save_and_count() to authenticated;
select is(pg_temp.a1($$select pg_temp.save_and_count()$$), 'ok:1', 'save_routine: writes its kids in the same call');
select is(pg_temp.d1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$),
  'err:42501', 'save_routine: a device is refused');
select is(pg_temp.b1($$select public.save_routine('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1', 'Hijack', 'morning', '06:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$),
  'err:42501', 'save_routine: another family''s parent can''t edit this family''s routine');
select is(pg_temp.a1($$select public.save_routine('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f2', 'Hijack', 'morning', '06:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$),
  'err:42501', 'save_routine: nor the other way round');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', array['00000000-0000-4000-8000-0000000000cc']::uuid[])::text$$),
  'err:23503', 'save_routine: can''t serve another family''s kid');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00',
    (select jsonb_agg(jsonb_build_object('id', 's' || i, 'text', 'Step', 'icon', 'star')) from generate_series(1, 9) i), '{}')::text$$),
  'err:23514', 'routines: at most 8 steps');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00',
    '[{"id":"a","text":"A","icon":"star","who":["00000000-0000-4000-8000-0000000000cc"]}]', '{}')::text$$),
  'err:23514', 'routines: a step''s who can''t name another family''s kid');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star","kind":"quiz"}]', '{}')::text$$),
  'err:23514', 'routines: a step is a task or a Wave Check');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}', '{1,2}', '08:00', null)::text$$),
  'err:23514', 'routines: finish by needs Bus or Car');
select is(pg_temp.a1($$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'X', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}', '{0,8}')::text$$),
  'err:23514', 'routines: days are ISO weekdays');
select is(pg_temp.d3($$select count(*)::text from public.routine_kids$$), 'ok:1', 'routine_kids: an iPad reads who each routine serves (After School: Kid A)');
select is(pg_temp.d3($$insert into public.routine_kids (family_id, routine_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000cb') returning 'x'$$),
  'err:42501', 'routine_kids: an iPad can''t add a kid to a routine');
select is(pg_temp.d3($$select public.save_routine_progress('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000cd', current_date, '{snack}')::text$$),
  'err:23514', 'routines: progress only for a kid the routine serves (Kid C isn''t on After School)');
select is(pg_temp.d3($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cd', current_date, '{teeth}')::text$$),
  'ok:', 'routines: no kids listed means everyone (Kid C on Dawn Patrol)');

-- ---------------------------------------------------------------------------------------------
-- 6. checkin_moments
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.a1($$insert into public.checkin_moments (family_id, kid_id, label, at_time) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'Lunch', '12:00') returning 'x'$$),
  'ok:x', 'moments: a third one is fine');
select is(pg_temp.a1($$with x as (insert into public.checkin_moments (family_id, kid_id, label, at_time) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'Lunch', '12:00'))
    insert into public.checkin_moments (family_id, kid_id, label, at_time) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'Tea', '16:00') returning 'x'$$),
  'err:23514', 'moments: a fourth is refused');
select is(pg_temp.a1($$insert into public.checkin_moments (family_id, kid_id, label) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'Whenever') returning 'x'$$),
  'err:23514', 'moments: a time or a routine, exactly one');
select is(pg_temp.a1($$insert into public.checkin_moments (family_id, kid_id, label, anchor_routine_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'Theirs', '00000000-0000-4000-8000-000000000201') returning 'x'$$),
  'err:23503', 'moments: can''t anchor to another family''s routine');
select is(pg_temp.d3($$select count(*)::text from public.checkin_moments$$), 'ok:2', 'moments: an iPad reads its family''s moments (for the invite)');
select is(pg_temp.d3($$insert into public.checkin_moments (family_id, kid_id, label, at_time) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'Mine', '12:00') returning 'x'$$),
  'err:42501', 'moments: an iPad can''t add one');

-- ---------------------------------------------------------------------------------------------
-- 7. feelings_notes
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.a1($$select count(*)::text from public.feelings_notes$$), 'ok:1', 'notes: a parent reads the family''s notes');
select is(pg_temp.a2($$select string_agg(author_user_id::text, ',') from public.feelings_notes$$), 'ok:00000000-0000-4000-8000-0000000000a1', 'notes: and sees who wrote each one');
select is(pg_temp.a1_aal1($$select count(*)::text from public.feelings_notes$$), 'ok:0', 'notes: nothing before MFA');
select is(pg_temp.d1($$select count(*)::text from public.feelings_notes$$), 'ok:0', 'notes: the kitchen display reads none');
select is(pg_temp.d3($$select count(*)::text from public.feelings_notes$$), 'ok:0', 'notes: a kid iPad reads none');
select is(pg_temp.d3($$insert into public.feelings_notes (family_id, checkin_id, body) select family_id, id, 'kid note' from public.feelings_checkins limit 1 returning 'x'$$),
  'ok:null', 'notes: a kid iPad can''t even find a check-in to attach one to');
select is(pg_temp.a2($$insert into public.feelings_notes (family_id, checkin_id, author_user_id, body)
    select family_id, id, '00000000-0000-4000-8000-0000000000a1', 'pretending' from public.feelings_checkins where family_id = '00000000-0000-4000-8000-0000000000f1' limit 1 returning author_user_id::text$$),
  'err:42501', 'notes: the author can''t be chosen by the client');
select is(pg_temp.a2($$insert into public.feelings_notes (family_id, checkin_id, body)
    select family_id, id, 'mine' from public.feelings_checkins where family_id = '00000000-0000-4000-8000-0000000000f1' limit 1 returning author_user_id::text$$),
  'ok:00000000-0000-4000-8000-0000000000a2', 'notes: the author is whoever is signed in');
select is(pg_temp.a2($$with d as (delete from public.feelings_notes returning 1) select count(*)::text from d$$), 'ok:0', 'notes: a parent can''t delete the other parent''s note');
select is(pg_temp.b1($$select count(*)::text from public.feelings_notes where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'notes: invisible to another family');
select is(pg_temp.b1($$insert into public.feelings_notes (family_id, checkin_id, body) select '00000000-0000-4000-8000-0000000000f2', id, 'x' from public.feelings_checkins where family_id = '00000000-0000-4000-8000-0000000000f2' limit 1 returning 'x'$$),
  'ok:x', 'notes: (control) family 2''s parent writes on their own kid');
select is((select count(*)::int from public.feelings_notes n join public.feelings_checkins c on c.id = n.checkin_id and c.family_id = n.family_id), 2,
  'notes: every note belongs to a check-in in its own family');
-- The 30-day purge takes the notes with the check-ins.
update public.feelings_checkins set created_at = now() - interval '31 days' where kid_id = '00000000-0000-4000-8000-0000000000ca';
select is(private.purge_old_checkins() >= 1, true, 'notes: purge runs');
select is((select count(*)::int from public.feelings_notes where family_id = '00000000-0000-4000-8000-0000000000f1'), 0, 'notes: gone with their 30-day-old check-in');
select is((select count(*)::int from public.feelings_notes where family_id = '00000000-0000-4000-8000-0000000000f2'), 1, 'notes: family 2''s fresh note stays');

-- ---------------------------------------------------------------------------------------------
-- 8. calendars and feed URLs
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.a1($$select count(*)::text from private.calendar_feeds$$), 'err:42501', 'feeds: a parent can''t read feed URLs');
select is(pg_temp.d1($$select count(*)::text from private.calendar_feeds$$), 'err:42501', 'feeds: a display can''t');
select is(pg_temp.anon($$select count(*)::text from private.calendar_feeds$$), 'err:42501', 'feeds: anon can''t');
select is(pg_temp.a1($$insert into private.calendar_feeds (calendar_id, family_id, url) values ('00000000-0000-4000-8000-000000000c1a', '00000000-0000-4000-8000-0000000000f1', 'https://evil.example/x') returning 'x'$$),
  'err:42501', 'feeds: nor write one');
select is(pg_temp.a1($$select count(*)::text from public.calendars$$), 'ok:5', 'calendars: a parent sees all five (two built-in, three feeds)');
select is(pg_temp.d3($$select string_agg(name, ', ' order by name) from public.calendars$$), 'ok:Added in The Deck, Family, Grandma''s, Holidays',
  'calendars: a kid iPad sees every calendar but work (never on kid iPads)');
select is(pg_temp.d1($$select string_agg(name, ', ' order by name) from public.calendars$$), 'ok:Added in The Deck, Family, Grandma''s, Holidays, Parent A''s work',
  'calendars: the kitchen display also sees work, because it shows it as Busy');
select is(pg_temp.a1($$insert into public.calendars (family_id, name, source, provider) values ('00000000-0000-4000-8000-0000000000f1', 'Sneaky', 'feed', 'google') returning 'x'$$),
  'err:42501', 'calendars: adding one takes a feed URL, so it''s RPC-only');
select is(pg_temp.a1($$delete from public.calendars where builtin_key = 'holidays' and family_id = '00000000-0000-4000-8000-0000000000f1' returning 'x'$$),
  'ok:null', 'calendars: built-in calendars can''t be removed (no policy matches)');
select is(pg_temp.a1($$update public.calendars set name = 'Hols', kids_default = 'hidden' where builtin_key = 'holidays' and family_id = '00000000-0000-4000-8000-0000000000f1' returning 'x'$$),
  'err:23514', 'calendars: Holidays always reach kids');
select is(pg_temp.a1($$with u as (update public.calendars set name = 'Our family', color = 'magenta', kids_default = 'hidden' where id = '00000000-0000-4000-8000-000000000c1a' returning 1) select count(*)::text from u$$),
  'ok:1', 'calendars: a parent renames, recolors and sets kids'' default');
select is(pg_temp.a1($$update public.calendars set last_error = 'no' where id = '00000000-0000-4000-8000-000000000c1a'$$), 'err:42501', 'calendars: sync status is server-only');
select is(pg_temp.d1($$with u as (update public.calendars set kids_default = 'shown' returning 1) select count(*)::text from u$$), 'ok:0', 'calendars: a display can''t change a calendar');
select is(pg_temp.b1($$select count(*)::text from public.calendars where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'calendars: invisible to another family');
select is(pg_temp.a1($$with d as (delete from public.calendars where id = '00000000-0000-4000-8000-000000000c1b' returning 1) select count(*)::text from d$$),
  'ok:1', 'calendars: a parent removes a feed calendar');
-- (as postgres, so it sticks) its events, kid layers, display modes and feed URL go with it
delete from public.calendars where id = '00000000-0000-4000-8000-000000000c1b';
select is((select count(*)::int from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1b'), 0, 'calendars: removing one takes its events');
select is((select count(*)::int from public.device_calendars where calendar_id = '00000000-0000-4000-8000-000000000c1b'), 0, 'calendars: and the displays'' modes for it');
select is((select count(*)::int from private.calendar_feeds where calendar_id = '00000000-0000-4000-8000-000000000c1b'), 0, 'feeds: removing a calendar removes its URL');
insert into public.calendars (id, family_id, name, source, provider, color, kids_default) values
  ('00000000-0000-4000-8000-000000000c1b', '00000000-0000-4000-8000-0000000000f1', 'Grandma''s', 'feed', 'apple', 'orange', 'hidden');
insert into public.events (id, family_id, calendar_id, external_uid, title, on_date, kind, kid_visibility, countdown, kid_title, kid_icon) values
  ('00000000-0000-4000-8000-00000000e1c0', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000c1b', 'gma-choir', 'Choir rehearsal', current_date, 'other', 'inherit', false, null, null),
  ('00000000-0000-4000-8000-00000000e1d0', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000c1b', 'gma-visit', 'Visit Grandma', current_date + 4, 'trip', 'shown', true, 'Grandma''s house', 'house');
insert into public.event_kids (family_id, event_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000e1d0', '00000000-0000-4000-8000-0000000000ca');
insert into public.device_calendars (family_id, device_id, calendar_id, mode) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c1b', 'title');
select is(pg_temp.a1($$update public.calendars set last_error = 'oops https://p00-caldav.icloud.com/x' where id = '00000000-0000-4000-8000-000000000c1a'$$), 'err:42501',
  'calendars: (and even the server can''t store a URL in last_error, below)');
select throws_ok($$update public.calendars set last_error = 'failed for webcal://p00-caldav.icloud.com/x' where id = '00000000-0000-4000-8000-000000000c1a'$$, '23514', null,
  'calendars: last_error never holds a link');
select throws_ok($$update public.calendars set last_error = '404 from p00-caldav.icloud.com/published/2/FAKE' where id = '00000000-0000-4000-8000-000000000c1a'$$, '23514', null,
  'calendars: last_error is a fixed code, not free text');
select lives_ok($$update public.calendars set last_error = 'not_found' where id = '00000000-0000-4000-8000-000000000c1a'$$, 'calendars: (control) a fixed code is stored');
select is(pg_temp.a1($$insert into public.device_calendars (family_id, device_id, calendar_id, mode) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-000000000c1a', 'title') returning 'x'$$),
  'err:23514', 'device_calendars: display modes are for Family displays only');

-- device_calendars and parent_calendar_prefs
select is(pg_temp.d1($$select count(*)::text from public.device_calendars$$), 'ok:3', 'device_calendars: the display reads its own modes');
select is(pg_temp.d3($$select count(*)::text from public.device_calendars$$), 'ok:0', 'device_calendars: another iPad reads none of them');
select is(pg_temp.d1($$with u as (update public.device_calendars set mode = 'title' returning 1) select count(*)::text from u$$), 'ok:0', 'device_calendars: a display can''t turn work into Title for itself');
select is(pg_temp.a1($$with u as (update public.device_calendars set mode = 'off' where calendar_id = '00000000-0000-4000-8000-000000000c1c' returning 1) select count(*)::text from u$$), 'ok:1',
  'device_calendars: a parent sets Not here');
select is(pg_temp.a1($$select string_agg(user_id::text, ',') from public.parent_calendar_prefs$$), 'ok:00000000-0000-4000-8000-0000000000a1', 'prefs: a parent sees only their own toggles');
select is(pg_temp.a2($$select string_agg(shown::text, ',') from public.parent_calendar_prefs$$), 'ok:false', 'prefs: the other parent sees theirs');
select is(pg_temp.a1($$with u as (update public.parent_calendar_prefs set shown = true where user_id = '00000000-0000-4000-8000-0000000000a2' returning 1) select count(*)::text from u$$), 'ok:0',
  'prefs: a parent can''t flip the other parent''s toggles');
select is(pg_temp.a1($$insert into public.parent_calendar_prefs (family_id, user_id, calendar_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000c1a') returning 'x'$$),
  'err:42501', 'prefs: nor create them');
select is(pg_temp.d1($$select count(*)::text from public.parent_calendar_prefs$$), 'ok:0', 'prefs: invisible to devices');

-- ---------------------------------------------------------------------------------------------
-- 9. events: who sees what, synced events read-only apart from the kid layer
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.d3($$select string_agg(title, ', ' order by title) from public.events$$), 'ok:Beach trip, Soccer practice, Visit Grandma',
  'events: a kid iPad sees typed-in shown, Family inherited, and Grandma''s shown; not hidden, inherited Grandma''s, or work');
select is(pg_temp.d1($$select count(*)::text from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1c'$$), 'ok:0',
  'events: the display can''t read work events directly (Busy comes from an RPC that hides the title)');
select is(pg_temp.a1($$select count(*)::text from public.events$$), 'ok:7', 'events: a parent sees all of them');
select is(pg_temp.a1($$insert into public.events (family_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', 'Typed in', current_date + 3)
    returning (select builtin_key from public.calendars c where c.id = calendar_id)$$), 'ok:deck', 'events: a new event from the app goes into "Added in The Deck"');
select is(pg_temp.a1($$insert into public.events (family_id, calendar_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000c1a', 'Fake sync', current_date) returning 'x'$$),
  'err:42501', 'events: nothing is added to a synced calendar from the app');
select is(pg_temp.a1($$update public.events set title = 'Renamed' where id = '00000000-0000-4000-8000-00000000e1a0'$$), 'err:42501', 'events: a synced title is read-only');
select is(pg_temp.a1($$update public.events set on_date = current_date + 9 where id = '00000000-0000-4000-8000-00000000e1a0'$$), 'err:42501', 'events: a synced date is read-only');
select is(pg_temp.a1($$with u as (update public.events set kid_visibility = 'hidden', kid_title = 'Soccer!', countdown = true, kind = 'school', kid_icon = 'soccer' where id = '00000000-0000-4000-8000-00000000e1a0' returning 1) select count(*)::text from u$$),
  'ok:1', 'events: the kid layer of a synced event is editable');
select is(pg_temp.a1($$delete from public.events where id = '00000000-0000-4000-8000-00000000e1a0'$$), 'err:42501', 'events: a synced event can''t be deleted from the app');
select is(pg_temp.a1($$update public.events set external_uid = 'x' where id = '00000000-0000-4000-8000-00000000e101'$$), 'err:42501', 'events: feed fields are server-only (no grant)');
select is(pg_temp.a1($$update public.events set calendar_id = '00000000-0000-4000-8000-000000000c1a' where id = '00000000-0000-4000-8000-00000000e101'$$), 'err:42501', 'events: can''t move an event between calendars');
select is(pg_temp.a1($$insert into public.events (family_id, calendar_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000c2a', 'Cross', current_date) returning 'x'$$),
  'err:42501', 'events: can''t point at another family''s calendar (refused by the guard, before the foreign key)');
select is(pg_temp.d3($$with u as (update public.events set kid_visibility = 'shown' where id = '00000000-0000-4000-8000-00000000e1c0' returning 1) select count(*)::text from u$$), 'ok:0',
  'events: an iPad can''t show itself a hidden event');
select is(pg_temp.a1($$update public.events set birthday_kid_id = '00000000-0000-4000-8000-0000000000cc' where id = '00000000-0000-4000-8000-00000000e101'$$), 'err:23503', 'events: birthday kid from this family only');
select is(pg_temp.d3($$select count(*)::text from public.event_kids$$), 'ok:1', 'event_kids: an iPad reads the kid layer''s kids of an event it can see');
select is(pg_temp.d3($$insert into public.event_kids (family_id, event_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000e1d0', '00000000-0000-4000-8000-0000000000cb') returning 'x'$$),
  'err:42501', 'event_kids: an iPad can''t add itself to a countdown');
-- Make Grandma's visit hidden: its event_kids rows disappear from the iPad too.
update public.events set kid_visibility = 'inherit' where id = '00000000-0000-4000-8000-00000000e1d0';
select is(pg_temp.d3($$select count(*)::text from public.event_kids$$), 'ok:0', 'event_kids: rows of an event kids can''t see are hidden');

-- ---------------------------------------------------------------------------------------------
-- 10. meals, dinner_plan, weather_cache
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.d1($$select count(*)::text from public.dinner_plan$$), 'ok:0', 'dinners: the locked kitchen display can''t read the plan (options are weighed there)');
select is(pg_temp.d3($$select count(*)::text from public.dinner_plan$$), 'ok:0', 'dinners: nor can a kid iPad (an RPC without options comes in slice 12)');
select is(pg_temp.d3($$select count(*)::text from public.meals$$), 'ok:0', 'meals: parents-only table');
select is(pg_temp.a1($$select string_agg(array_to_string(options, '+'), ',') from public.dinner_plan where kind = 'undecided'$$), 'ok:leftovers+out', 'dinners: a parent sees the options');
select is(pg_temp.a1($$insert into public.dinner_plan (family_id, on_date, kind) values ('00000000-0000-4000-8000-0000000000f1', current_date + 5, 'meal') returning 'x'$$), 'err:23514', 'dinners: a meal night needs a meal');
select is(pg_temp.a1($$insert into public.dinner_plan (family_id, on_date, kind, options) values ('00000000-0000-4000-8000-0000000000f1', current_date + 5, 'none', '{easy}') returning 'x'$$), 'err:23514', 'dinners: options only on undecided nights');
select is(pg_temp.a1($$insert into public.dinner_plan (family_id, on_date, kind, options) values ('00000000-0000-4000-8000-0000000000f1', current_date + 5, 'undecided', '{pizza}') returning 'x'$$), 'err:23514', 'dinners: options from the fixed list');
select is(pg_temp.a1($$insert into public.dinner_plan (family_id, on_date, kind, meal_id) values ('00000000-0000-4000-8000-0000000000f1', current_date + 5, 'meal', '00000000-0000-4000-8000-000000000a2a') returning 'x'$$), 'err:23503', 'dinners: no meal from another family');
select is(pg_temp.a1($$insert into public.dinner_plan (family_id, on_date, kind, meal_id) values ('00000000-0000-4000-8000-0000000000f1', current_date + 5, 'meal', '00000000-0000-4000-8000-000000000a1b') returning updated_by::text$$),
  'ok:00000000-0000-4000-8000-0000000000a1', 'dinners: a parent plans a night; the server records who');
select is(pg_temp.a1($$insert into public.meals (family_id, name) values ('00000000-0000-4000-8000-0000000000f1', ' burgers ') returning 'x'$$), 'err:23505', 'meals: one favorite per name');
select is(pg_temp.a1($$insert into public.meals (family_id, name, recipe_url) values ('00000000-0000-4000-8000-0000000000f1', 'Soup', 'javascript:alert(1)') returning 'x'$$), 'err:23514', 'meals: recipe links are https only');
select is(pg_temp.a1($$delete from public.meals where id = '00000000-0000-4000-8000-000000000a1a'$$), 'err:23503', 'meals: a meal on the plan can''t be deleted');
select is(pg_temp.b1($$select count(*)::text from public.meals where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'meals: invisible to another family');
select is(pg_temp.d3($$select string_agg(family_id::text, ',') from public.weather_cache$$), 'ok:00000000-0000-4000-8000-0000000000f1', 'weather: an iPad reads its own family''s forecast only');
select is(pg_temp.a1($$update public.weather_cache set fetched_at = now()$$), 'err:42501', 'weather: written by the server job only');
select is(pg_temp.d9($$select count(*)::text from public.weather_cache$$), 'ok:0', 'weather: a revoked iPad reads nothing');

-- ---------------------------------------------------------------------------------------------
-- 11. kid_decks and sticker_awards
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.d3($$select count(*)::text from public.sticker_awards$$), 'ok:2', 'stickers: an iPad reads its family''s awards (to draw the deck)');
select is(pg_temp.d3($$update public.sticker_awards set sticker_key = 'wheel' where id = '00000000-0000-4000-8000-000000005a20'$$), 'err:42501', 'stickers: an iPad can''t pick directly (RPC only, slice 8)');
select is(pg_temp.d3($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{star}') returning 'x'$$),
  'err:42501', 'stickers: an iPad can''t award itself one');
select is(pg_temp.a1($$update public.sticker_awards set x = 0.9 where id = '00000000-0000-4000-8000-000000005a10'$$), 'err:42501', 'stickers: nor can a parent move one');
select is(pg_temp.d3($$update public.kid_decks set rerolls_used = 0$$), 'err:42501', 'decks: rerolls are RPC-only');
select is(pg_temp.b1($$select count(*)::text from public.kid_decks where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'decks: invisible to another family');
-- The rules hold even for the server (the RPCs in slice 8 run as the definer).
insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a,b,c}'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'last_run', gen_random_uuid(), current_date, '{moon}');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a,b,c}')$$,
  '23514', 'four stickers a day', 'stickers: a fifth in a day is refused');
select lives_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(),
   case when extract(isodow from current_date) = 7 then current_date - 1 else current_date + 1 end, '{a,b,c}')$$,
  'stickers: the cap is per day (another day of the same week)');
select throws_ok($$insert into public.sticker_awards (family_id, kid_id, kid_deck_id, source_kind, source_id, award_date, offered_keys) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-000000000dc1', 'routine', gen_random_uuid(), current_date, '{a,b,c}')$$,
  '23514', 'that deck belongs to another kid', 'stickers: only on the kid''s own deck');
select throws_ok($$update public.sticker_awards set sticker_key = 'unicorn' where id = '00000000-0000-4000-8000-000000005a20'$$, '23514', null, 'stickers: only one of the three offered');
select throws_ok($$update public.sticker_awards set sticker_key = 'shell' where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'stickers: a picked sticker stays picked');
select throws_ok($$update public.sticker_awards set x = 0.9 where id = '00000000-0000-4000-8000-000000005a10'$$, '23514', null, 'stickers: a placed sticker never moves');
select throws_ok($$update public.sticker_awards set offered_keys = '{wheel,unicorn,crown}' where id = '00000000-0000-4000-8000-000000005a20'$$, '23514', null, 'stickers: the offer is fixed');
select throws_ok($$update public.sticker_awards set sticker_key = 'wheel', x = 0.5, y = 0.5, size = 90, tilt = 2, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$$, '23514', null,
  'stickers: tilt is 5 to 12 degrees either way');
select throws_ok($$update public.sticker_awards set sticker_key = 'wheel', x = 0.5, y = 0.5, size = 120, tilt = 8, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$$, '23514', null,
  'stickers: 86 to 96 px');
select lives_ok($$update public.sticker_awards set sticker_key = 'wheel', x = 0.5, y = 0.5, size = 90, tilt = -8, placed_at = now() where id = '00000000-0000-4000-8000-000000005a20'$$,
  'stickers: (control) a valid pick and placement');
select throws_ok($$insert into public.kid_decks (family_id, kid_id, week_start, design_key, world) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', date_trunc('week', current_date)::date + 2, 'x', 'surf')$$,
  '23514', null, 'decks: weeks start on Monday');

-- ---------------------------------------------------------------------------------------------
-- 12. display unlocks
-- ---------------------------------------------------------------------------------------------
select is(pg_temp.d1($$select count(*)::text from public.display_unlocks$$), 'ok:0', 'unlock: a display can''t read unlock rows directly');
select is(pg_temp.d1($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '5 minutes') returning 'x'$$),
  'err:42501', 'unlock: a display can''t unlock itself');
select is(pg_temp.a1($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '5 minutes') returning 'x'$$),
  'err:42501', 'unlock: nor can a parent session write one (only the PIN-checking server function)');
select is(pg_temp.a1($$update public.display_unlocks set expires_at = now() + interval '20 minutes'$$), 'err:42501', 'unlock: nobody extends one directly');
select is(pg_temp.a1($$select count(*)::text from public.display_unlocks$$), 'ok:1', 'unlock: a parent sees who unlocked their kitchen');
select is(pg_temp.b1($$select count(*)::text from public.display_unlocks where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'unlock: invisible to another family');
select throws_ok($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '31 minutes')$$,
  '23514', null, 'unlock: never longer than 30 minutes');
select throws_ok($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-0000000000a1', now() + interval '1 minute')$$,
  '23514', null, 'unlock: only a display of the parent''s own family (refused by the unlock rules, before the foreign key)');
select is(pg_temp.a1($$select count(*)::text from public.display_unlock_attempts$$), 'err:42501', 'unlock attempts: no API role reads them');
select is(pg_temp.d1($$insert into public.display_unlock_attempts (family_id, device_user_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1') returning 'x'$$),
  'err:42501', 'unlock attempts: or writes them (a display can''t reset its own lockout)');

-- ---------------------------------------------------------------------------------------------
-- 13. Zero access for the stranger, anon, a revoked iPad and an aal1 parent, on every 1.5 table
-- ---------------------------------------------------------------------------------------------
create temp table t15 as select unnest(array['routine_kids', 'device_kids', 'checkin_moments', 'feelings_notes', 'calendars', 'device_calendars',
  'parent_calendar_prefs', 'event_kids', 'meals', 'dinner_plan', 'weather_cache', 'kid_decks', 'sticker_awards', 'display_unlocks']) as t;
select is(pg_temp.e1(format('select count(*)::text from public.%I', t)), 'ok:0', format('stranger reads nothing from %s', t)) from t15;
select ok(pg_temp.anon(format('select count(*)::text from public.%I', t)) in ('err:42501', 'ok:0'), format('anon reads nothing from %s', t)) from t15;
select is(pg_temp.d9(format('select count(*)::text from public.%I', t)), 'ok:0', format('revoked iPad reads nothing from %s', t)) from t15;
select is(pg_temp.a1_aal1(format('select count(*)::text from public.%I', t)), 'ok:0', format('parent before MFA reads nothing from %s', t)) from t15;

-- ---------------------------------------------------------------------------------------------
-- 14. Realtime signals: parents-only changes never reach the family topic
-- ---------------------------------------------------------------------------------------------
create temp table seen15 as select id from realtime.messages;
create function pg_temp.sent() returns text language sql as $$
  with n as (select topic, payload ->> 'table' as tbl from realtime.messages where id not in (select id from seen15)
             and topic like '%00000000-0000-4000-8000-0000000000f1')
  select coalesce(string_agg(distinct split_part(topic, ':', 1) || ' ' || tbl, ', '), 'nothing') from n
$$;
create function pg_temp.mark() returns void language sql as $$ insert into seen15 select id from realtime.messages where id not in (select id from seen15) $$;
select pg_temp.mark();
insert into public.feelings_notes (family_id, checkin_id, body) select family_id, id, 'n' from public.feelings_checkins where family_id = '00000000-0000-4000-8000-0000000000f2' limit 0;
update public.parent_calendar_prefs set shown = false where user_id = '00000000-0000-4000-8000-0000000000a1';
select is(pg_temp.sent(), 'parents parent_calendar_prefs', 'signals: a parent''s calendar toggle goes to the parents topic only'); select pg_temp.mark();
update public.events set kid_title = 'Choir' where id = '00000000-0000-4000-8000-00000000e1c0';
select is(pg_temp.sent(), 'parents events', 'signals: an event kids can''t see goes to the parents topic only'); select pg_temp.mark();
update public.events set kid_visibility = 'shown' where id = '00000000-0000-4000-8000-00000000e1c0';
select is(pg_temp.sent(), 'family events', 'signals: showing it to kids tells the iPads'); select pg_temp.mark();
update public.events set kid_title = 'Work!' where id = '00000000-0000-4000-8000-00000000e1e0';
select is(pg_temp.sent(), 'parents events', 'signals: work events stay parents-only even when marked shown'); select pg_temp.mark();
update public.dinner_plan set options = '{easy}' where family_id = '00000000-0000-4000-8000-0000000000f1' and kind = 'undecided';
select is(pg_temp.sent(), 'family dinner_plan', 'signals: dinner changes tell the iPads (no content)'); select pg_temp.mark();
update public.devices set last_seen_at = now() where id = '00000000-0000-4000-8000-000000000dd1';
select is(pg_temp.sent(), 'nothing', 'signals: last seen is not a signal'); select pg_temp.mark();
update public.devices set start_view = 'calendar' where id = '00000000-0000-4000-8000-000000000dd1';
select is(pg_temp.sent(), 'family devices', 'signals: a device setting is'); select pg_temp.mark();
select is_empty($$select 1 from realtime.messages where id not in (select id from seen15) or payload::text ~* '(https?|webcal)://|caldav|teary|Choir'$$,
  'signals: no message carries data (no titles, notes or links)');

select * from finish();
rollback;
