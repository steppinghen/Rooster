-- Slice 9: the kid's own current check-in, 30-day feelings retention, 90-day usage rollup.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
-- Kid A (family 1) has a fresh 'choppy' check-in from the fixture. Add older ones.
insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'flat', 1, now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'pumping', 4, now() - interval '29 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'rolling', 2, now() - interval '31 days');

-- ----- current_checkin -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select feeling::text, size from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$,
  $$values ('choppy'::text, 3::smallint)$$, 'current: the iPad gets the kid''s latest check-in from today');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000cb')$$, 'current: yesterday''s check-in is not "current"');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000cc')$$, 'current: not another family''s kid');
select is_empty('select 1 from public.feelings_checkins', 'current: the history itself stays parent-only');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: a revoked iPad gets nothing');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is_empty($$select * from public.current_checkin('00000000-0000-4000-8000-0000000000ca')$$, 'current: a stranger gets nothing');
reset role;

-- ----- 30-day retention -----
select is(private.purge_old_checkins(), 1, 'retention: one check-in older than 30 days removed');
select is((select count(*)::int from public.feelings_checkins where created_at < now() - interval '30 days'), 0, 'retention: nothing older than 30 days remains');
select is((select count(*)::int from public.feelings_checkins where created_at > now() - interval '30 days'), 4, 'retention: everything newer stays (both families)');
select ok(exists (select 1 from cron.job where jobname = 'deck-purge-checkins'), 'retention: scheduled daily');
select ok(not has_function_privilege('authenticated', 'private.purge_old_checkins()', 'execute'), 'retention: not callable through the API');

-- ----- 90-day usage rollup -----
delete from public.usage_events;
insert into public.usage_events (family_id, kid_id, module_key, action, duration_ms, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'completed', 1000, now() - interval '95 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'completed', 2000, now() - interval '95 days'),
  ('00000000-0000-4000-8000-0000000000f1', null, 'today', 'opened', null, now() - interval '95 days'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'wave_check', 'opened', null, now() - interval '95 days'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'completed', 500, now() - interval '10 days');
delete from public.usage_monthly;
select is(private.rollup_old_usage(), 3, 'rollup: three monthly groups');
select is((select count(*)::int from public.usage_events), 1, 'rollup: only the recent row is still detailed');
select results_eq($$select events, total_duration_ms from public.usage_monthly where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values (2, 3000::bigint)$$, 'rollup: counts and durations add up');
select ok(exists (select 1 from cron.job where jobname = 'deck-rollup-usage'), 'rollup: scheduled daily');

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select results_eq('select count(*)::int from public.usage_monthly', 'values (2)', 'usage_monthly: parent sees their family''s aggregates only');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty('select 1 from public.usage_monthly', 'usage_monthly: devices see none');
select throws_ok($$insert into public.usage_monthly (family_id, month, module_key, action) values ('00000000-0000-4000-8000-0000000000f1', '2026-01-01', 'x', 'opened')$$, '42501', null, 'usage_monthly: nobody writes it through the API');
reset role;

select * from finish();
rollback;
