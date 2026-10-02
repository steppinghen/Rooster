-- Slice 4: kid PIN check (server-side compare, lockout), server time, kid-device write paths.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
-- Kid A (ca) has PIN 1234 in the fixture; Kid B (cb) has none.

-- ----- verify_kid_pin -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000cb', null) ->> 'ok', 'true', 'pin: a kid without a PIN opens straight away');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'ok', 'true', 'pin: the right PIN opens the profile');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '0000'), '{"ok": false, "reason": "wrong", "tries_left": 4}'::jsonb, 'pin: a wrong PIN says how many tries are left');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', 'abcd') ->> 'reason', 'wrong', 'pin: non-digits count as wrong');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1111') ->> 'reason', 'wrong', 'pin: wrong 3');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '2222') ->> 'reason', 'wrong', 'pin: wrong 4');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '3333') ->> 'reason', 'wrong', 'pin: wrong 5');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'reason', 'locked', 'pin: after 5 wrong tries even the right PIN waits');
select ok((public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'retry_after_s')::int between 1 and 300, 'pin: the lock lasts at most 5 minutes');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000cc', '1234') ->> 'reason', 'not_allowed', 'pin: not for another family''s kid');
select throws_ok('select pin_hash from public.kids', '42501', null, 'pin: the hash itself is still unreadable');
reset role;
select is((select count(*)::int from public.pin_attempts where kid_id = '00000000-0000-4000-8000-0000000000ca'), 5, 'pin: wrong attempts are kept (not rolled back)');

-- The lock is per device identity: a parent can still open the profile.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'ok', 'true', 'pin: a lock on one iPad does not lock a parent out');
reset role;
-- A parent resetting the PIN clears the lock.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select public.set_kid_pin('00000000-0000-4000-8000-0000000000ca', '5678');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '5678') ->> 'ok', 'true', 'pin: a new PIN clears the lock');
reset role;

select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '5678') ->> 'reason', 'not_allowed', 'pin: a revoked iPad gets nothing');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '5678') ->> 'reason', 'not_allowed', 'pin: a stranger gets nothing');
reset role;

-- ----- server_now -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select ok(abs(extract(epoch from public.server_now() - now())) < 1, 'server_now: returns the database clock');
reset role;
select ok(not has_function_privilege('anon', 'public.server_now()', 'execute'), 'server_now: not for the anon key');

-- ----- save_routine_progress -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select lives_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cb', current_date, '{teeth,not-a-step}')$$,
  'progress: a device records a step');
select results_eq($$select completed_steps, completed_at is null from public.routine_completions where kid_id = '00000000-0000-4000-8000-0000000000cb'$$,
  $$values ('{teeth}'::text[], true)$$, 'progress: unknown step ids are dropped; not complete yet');
select lives_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cb', current_date, '{teeth,dress}')$$,
  'progress: the last step');
select results_eq($$select completed_at is not null from public.routine_completions where kid_id = '00000000-0000-4000-8000-0000000000cb'$$,
  'values (true)', 'progress: completed_at set when every step is done');
select lives_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cb', current_date, '{teeth}')$$,
  'progress: a step can be unticked');
select results_eq($$select completed_at is null from public.routine_completions where kid_id = '00000000-0000-4000-8000-0000000000cb'$$,
  'values (true)', 'progress: unticking clears completed_at');
select throws_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000cc', current_date, '{teeth}')$$,
  '42501', null, 'progress: not on another family''s routine');
select throws_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cc', current_date, '{teeth}')$$,
  '23503', null, 'progress: not for another family''s kid');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select throws_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date, '{teeth}')$$,
  '42501', null, 'progress: a revoked iPad cannot write');
reset role;

-- A routine for one kid can't be completed for the other (the fixture's After School, 102, is
-- Kid A's only, through routine_kids).
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000cb', current_date, '{snack}')$$,
  '23514', null, 'progress: not on a routine assigned to the sibling');

-- ----- save_reset_plan -----
select lives_ok($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', '{hot_face}', '{turtle,balloon}')$$, 'reset plan: a device saves one');
select lives_ok($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', '{heart}', '{balloon}')$$, 'reset plan: and updates it');
select results_eq($$select body_signs, tools from public.reset_plans where kid_id = '00000000-0000-4000-8000-0000000000cb'$$,
  $$values ('{heart}'::text[], '{balloon}'::text[])$$, 'reset plan: saved');
select throws_ok($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cc', '{}', '{x}')$$, '42501', null, 'reset plan: not for another family''s kid');
select throws_ok($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', '{}', array[repeat('x', 500)])$$, '23514', null, 'reset plan: no long blobs');
reset role;

select * from finish();
rollback;
