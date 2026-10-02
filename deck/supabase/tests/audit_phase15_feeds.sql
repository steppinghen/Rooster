-- AUDIT (Phase 1.5 slice 1): calendar feed URLs are secrets (CLAUDE.md req. 7, acceptance 8,
-- REVIEW.md A57). No client, a parent session included, can read one through a table, a view,
-- an RPC, the export, Realtime or an error message. The secret parts are taken from the stored
-- URLs at run time, so the checks follow whatever the fixture holds.
-- Plain assertions are blocking; todo() blocks are non-blocking hardening.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();

-- The secret fragments: each URL without its scheme, and each distinctive path segment.
create temp table secret_bits as
  select distinct b as bit from private.calendar_feeds f,
    lateral (select regexp_replace(f.url, '^[a-z]+://', '') union all
             select s from unnest(string_to_array(regexp_replace(f.url, '^[a-z]+://[^/]+/', ''), '/')) s
             where char_length(s) >= 8 and s not in ('published', 'basic.ics', 'calendar')) x(b);
grant select on secret_bits to authenticated, anon;
select ok((select count(*) from secret_bits) >= 8, 'setup: the fixture''s feed URLs give secret fragments to look for');
create function pg_temp.leaks(t text) returns boolean language sql stable as $$
  select exists (select 1 from secret_bits s where position(lower(s.bit) in lower(coalesce(t, ''))) > 0)
$$;

create function pg_temp.as_user(uid uuid, aal text, anon boolean) returns void language sql as $$
  select case when uid is null then tests.as_anon() else tests.authenticate(uid, aal, anon) end
$$;
grant execute on function pg_temp.as_user(uuid, text, boolean) to authenticated, anon;

-- ---- privileges: nothing on the table or its columns, for any API role ------------------------------
select ok(not has_table_privilege(r, 'private.calendar_feeds', p), format('feeds: %s has no %s on private.calendar_feeds', r, p))
  from unnest(array['anon', 'authenticated', 'authenticator']) r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p;
select ok(not has_column_privilege(r, 'private.calendar_feeds', 'url', p), format('feeds: %s has no %s on the url column', r, p))
  from unnest(array['anon', 'authenticated', 'authenticator']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p;
select ok((select relrowsecurity from pg_class where oid = 'private.calendar_feeds'::regclass), 'feeds: RLS is on');
select is_empty($$select policyname from pg_policies where schemaname = 'private' and tablename = 'calendar_feeds'$$, 'feeds: no policy opens it');
select is_empty($$select 1 from pg_publication_tables where schemaname = 'private' or tablename = 'calendar_feeds'$$, 'feeds: not in any publication (no postgres_changes)');

-- ---- views and functions: nothing that can hand a URL back ---------------------------------------
select is_empty($$select schemaname || '.' || viewname from pg_views where definition ilike '%calendar_feeds%'
                  union all select schemaname || '.' || matviewname from pg_matviews where definition ilike '%calendar_feeds%'$$,
  'feeds: no view or materialized view reads calendar_feeds');
-- Any function an API role can call that touches calendar_feeds may return only void, a boolean or
-- an id (the slice 10 setter), never text, json or rows.
select is_empty($$
  select n.nspname || '.' || p.proname || ' returns ' || pg_get_function_result(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private', 'graphql_public', 'realtime', 'storage', 'extensions')
    and p.prosrc ilike '%calendar_feeds%'
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
    and (p.proretset or p.prorettype not in ('void'::regtype, 'boolean'::regtype, 'uuid'::regtype))
$$, 'feeds: no API-callable function that reads calendar_feeds returns anything that could carry a URL');
select is_empty($$select tgname from pg_trigger where tgrelid = 'private.calendar_feeds'::regclass and not tgisinternal$$,
  'feeds: no trigger on calendar_feeds (nothing copies a URL elsewhere)');

-- ---- every readable column of every table, as a parent and as the display ------------------------
create function pg_temp.readable_text() returns text language plpgsql as $$
declare t text; cols text; chunk text; acc text := '';
begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p') loop
    select string_agg(quote_ident(a.attname), ',') into cols from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(t))::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege(('public.' || quote_ident(t))::regclass, a.attname, 'SELECT');
    continue when cols is null;
    begin
      execute format('select coalesce(string_agg(row_to_json(r_)::text, ''|''), '''') from (select %s from public.%I) r_', cols, t) into chunk;
      acc := acc || chunk;
    exception when insufficient_privilege then null;
    end;
  end loop;
  return acc;
end $$;
grant execute on function pg_temp.readable_text() to authenticated, anon;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2', false);
create temp table seen_a1 as select pg_temp.readable_text() as t;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a2', 'aal2', false);
create temp table seen_a2 as select pg_temp.readable_text() as t;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
create temp table seen_d1 as select pg_temp.readable_text() as t;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000d3', 'aal1', true);
create temp table seen_d3 as select pg_temp.readable_text() as t;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2', false);
create temp table seen_b1 as select pg_temp.readable_text() as t;
reset role;
select set_config('request.jwt.claims', '', true);

select ok((select char_length(t) > 1000 and t like '%Soccer practice%' from seen_a1), 'control: the column sweep really reads the parent''s data');
select ok(not pg_temp.leaks((select t from seen_a1)), 'feeds: nothing Parent A can read holds any part of a feed URL');
select ok(not pg_temp.leaks((select t from seen_a2)), 'feeds: nor anything Parent A2 can read');
select ok(not pg_temp.leaks((select t from seen_d1)), 'feeds: nor anything the Family display can read');
select ok(not pg_temp.leaks((select t from seen_d3)), 'feeds: nor anything a kid iPad can read');
select ok(not pg_temp.leaks((select t from seen_b1)), 'feeds: nor anything the other family''s parent can read');

-- ---- the export ---------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2', false);
create temp table ex as select public.export_family()::text as doc;
reset role;
select set_config('request.jwt.claims', '', true);
select ok((select doc like '%Grandma%' from ex), 'control: the export holds the calendars');
select ok(not pg_temp.leaks((select doc from ex)), 'feeds: the export holds no part of any feed URL');

-- ---- error messages ---------------------------------------------------------------------------------
-- Failing writes a parent can make on calendars with feeds, and on their events. Message,
-- detail and hint must not echo any part of a URL.
create function pg_temp.err_text(q text) returns text language plpgsql as $$
declare m text; d text; h text;
begin
  begin
    perform tests.authenticate('00000000-0000-4000-8000-0000000000a1');
    execute q;
    perform set_config('role', 'postgres', true);
    return 'no error';
  exception when others then
    get stacked diagnostics m = message_text, d = pg_exception_detail, h = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return coalesce(m, '') || ' / ' || coalesce(d, '') || ' / ' || coalesce(h, '');
  end;
end $$;
create temp table errs as select q, pg_temp.err_text(q) as e from unnest(array[
  $$update public.calendars set name = '' where id = '00000000-0000-4000-8000-000000000c1a'$$,
  $$update public.calendars set name = repeat('x', 60) where id = '00000000-0000-4000-8000-000000000c1b'$$,
  $$update public.calendars set color = 'nope' where id = '00000000-0000-4000-8000-000000000c1c'$$,
  $$update public.calendars set last_error = 'x' where id = '00000000-0000-4000-8000-000000000c1a'$$,
  $$update public.calendars set kids_default = 'hidden' where builtin_key = 'holidays' and family_id = '00000000-0000-4000-8000-0000000000f1'$$,
  $$update public.events set title = 'Renamed' where id = '00000000-0000-4000-8000-00000000e1a0'$$,
  $$update public.events set kid_title = '' where id = '00000000-0000-4000-8000-00000000e1d0'$$,
  $$insert into public.events (family_id, calendar_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000c1b', 'x', current_date)$$,
  $$insert into public.calendars (family_id, name, source, provider) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'feed', 'apple')$$,
  $$insert into public.device_calendars (family_id, device_id, calendar_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000c1a')$$,
  $$insert into public.parent_calendar_prefs (family_id, user_id, calendar_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000c2a')$$,
  $$select url from private.calendar_feeds$$
]) q;
select ok(e <> 'no error', format('setup: this write fails: %s', left(q, 60))) from errs;
select ok(not pg_temp.leaks(e), format('feeds: the error from "%s" holds no part of a URL', left(q, 60))) from errs;

-- ---- Realtime: a burst of calendar changes sends no URL ---------------------------------------------
create temp table seen_msgs as select id from realtime.messages;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2', false);
update public.calendars set name = 'Family (Apple)', kids_default = 'hidden' where id = '00000000-0000-4000-8000-000000000c1a';
update public.device_calendars set mode = 'busy' where calendar_id = '00000000-0000-4000-8000-000000000c1b';
update public.events set kid_title = 'Soccer!' where id = '00000000-0000-4000-8000-00000000e1a0';
delete from public.calendars where id = '00000000-0000-4000-8000-000000000c1c';
reset role;
select set_config('request.jwt.claims', '', true);
select ok((select count(*) from realtime.messages where id not in (select id from seen_msgs)) >= 4, 'control: those changes sent signals');
select ok(not pg_temp.leaks((select string_agg(topic || ' ' || coalesce(payload::text, ''), ' ') from realtime.messages where id not in (select id from seen_msgs))),
  'feeds: no Realtime message holds any part of a URL');
select is((select count(*)::int from private.calendar_feeds where calendar_id = '00000000-0000-4000-8000-000000000c1c'), 0,
  'feeds: removing a calendar from the phone removes its URL');

-- ---- non-blocking: last_error is free text --------------------------------------------------------------
-- The check only refuses a scheme, so a sync error that quotes the host and path (the secret part)
-- would be stored and shown to every device that can list the calendar.
-- (Promoted from todo: fixed in slice 1 after the review.)
select throws_ok($$update public.calendars set last_error = '404 from p00-caldav.icloud.com/published/2/FAKE-FAMILY-ONE' where id = '00000000-0000-4000-8000-000000000c1a'$$,
  '23514', null, 'feeds: last_error refuses a host and path without a scheme');
select throws_ok($$update public.calendars set last_error = 'calendar.google.com/calendar/ical/fake-work-one/private-x/basic.ics' where id = '00000000-0000-4000-8000-000000000c1b'$$,
  '23514', null, 'feeds: last_error refuses a Google secret address without a scheme');

select * from finish();
rollback;
