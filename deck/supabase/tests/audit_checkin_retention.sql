-- AUDIT (slice 9): current_checkin(kid), the 30-day feelings purge, the 90-day usage rollup,
-- and usage_monthly.
--   * current_checkin returns at most one row, only today's (family time zone, both sides of
--     local midnight, at the extremes UTC-12 and UTC+14), only to the kid's own family, and
--     is not moved by the caller's session TimeZone
--   * the purge and the rollup delete exactly the rows past their boundary, in every family,
--     and nothing else; a second rollup run adds nothing; NULL kid_ids merge, not duplicate
--   * usage_monthly: RLS, select-only for parents of the family, no client writes, not published
-- One snapshot for the whole file: the local database is shared with running e2e sessions,
-- whose concurrent commits must not show up between a before/after comparison.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

create schema audit;
grant usage on schema audit to authenticated;
create table audit.expect (tz text, want timestamptz);
grant select on audit.expect to authenticated;

-- For a time zone: put Kid B's (cb) check-ins one second either side of local midnight today.
create function audit.around_midnight(p_tz text) returns void language plpgsql set search_path = '' as $$
declare mid timestamptz;
begin
  update public.families set timezone = p_tz where id = '00000000-0000-4000-8000-0000000000f1';
  mid := ((now() at time zone p_tz)::date)::timestamp at time zone p_tz;
  delete from public.feelings_checkins where kid_id = '00000000-0000-4000-8000-0000000000cb';
  insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'flat', 1, mid - interval '1 second'),
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'rolling', 2, least(mid + interval '1 second', now()));
  delete from audit.expect;
  insert into audit.expect values (p_tz, least(mid + interval '1 second', now()));
end $$;
create function audit.only_yesterday(p_tz text) returns void language plpgsql set search_path = '' as $$
declare mid timestamptz;
begin
  update public.families set timezone = p_tz where id = '00000000-0000-4000-8000-0000000000f1';
  mid := ((now() at time zone p_tz)::date)::timestamp at time zone p_tz;
  delete from public.feelings_checkins where kid_id = '00000000-0000-4000-8000-0000000000cb';
  insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'choppy', 4, mid - interval '1 second'),
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'flat', 1, mid - interval '23 hours');
end $$;

-- ----- current_checkin: local midnight in four time zones -----------------------------------
select audit.around_midnight('UTC');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select feeling::text, created_at from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  $$select 'rolling'::text, want from audit.expect$$, 'current (UTC): one second after local midnight is today; one second before is not');
reset role;
select audit.around_midnight('Pacific/Kiritimati');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select feeling::text, created_at from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  $$select 'rolling'::text, want from audit.expect$$, 'current (UTC+14): local midnight boundary holds');
-- The caller's session TimeZone (PostgREST "Prefer: timezone=") doesn't move the boundary.
set local timezone = 'Etc/GMT+12';
select results_eq($$select feeling::text, created_at from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  $$select 'rolling'::text, want from audit.expect$$, 'current: the caller''s session TimeZone has no effect');
reset timezone;
reset role;
select audit.around_midnight('Etc/GMT+12');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select feeling::text, created_at from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  $$select 'rolling'::text, want from audit.expect$$, 'current (UTC-12): local midnight boundary holds');
reset role;
select audit.around_midnight('America/New_York');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select feeling::text, created_at from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  $$select 'rolling'::text, want from audit.expect$$, 'current (America/New_York): local midnight boundary holds');
reset role;

select audit.only_yesterday('Pacific/Kiritimati');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  'current (UTC+14): nothing from before local midnight, even one second before');
reset role;
select audit.only_yesterday('Etc/GMT+12');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$,
  'current (UTC-12): nothing from before local midnight');
-- A device can't move the family's clock to widen "today".
update public.families set timezone = 'Pacific/Kiritimati' where id = '00000000-0000-4000-8000-0000000000f1';
reset role;
select is((select timezone from public.families where id = '00000000-0000-4000-8000-0000000000f1'), 'Etc/GMT+12',
  'current: a device cannot change the family time zone');
update public.families set timezone = 'UTC' where id = '00000000-0000-4000-8000-0000000000f1';

-- ----- current_checkin: one row only, never history ----------------------------------------
insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at)
  select '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1, now() - make_interval(secs => g)
  from generate_series(1, 5) g;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is((select count(*)::int from public.current_checkin('00000000-0000-4000-8000-0000000000ca')), 1, 'current: exactly one row with six check-ins today');
select results_eq($$select feeling::text, size from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$,
  $$values ('choppy'::text, 3::smallint)$$, 'current: the latest one');
select is_empty('select * from public.current_checkin(null)', 'current: null kid returns nothing');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000cc')$$, 'current: another family''s kid returns nothing');
select is_empty('select 1 from public.feelings_checkins', 'current: the device still cannot read the table');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1, now() + interval '1 day')$$,
  '42501', null, 'current: a device cannot set created_at (no future rows that stay "current" or outlive the purge)');
reset role;
select is(pg_get_function_result('public.current_checkin(uuid)'::regprocedure),
  'TABLE(feeling feeling, size smallint, created_at timestamp with time zone)', 'current: returns feeling, size, time only (no id, moment or family)');
select ok((select prosecdef and 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.current_checkin(uuid)'::regprocedure),
  'current: security definer with empty search_path');

select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: family 2''s parent gets nothing for a family 1 kid');
select is((select count(*)::int from public.current_checkin('00000000-0000-4000-8000-0000000000cc')), 1, 'current (control): family 2''s parent gets their own kid''s');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d2', 'aal1', true);
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: family 2''s iPad gets nothing for a family 1 kid');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: an aal1 parent gets nothing');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: an unpaired anonymous session gets nothing');
reset role;
select tests.as_anon();
select throws_ok($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, '42501', null, 'current: anon role refused');
reset role;
-- Both kids share one iPad identity, so the database can't tell which kid is holding it.
insert into public.feelings_checkins (family_id, kid_id, feeling, size)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'flat', 2);
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is((select count(*)::int from public.current_checkin('00000000-0000-4000-8000-0000000000cb')), 1,
  'current (documents): the shared iPad can read the sibling''s current check-in (PIN is a UI keep-out, Q3)');
reset role;

-- ----- 30-day purge: exact boundary, every family, nothing else ------------------------------
delete from public.feelings_checkins;
insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1, now() - interval '30 days' - interval '1 second'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1, now() - interval '30 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'flat', 1, now() - interval '30 days' + interval '1 second'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'flat', 1, now() - interval '400 days'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'flat', 1, now() - interval '29 days');
create temp table other_before as
  select (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.kids x) kids,
         (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.reset_plans x) plans,
         (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.usage_events x) usage,
         (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.routines x) routines;
select is(private.purge_old_checkins(), 2, 'purge: removes exactly the two rows past 30 days (both families)');
select is_empty($$select 1 from public.feelings_checkins where created_at < now() - interval '30 days'$$, 'purge: nothing older than 30 days remains');
select is((select count(*)::int from public.feelings_checkins), 3, 'purge: the row at exactly 30 days and everything newer stay');
select is(private.purge_old_checkins(), 0, 'purge: a second run removes nothing');
select ok((select kids = (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.kids x)
             and plans = (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.reset_plans x)
             and usage = (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.usage_events x)
             and routines = (select md5(string_agg(to_jsonb(x)::text, ',' order by to_jsonb(x)::text)) from public.routines x)
           from other_before), 'purge: kids, reset plans, usage and routines untouched');

-- ----- 90-day rollup: boundary, idempotence, NULL kids, families kept apart -----------------
delete from public.usage_events;
delete from public.usage_monthly;
insert into public.usage_events (family_id, kid_id, module_key, action, duration_ms, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'completed', 1000, now() - interval '120 days'),
  ('00000000-0000-4000-8000-0000000000f1', null, 'today', 'opened', null, now() - interval '120 days'),
  ('00000000-0000-4000-8000-0000000000f1', null, 'today', 'opened', 50, now() - interval '120 days' + interval '1 minute'),
  ('00000000-0000-4000-8000-0000000000f2', null, 'today', 'opened', 7, now() - interval '120 days'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'routines', 'completed', 9, now() - interval '120 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'session', 'abandoned', 5, now() - interval '90 days' - interval '1 second'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'session', 'abandoned', 5, now() - interval '90 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'session', 'abandoned', 5, now() - interval '90 days' + interval '1 second');
select private.rollup_old_usage();
select is((select count(*)::int from public.usage_events), 2, 'rollup: the rows at exactly 90 days and newer stay detailed');
select is((select sum(events)::int from public.usage_monthly), 6, 'rollup: every rolled row is counted once');
select is((select count(*)::int from public.usage_monthly
  where family_id = '00000000-0000-4000-8000-0000000000f1' and kid_id is null and module_key = 'today'), 1,
  'rollup: NULL kid rows of one family and month form one aggregate');
select results_eq($$select events, total_duration_ms from public.usage_monthly
  where family_id = '00000000-0000-4000-8000-0000000000f1' and kid_id is null and module_key = 'today'$$,
  $$values (2, 50::bigint)$$, 'rollup: NULL durations count as events, not as time');
select results_eq($$select events, total_duration_ms from public.usage_monthly
  where family_id = '00000000-0000-4000-8000-0000000000f2' and kid_id is null$$,
  $$values (1, 7::bigint)$$, 'rollup: another family''s NULL-kid rows stay their own aggregate');

create temp table monthly_after_1 as select * from public.usage_monthly;
select is(private.rollup_old_usage(), 0, 'rollup: a second run rolls nothing');
select is_empty($$(select * from public.usage_monthly except select * from monthly_after_1)
                  union all (select * from monthly_after_1 except select * from public.usage_monthly)$$,
  'rollup: a second run changes no aggregate (no double count)');

-- A late old row for an existing group merges into it (including the NULL-kid group).
insert into public.usage_events (family_id, kid_id, module_key, action, duration_ms, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', null, 'today', 'opened', 10, now() - interval '120 days' + interval '2 minutes');
select is(private.rollup_old_usage(), 1, 'rollup: one late row updates one aggregate');
select results_eq($$select events, total_duration_ms from public.usage_monthly
  where family_id = '00000000-0000-4000-8000-0000000000f1' and kid_id is null and module_key = 'today'$$,
  $$values (3, 60::bigint)$$, 'rollup: merged into the existing NULL-kid aggregate, not a duplicate row');
select is((select count(*)::int from public.usage_monthly), (select count(*)::int from monthly_after_1), 'rollup: no new aggregate row');

-- ----- usage_monthly: who can see and write it ----------------------------------------------
insert into public.usage_monthly (family_id, month, kid_id, module_key, action, events) values
  ('00000000-0000-4000-8000-0000000000f1', '2026-01-01', '00000000-0000-4000-8000-0000000000ca', 'routines', 'opened', 3),
  ('00000000-0000-4000-8000-0000000000f2', '2026-01-01', '00000000-0000-4000-8000-0000000000cc', 'routines', 'opened', 1);
select ok((select relrowsecurity from pg_class where oid = 'public.usage_monthly'::regclass), 'usage_monthly: RLS on');
select ok(not has_table_privilege('anon', 'public.usage_monthly', 'select,insert,update,delete,truncate,references,trigger'), 'usage_monthly: anon has no privilege');
select ok(not has_table_privilege('authenticated', 'public.usage_monthly', 'insert,update,delete,truncate,references,trigger'), 'usage_monthly: authenticated may only select');
select is_empty($$select 1 from pg_publication_tables where tablename in ('usage_monthly', 'usage_events', 'feelings_checkins')$$,
  'usage_monthly: not published to Realtime (nor usage_events, feelings_checkins)');

select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select is_empty($$select 1 from public.usage_monthly where family_id <> '00000000-0000-4000-8000-0000000000f2'$$, 'usage_monthly: family 2''s parent sees no other family');
select throws_ok($$update public.usage_monthly set events = 999$$, '42501', null, 'usage_monthly: a parent cannot inflate aggregates');
select throws_ok($$delete from public.usage_monthly$$, '42501', null, 'usage_monthly: a parent cannot delete aggregates');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty('select 1 from public.usage_monthly', 'usage_monthly: the iPad sees none');
select throws_ok($$update public.usage_monthly set events = 0$$, '42501', null, 'usage_monthly: the iPad cannot update');
select throws_ok($$insert into public.usage_events (family_id, kid_id, module_key, action, created_at)
  values ('00000000-0000-4000-8000-0000000000f1', null, 'today', 'opened', now() - interval '200 days')$$,
  '42501', null, 'usage: an iPad cannot backdate events into the rollup');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is_empty('select 1 from public.usage_monthly', 'usage_monthly: a revoked iPad sees none');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select is_empty('select 1 from public.usage_monthly', 'usage_monthly: an aal1 parent sees none');
reset role;

-- ----- The jobs themselves -------------------------------------------------------------------
select results_eq($$select jobname::text, schedule::text, command::text, username::text, active from cron.job
                    where jobname in ('deck-purge-checkins', 'deck-rollup-usage') order by jobname$$,
  $$values ('deck-purge-checkins', '7 * * * *', 'select private.purge_old_checkins()', 'postgres', true),
           ('deck-rollup-usage', '27 3 * * *', 'select private.rollup_old_usage()', 'postgres', true)$$,
  'jobs: scheduled (purge hourly, rollup daily), active, as postgres, running exactly the private functions');
select ok((select bool_and(prosecdef and 'search_path=""' = any (proconfig)) from pg_proc
  where oid in ('private.purge_old_checkins()'::regprocedure, 'private.rollup_old_usage()'::regprocedure)),
  'jobs: security definer with empty search_path');
select ok(not has_function_privilege('authenticated', 'private.rollup_old_usage()', 'execute')
      and not has_function_privilege('anon', 'private.rollup_old_usage()', 'execute')
      and not has_function_privilege('anon', 'private.purge_old_checkins()', 'execute'),
  'jobs: not callable by API roles');

select * from finish();
rollback;
