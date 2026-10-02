-- AUDIT (Phase 1.5 slice 1): "Delete family" stays complete with every 1.5 table.
--
-- Instead of counting rows table by table, this collects every id and email that belongs to
-- family 1 (from every family-1 row in public), then scans the full text of every row of every
-- table in public, private (feed URLs, unlock attempts), auth, realtime, cron, storage and net
-- (when present). After Delete family nothing anywhere may still mention family 1, and every row
-- that didn't mention family 1 before must still be there, byte for byte (the other family and
-- the global rows untouched).
-- Plain assertions are blocking; todo() blocks are non-blocking hardening.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();
update public.parents set unlock_pin_hash = extensions.crypt('246810', extensions.gen_salt('bf', 8))
 where user_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1');

-- Produce some Realtime traffic on every family-1 topic first, so the channels have something to
-- lose: a change signal (family), a parents-only signal (parents) and a revocation (device).
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
update public.parent_calendar_prefs set shown = false where user_id = '00000000-0000-4000-8000-0000000000a1';
update public.dinner_plan set sides = 'salad' where family_id = '00000000-0000-4000-8000-0000000000f1' and kind = 'meal';
select public.revoke_device('00000000-0000-4000-8000-000000000dd3');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---- family 1's identifiers ------------------------------------------------------------------------
create temp table f1_marks (mark text primary key);
do $$
declare t text;
begin
  insert into f1_marks values ('00000000-0000-4000-8000-0000000000f1');
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'family_id' loop
    execute format($q$insert into f1_marks
      select distinct m[1] from public.%I r, regexp_matches(to_jsonb(r)::text, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m
      where r.family_id = '00000000-0000-4000-8000-0000000000f1'
      on conflict do nothing$q$, t);
  end loop;
end $$;
-- The family's people: their emails too.
insert into f1_marks select u.email from auth.users u
  where u.id::text in (select mark from f1_marks) and u.email is not null on conflict do nothing;
-- Drop anything that also belongs to family 2 (there should be nothing; checked below).
create temp table f2_marks (mark text primary key);
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'family_id' loop
    execute format($q$insert into f2_marks
      select distinct m[1] from public.%I r, regexp_matches(to_jsonb(r)::text, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m
      where r.family_id = '00000000-0000-4000-8000-0000000000f2'
      on conflict do nothing$q$, t);
  end loop;
end $$;
select is_empty($$select mark from f1_marks intersect select mark from f2_marks$$, 'setup: no id is shared between the two families');
select ok((select count(*) from f1_marks) >= 40, format('setup: family 1 has %s distinct ids and emails to look for', (select count(*) from f1_marks)));

-- ---- the scanner ------------------------------------------------------------------------------------
create function pg_temp.scan() returns table (tbl text, rowtext text, hits boolean) language plpgsql as $$
declare r record;
begin
  for r in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'private', 'auth', 'realtime', 'cron', 'storage', 'net', 'vault')
             and c.relkind in ('r', 'p') and not c.relispartition order by 1, 2 loop
    begin
      return query execute format(
        'select %L, t::text, exists (select 1 from f1_marks m where position(m.mark in t::text) > 0) from (select to_jsonb(r_) as t from %I.%I r_) s',
        r.nspname || '.' || r.relname, r.nspname, r.relname);
    exception when insufficient_privilege then
      return query select r.nspname || '.' || r.relname, '<unreadable>', null::boolean;
    end;
  end loop;
end $$;

create temp table before_scan as select * from pg_temp.scan();
select is_empty($$select distinct tbl from before_scan where hits is null and split_part(tbl, '.', 1) in ('public', 'private', 'auth', 'realtime', 'cron')$$,
  'setup: every table in public, private, auth, realtime and cron is readable to the scanner');
select ok((select count(distinct tbl) from before_scan where hits) >= 30, format('control: before the delete, family 1 shows up in %s tables', (select count(distinct tbl) from before_scan where hits)));
select ok(exists (select 1 from before_scan where tbl = 'private.calendar_feeds' and hits), 'control: including the feed URLs');
select ok(exists (select 1 from before_scan where tbl = 'public.display_unlock_attempts' and hits), 'control: and the unlock lockout rows');
select ok(exists (select 1 from before_scan where tbl = 'realtime.messages' and hits and rowtext like '%"family:00000000-0000-4000-8000-0000000000f1"%'), 'control: and the family''s Realtime topic');
select ok(exists (select 1 from before_scan where tbl = 'realtime.messages' and hits and rowtext like '%"parents:00000000-0000-4000-8000-0000000000f1"%'), 'control: and the parents'' topic');
select ok(exists (select 1 from before_scan where tbl = 'realtime.messages' and hits and rowtext like '%"device:00000000-0000-4000-8000-0000000000d3"%'), 'control: and Kid A''s iPad''s own topic');
create temp table jobs_before as select jobid, schedule, command from cron.job;

-- ---- Delete family ------------------------------------------------------------------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.delete_family('Family One')$$, 'delete: Parent A deletes family 1');
reset role;
select set_config('request.jwt.claims', '', true);

create temp table after_scan as select * from pg_temp.scan();

-- Nothing anywhere still mentions family 1.
select is_empty($$select tbl || ': ' || left(rowtext, 160) from after_scan where hits$$,
  'delete: no row in public, private, auth, realtime, cron, storage or net mentions any family 1 id or email');
select is_empty($$select 1 from private.calendar_feeds where family_id = '00000000-0000-4000-8000-0000000000f1'$$, 'delete: family 1''s feed URLs are gone');

-- Everything else is untouched (other family, global rows, other users). Realtime messages and
-- cron run history are logs that may grow; everything else must match exactly.
select is_empty($$
  select tbl, rowtext from before_scan where hits = false and tbl not in ('realtime.messages', 'cron.job_run_details')
  except
  select tbl, rowtext from after_scan
$$, 'delete: every row that did not belong to family 1 is still there, unchanged');
select is_empty($$
  select tbl, rowtext from after_scan where tbl not in ('realtime.messages', 'cron.job_run_details')
  except
  select tbl, rowtext from before_scan
$$, 'delete: and nothing new was written anywhere');
select is_empty($$select tbl, rowtext from before_scan where tbl = 'realtime.messages' and hits = false
                  except select tbl, rowtext from after_scan$$,
  'delete: the other family''s Realtime messages are untouched');

-- Scheduled jobs: all global, none per family, none removed or added.
select set_eq($$select jobid, schedule, command from cron.job$$, $$select jobid, schedule, command from jobs_before$$, 'delete: the scheduled jobs are unchanged');
select is_empty($$select jobname from cron.job where command ~ '[0-9a-f]{8}-[0-9a-f]{4}-'$$, 'jobs: no scheduled job is tied to a family');

-- The other family still works end to end.
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select results_eq($$select name from public.calendars order by name$$, $$values ('Added in The Deck'), ('Family'), ('Holidays')$$, 'delete: Parent B still has every calendar');
select ok((select has_unlock_pin from public.parents where user_id = '00000000-0000-4000-8000-0000000000b1'), 'delete: Parent B''s kitchen PIN is still set');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from private.calendar_feeds where family_id = '00000000-0000-4000-8000-0000000000f2'), 1, 'delete: family 2''s feed URL is still there');

select * from finish();
rollback;
