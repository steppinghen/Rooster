-- AUDIT (Phase 1.5 slice 1): what a locked Family display reads from the calendar tables.
--
-- The brief (parent-screens "Calendar") and the parent's answer A14: "The display's mode per
-- calendar decides (Title, Busy or Not here) ... Filtered in the database." A15: Title applies
-- to events kids can see; anything hidden from kids is Busy/Private on a locked display.
-- So, directly from the tables, a display may read an event's title only when the event is
-- kid-visible AND the display's mode for its calendar is Title. Busy must not reveal the title
-- and Not here must not reveal the event at all. Kid iPads are governed by kid visibility only.
--
-- Plain assertions are blocking. Assertions inside todo() are non-blocking hardening.
-- Fixture: tests.make_phase15(). d1 = Kitchen iPad (Family display), d3 = Kid A's iPad.
--   c1a Family (kids shown)  c1b Grandma's (kids hidden)  c1c Parent A's work (never)
--   d1's modes: c1a Title, c1b Title, c1c Busy.
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
create function pg_temp.d1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d1', 'aal1', true, q) $$;
create function pg_temp.d3(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d3', 'aal1', true, q) $$;

-- ---- controls: Title on a kid-visible calendar shows titles; kid iPads unaffected ------------
select is(pg_temp.d1($$select string_agg(title, ', ' order by title) from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:Soccer practice', 'control: display, Family set to Title, reads the kid-visible Family title');
select is(pg_temp.d3($$select string_agg(title, ', ' order by title) from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:Soccer practice', 'control: kid iPad reads the kid-visible Family title (no display modes apply)');

-- ---- guards that already hold (A14/A15) --------------------------------------------------------
select is(pg_temp.d1($$select count(*)::text from public.events where id = '00000000-0000-4000-8000-00000000e1b0'$$), 'ok:0',
  'display: a hidden Family event (Dentist) is not readable directly, even with Family on Title');
select is(pg_temp.d1($$select count(*)::text from public.events where id = '00000000-0000-4000-8000-00000000e1c0'$$), 'ok:0',
  'display: an inherited Grandma''s event is not readable directly, even with Grandma''s on Title');
select is(pg_temp.d1($$select count(*)::text from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1c'$$), 'ok:0',
  'display: work events (Busy) are not readable directly');
select is(pg_temp.d1($$select count(*)::text from public.events e join public.event_kids k on k.event_id = e.id where e.calendar_id = '00000000-0000-4000-8000-000000000c1c'$$), 'ok:0',
  'display: nor through event_kids');

-- ---- BLOCKING: Busy and Not here are ignored for kid-visible calendars ---------------------------
update public.device_calendars set mode = 'busy'
 where device_id = '00000000-0000-4000-8000-000000000dd1' and calendar_id = '00000000-0000-4000-8000-000000000c1a';

select is(pg_temp.d1($$select string_agg(title, ', ') from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:null', 'display Busy: a calendar the display shows as Busy gives the display no titles (A14)');
select is(pg_temp.d1($$select string_agg(coalesce(kid_title, title), ', ') from public.events e
    join public.calendars c on c.id = e.calendar_id where c.name = 'Family'$$),
  'ok:null', 'display Busy: not through a join on the calendar name either');

update public.device_calendars set mode = 'off'
 where device_id = '00000000-0000-4000-8000-000000000dd1' and calendar_id = '00000000-0000-4000-8000-000000000c1a';

select is(pg_temp.d1($$select count(*)::text from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:0', 'display Not here: a calendar set to Not here gives the display none of its events');
select is(pg_temp.d1($$select count(*)::text from public.event_kids k join public.events e on e.id = k.event_id where e.calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:0', 'display Not here: nor its kid layers');
-- (Promoted from todo: fixed in slice 1 after the review.)
select is(pg_temp.d1($$select count(*)::text from public.calendars where id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:0', 'display Not here: the calendar row itself is not listed');

-- A kid iPad keeps seeing the Family event whatever the display's mode is.
select is(pg_temp.d3($$select string_agg(title, ', ') from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1a'$$),
  'ok:Soccer practice', 'control: the display''s modes never change what a kid iPad sees');

-- ---- non-blocking: display modes on a kid iPad ---------------------------------------------------
-- Display modes are a Family display setting (device page). A parent-written mode row on a kid
-- iPad currently makes the work calendar (kids_default never) visible to that kid iPad.
-- (Written by Parent A through the API, as the phone would: this is the write under test.)
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
-- (Builder, slice 1 fix: this is now refused, which closes the todo below.)
select throws_ok($$insert into public.device_calendars (family_id, device_id, calendar_id, mode) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-000000000c1c', 'title')$$,
  '23514', null, 'a parent can''t give a kid iPad a display mode row');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.d3($$select count(*)::text from public.events where calendar_id = '00000000-0000-4000-8000-000000000c1c'$$),
  'ok:0', 'kid iPad: work events never reach it, even with a display mode row');
-- (Promoted from todo: fixed in slice 1 after the review.)
select is(pg_temp.d3($$select count(*)::text from public.calendars where id = '00000000-0000-4000-8000-000000000c1c'$$),
  'ok:0', 'kid iPad: the work calendar is not listed on a kid iPad, whatever device_calendars says');

-- ---- non-blocking: Realtime timing about calendars kids never see ---------------------------------
-- Payloads are empty, but a change to a calendar no iPad can list (work: never, and no display
-- shows it) still goes to the family topic every iPad hears.
delete from public.device_calendars where calendar_id = '00000000-0000-4000-8000-000000000c1c';
create temp table seen_msgs as select id from realtime.messages;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
update public.calendars set name = 'Parent A''s job' where id = '00000000-0000-4000-8000-000000000c1c';
reset role;
select set_config('request.jwt.claims', '', true);
select ok(exists (select 1 from realtime.messages where id not in (select id from seen_msgs) and topic like '%:00000000-0000-4000-8000-0000000000f1'),
  'control: renaming the work calendar sends a signal');
-- (Promoted from todo: fixed in slice 1 after the review.)
select is_empty($$select 1 from realtime.messages where id not in (select id from seen_msgs) and topic = 'family:00000000-0000-4000-8000-0000000000f1'$$,
  'signals: renaming a calendar no iPad can list tells no iPad');

select * from finish();
rollback;
