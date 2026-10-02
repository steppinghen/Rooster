-- AUDIT (Phase 1.5 slice 1): the other family's parent (Parent B, b1) against family 1, through
-- every new link table, RPC and join. Each attack tries both ways a cross-family link can be
-- made: claiming family 1 (refused by RLS) and claiming family 2 while pointing at a family 1
-- row (refused by the composite foreign keys or a guard). Parent B is a full, MFA-passed parent,
-- so every refusal here is about the family boundary, not about missing powers.
-- Plain assertions are blocking.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();

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
create function pg_temp.b1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000b1', 'aal2', false, q) $$;
create function pg_temp.d2(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d2', 'aal1', true, q) $$;

-- Family 1 ids:  f1, Kid A ca, Kid B cb, Kid C cd, devices dd1 dd3, routines 101 102,
--   calendars c1a c1b c1c, events e1a0 e1d0, meal a1a, deck dc1, Parent A a1.
-- Family 2 ids:  f2, Kid C cc, device dd2, routine 201, calendar c2a, event e2a0, meal a2a, Parent B b1.
-- Kid A's check-in id, captured as postgres (Parent B can't look it up, but could guess it).
create temp table f1_checkin as select id from public.feelings_checkins where kid_id = '00000000-0000-4000-8000-0000000000ca' order by created_at desc limit 1;
grant select on f1_checkin to authenticated;
create temp table attacks (what text, q text);
insert into attacks values
  -- link tables, claiming family 2
  ('add family 1''s kid to its own iPad', $$insert into public.device_kids (family_id, device_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-0000000000ca') returning 'x'$$),
  ('add its kid to family 1''s iPad', $$insert into public.device_kids (family_id, device_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-0000000000cc') returning 'x'$$),
  ('put family 1''s kid on its routine', $$insert into public.routine_kids (family_id, routine_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000ca') returning 'x'$$),
  ('put its kid on family 1''s routine', $$insert into public.routine_kids (family_id, routine_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cc') returning 'x'$$),
  ('show family 1''s calendar on its display', $$insert into public.device_calendars (family_id, device_id, calendar_id, mode) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-000000000c1a', 'title') returning 'x'$$),
  ('show its calendar on family 1''s display', $$insert into public.device_calendars (family_id, device_id, calendar_id, mode) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c2a', 'title') returning 'x'$$),
  ('toggle family 1''s calendar for itself', $$insert into public.parent_calendar_prefs (family_id, user_id, calendar_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c1a') returning 'x'$$),
  ('put family 1''s kid on its event', $$insert into public.event_kids (family_id, event_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000e2a0', '00000000-0000-4000-8000-0000000000ca') returning 'x'$$),
  ('put its kid on family 1''s event', $$insert into public.event_kids (family_id, event_id, kid_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000e1d0', '00000000-0000-4000-8000-0000000000cc') returning 'x'$$),
  ('give family 1''s kid a check-in moment', $$insert into public.checkin_moments (family_id, kid_id, label, at_time) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000ca', 'x', '12:00') returning 'x'$$),
  ('anchor its moment to family 1''s routine', $$insert into public.checkin_moments (family_id, kid_id, label, anchor_routine_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'x', '00000000-0000-4000-8000-000000000101') returning 'x'$$),
  ('note on family 1''s check-in', $$insert into public.feelings_notes (family_id, checkin_id, body) values ('00000000-0000-4000-8000-0000000000f2', (select id from f1_checkin), 'x') returning 'x'$$),
  ('plan family 1''s meal', $$insert into public.dinner_plan (family_id, on_date, kind, meal_id) values ('00000000-0000-4000-8000-0000000000f2', current_date + 9, 'meal', '00000000-0000-4000-8000-000000000a1a') returning 'x'$$),
  ('add an event to family 1''s calendar', $$insert into public.events (family_id, calendar_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000c1a', 'x', current_date) returning 'x'$$),
  ('make family 1''s kid the birthday kid', $$update public.events set birthday_kid_id = '00000000-0000-4000-8000-0000000000ca' where family_id = '00000000-0000-4000-8000-0000000000f2'$$),
  ('save a routine for family 1''s kids', $$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f2', 'x', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', array['00000000-0000-4000-8000-0000000000ca']::uuid[])::text$$),
  ('name family 1''s kid in a step', $$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f2', 'x', 'other', '12:00', '[{"id":"a","text":"A","icon":"star","who":["00000000-0000-4000-8000-0000000000ca"]}]', '{}')::text$$),
  -- claiming family 1
  ('add a kid to family 1''s iPad (as family 1)', $$insert into public.device_kids (family_id, device_id, kid_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-0000000000cb') returning 'x'$$),
  ('change family 1''s display modes (as family 1)', $$insert into public.device_calendars (family_id, device_id, calendar_id, mode) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-000000000c1a', 'title') returning 'x'$$),
  ('add a note in family 1 (as family 1)', $$insert into public.feelings_notes (family_id, checkin_id, body) values ('00000000-0000-4000-8000-0000000000f1', (select id from f1_checkin), 'x') returning 'x'$$),
  ('add a meal to family 1 (as family 1)', $$insert into public.meals (family_id, name) values ('00000000-0000-4000-8000-0000000000f1', 'Poison') returning 'x'$$),
  ('plan family 1''s dinner (as family 1)', $$insert into public.dinner_plan (family_id, on_date, kind) values ('00000000-0000-4000-8000-0000000000f1', current_date + 9, 'none') returning 'x'$$),
  ('add an event to family 1 (as family 1)', $$insert into public.events (family_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', 'x', current_date) returning 'x'$$),
  ('save a routine in family 1', $$select public.save_routine(null, '00000000-0000-4000-8000-0000000000f1', 'x', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$),
  ('rewrite family 1''s routine and its kids', $$select public.save_routine('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000f1', 'x', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$),
  ('rewrite family 1''s routine, claiming family 2', $$select public.save_routine('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000f2', 'x', 'other', '12:00', '[{"id":"a","text":"A","icon":"star"}]', '{}')::text$$);

select ok(pg_temp.b1(a.q) like 'err:%', format('cross-family: Parent B cannot %s (%s)', a.what, pg_temp.b1(a.q))) from attacks a;

-- Updates and deletes on family 1's rows match nothing, including through joins on family 2 rows.
create temp table quiet (what text, q text);
insert into quiet values
  ('rename family 1''s calendars', $$with u as (update public.calendars set name = 'x' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('remove family 1''s calendars', $$with d as (delete from public.calendars where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('hide family 1''s events from its kids', $$with u as (update public.events set kid_visibility = 'hidden' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('hide family 1''s events via a join on its own calendar', $$with u as (update public.events e set kid_visibility = 'hidden' from public.calendars c where c.family_id = '00000000-0000-4000-8000-0000000000f2' and e.family_id <> c.family_id returning 1) select count(*)::text from u$$),
  ('change family 1''s display modes', $$with u as (update public.device_calendars set mode = 'title' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('flip family 1''s parents'' toggles', $$with u as (update public.parent_calendar_prefs set shown = true where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('unlink family 1''s iPad from its kid', $$with d as (delete from public.device_kids where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('unlink family 1''s routines from kids', $$with d as (delete from public.routine_kids where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('drop family 1''s countdown kids', $$with d as (delete from public.event_kids where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('move family 1''s check-in moments', $$with u as (update public.checkin_moments set at_time = '03:00', anchor_routine_id = null where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('delete family 1''s notes', $$with d as (delete from public.feelings_notes where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('rewrite family 1''s meals', $$with u as (update public.meals set name = name || '!' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('wipe family 1''s dinner plan', $$with d as (delete from public.dinner_plan where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  ('change family 1''s settings', $$with u as (update public.families set settings = '{}' where id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('turn on Parent unlock on family 1''s kid iPad', $$with u as (update public.devices set parent_unlock = true, job = 'display' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('restyle family 1''s parents', $$with u as (update public.parents set color = 'orange' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  ('change family 1''s kids'' dock or look switch', $$with u as (update public.kids set can_change_look = false, dock_picks = '{}' where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$);
select is(pg_temp.b1(q.q), 'ok:0', format('cross-family: Parent B''s attempt to %s changes nothing', q.what)) from quiet q;

-- Reads through every 1.5 table and join: nothing of family 1.
select is(pg_temp.b1(format('select count(*)::text from public.%I where family_id = %L', t, '00000000-0000-4000-8000-0000000000f1')), 'ok:0',
  format('cross-family: Parent B reads no family 1 rows from %s', t))
  from unnest(array['routine_kids', 'device_kids', 'checkin_moments', 'feelings_notes', 'calendars', 'device_calendars', 'parent_calendar_prefs',
                    'event_kids', 'meals', 'dinner_plan', 'weather_cache', 'kid_decks', 'sticker_awards', 'display_unlocks', 'events', 'parents', 'devices']) t;
select is(pg_temp.b1($$select count(*)::text from public.event_kids k join public.kids x on x.id = k.kid_id where x.family_id = '00000000-0000-4000-8000-0000000000f1' or k.event_id = '00000000-0000-4000-8000-00000000e1d0'$$),
  'ok:0', 'cross-family: no family 1 kid layer through a join');
select is(pg_temp.d2(format('select count(*)::text from public.%I where family_id = %L', t, '00000000-0000-4000-8000-0000000000f1')), 'ok:0',
  format('cross-family: family 2''s display reads no family 1 rows from %s', t))
  from unnest(array['routine_kids', 'device_kids', 'checkin_moments', 'calendars', 'device_calendars', 'event_kids', 'weather_cache', 'kid_decks', 'sticker_awards', 'events', 'kids']) t;
select is(pg_temp.d2($$select count(*)::text from public.families where id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0', 'cross-family: family 2''s display can''t read family 1''s settings');

-- Nothing in family 1 changed.
select is((select count(*)::int from public.device_kids where family_id = '00000000-0000-4000-8000-0000000000f1'), 1, 'cross-family: family 1''s device_kids intact');
select is((select count(*)::int from public.routine_kids where family_id = '00000000-0000-4000-8000-0000000000f1'), 1, 'cross-family: family 1''s routine_kids intact');
select is((select count(*)::int from public.event_kids where family_id = '00000000-0000-4000-8000-0000000000f1'), 1, 'cross-family: family 1''s event_kids intact');
select is((select name from public.routines where id = '00000000-0000-4000-8000-000000000102'), 'After School', 'cross-family: family 1''s routine intact');

select * from finish();
rollback;
