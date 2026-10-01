-- AUDIT (slices 2-4): every RPC against family 1, as every role that must not act on it; then
-- revocation (is there any way back, does any RPC still work), then the SECURITY INVOKER kid
-- write paths (can a device write through them anything it couldn't write directly?).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create schema audit;
grant usage on schema audit to anon, authenticated;
create function audit.try(q text) returns text language plpgsql set search_path = '' as $$
declare r text;
begin
  begin
    execute q into r;
    raise exception using errcode = 'AUDT0', message = coalesce(r, '');
  exception
    when sqlstate 'AUDT0' then return 'ok ' || sqlerrm;
    when others then return 'err ' || sqlstate;
  end;
end $$;

-- Every family-1-targeted RPC, as the current role. Each call is rolled back.
create function audit.f1_calls() returns table (call text, result text) language sql set search_path = '' as $$
  values
    ('cancel_pairing_code', audit.try($q$select public.cancel_pairing_code('00000000-0000-4000-8000-00000000c001')::text$q$)),
    ('redeem_pairing_code', audit.try($q$select public.redeem_pairing_code('11112222')::text$q$)),
    ('revoke_device', audit.try($q$select public.revoke_device('00000000-0000-4000-8000-000000000dd1')::text$q$)),
    ('save_reset_plan', audit.try($q$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', '{}', '{turtle}')::text$q$)),
    ('save_routine_progress', audit.try($q$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cb', current_date, '{teeth}')::text$q$)),
    ('set_kid_pin', audit.try($q$select public.set_kid_pin('00000000-0000-4000-8000-0000000000ca', '0000')::text$q$)),
    ('verify_kid_pin', audit.try($q$select public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234')::text$q$))
$$;
grant execute on all functions in schema audit to anon, authenticated;

select tests.make_two_families();
insert into public.pairing_codes (id, family_id, code_hash, label) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 4)), 'Den iPad');
delete from public.pairing_attempts;
delete from public.pin_attempts;

-- =============================================================================================
-- 1. The matrix.
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'ok {"ok": false, "reason": "already_paired"}'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'revoked device: every RPC on family 1 is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d2', 'aal1', true);
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'ok {"ok": false, "reason": "already_paired"}'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'other family''s device: every RPC on family 1 is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'ok {"ok": false, "reason": "not_a_device_session"}'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'other family''s parent: every RPC on family 1 is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'ok {"ok": false, "reason": "not_a_device_session"}'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'unlisted user: every RPC on family 1 is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'ok {"ok": false, "reason": "not_a_device_session"}'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'aal1 parent: every RPC on family 1 is refused before MFA');
reset role;
select tests.as_anon();
select results_eq('select call, result from audit.f1_calls() order by call', $$values
  ('cancel_pairing_code', 'err 42501'), ('redeem_pairing_code', 'err 42501'),
  ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'), ('save_routine_progress', 'err 42501'),
  ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'err 42501')$$,
  'anon key: every RPC is denied');
select is(audit.try('select public.server_now()::text') like 'err 42501', true, 'anon key: server_now denied');
select is(audit.try('select public.device_checkin()::text'), 'err 42501', 'anon key: device_checkin denied');
select is(audit.try($$select count(*)::text from public.create_pairing_code('X')$$), 'err 42501', 'anon key: create_pairing_code denied');
reset role;
-- The unpaired anonymous user may legitimately redeem a live code, so redeem is left out here.
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select results_eq($$select call, result from audit.f1_calls() where call <> 'redeem_pairing_code' order by call$$, $$values
  ('cancel_pairing_code', 'err 42501'), ('revoke_device', 'err 42501'), ('save_reset_plan', 'err 42501'),
  ('save_routine_progress', 'err 42501'), ('set_kid_pin', 'err 42501'), ('verify_kid_pin', 'ok {"ok": false, "reason": "not_allowed"}')$$,
  'unpaired anonymous user: every parent and kid RPC on family 1 is refused');
reset role;
-- The family's own iPad: kid paths work, parent paths don't.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq($$select call, result from audit.f1_calls() where call in ('cancel_pairing_code', 'revoke_device', 'set_kid_pin') order by call$$, $$values
  ('cancel_pairing_code', 'err 42501'), ('revoke_device', 'err 42501'), ('set_kid_pin', 'err 42501')$$,
  'own device: no parent RPC works');
select is(audit.try($$select count(*)::text from public.create_pairing_code('X')$$), 'err 42501', 'own device: cannot create pairing codes');
select is(audit.try($$select public.revoke_device('00000000-0000-4000-8000-000000000dd9')::text$$), 'err 42501', 'own device: cannot touch the revoked sibling device either');
reset role;
-- Nonexistent targets fail the same way as other-family targets (no existence oracle).
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select is(audit.try($$select public.revoke_device('00000000-0000-4000-8000-00000000dead')::text$$), 'err 42501', 'other parent: nonexistent device = other family''s device');
select is(audit.try($$select public.cancel_pairing_code('00000000-0000-4000-8000-00000000dead')::text$$), 'err 42501', 'other parent: nonexistent code = other family''s code');
select is(audit.try($$select public.set_kid_pin('00000000-0000-4000-8000-00000000dead', '1111')::text$$), 'err 42501', 'other parent: nonexistent kid = other family''s kid');
reset role;

-- Nothing in family 1 changed.
select ok((select revoked_at is null from public.devices where id = '00000000-0000-4000-8000-000000000dd1'), 'matrix: family 1''s iPad still paired');
select ok((select used_at is null and expires_at > now() from public.pairing_codes where id = '00000000-0000-4000-8000-00000000c001'), 'matrix: family 1''s code still live');
select ok((select extensions.crypt('1234', pin_hash) = pin_hash from public.kids where id = '00000000-0000-4000-8000-0000000000ca'), 'matrix: Kid A''s PIN unchanged');

-- =============================================================================================
-- 2. Revocation is one-way.
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select is(audit.try($$update public.devices set revoked_at = null where id = '00000000-0000-4000-8000-000000000dd9' returning 'x'$$), 'err 42501', 'revocation: a parent cannot un-revoke');
select is(audit.try($$update public.devices set device_user_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-000000000dd1' returning 'x'$$), 'err 42501',
  'revocation: a parent cannot hand a device row to another identity');
select is(audit.try($$insert into public.devices (family_id, device_user_id, label) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d9', 'Back') returning 'x'$$), 'err 42501',
  'revocation: a parent cannot insert device rows directly');
select lives_ok($$select public.revoke_device('00000000-0000-4000-8000-000000000dd9')$$, 'revocation: revoking twice is harmless');
reset role;
select ok((select revoked_at < now() - interval '23 hours' from public.devices where id = '00000000-0000-4000-8000-000000000dd9'), 'revocation: revoking twice keeps the original time');

select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is(audit.try($$update public.devices set label = 'Back again' where device_user_id = '00000000-0000-4000-8000-0000000000d9' returning 'x'$$), 'ok ',
  'revocation: the revoked iPad updates no rows of its own');
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'already_paired', 'revocation: the revoked identity cannot redeem a fresh code');
select is_empty('select 1 from public.kids union all select 1 from public.routines union all select 1 from public.kid_focus union all select 1 from public.family_modules',
  'revocation: the revoked iPad reads no family data');
select results_eq('select role, family_id from public.whoami()', $$values ('revoked'::text, null::uuid)$$, 'revocation: whoami hides the family');
reset role;
select ok((select used_at is null from public.pairing_codes where id = '00000000-0000-4000-8000-00000000c001'), 'revocation: the refused redeem did not burn the code');

select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is((select family_id from public.devices), null, 'revocation: devices hides family_id from a revoked iPad');
reset role;

-- After a parent "forgets" the revoked row, the old identity can pair again with a fresh code.
-- It still needs a parent-issued code, but 004_pairing.sql states the intent that a revoked
-- identity never re-pairs.
delete from public.devices where id = '00000000-0000-4000-8000-000000000dd9';
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'ok', 'false', 'revocation: a forgotten identity cannot re-pair');
reset role;

-- =============================================================================================
-- 3. SECURITY INVOKER kid write paths.
-- =============================================================================================
select results_eq($$select p.proname::text collate "default", p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') collate "default" from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('save_routine_progress', 'save_reset_plan', 'server_now') order by 1$$,
  $$values ('save_reset_plan'::text, false, 'search_path=""'::text), ('save_routine_progress', false, 'search_path=""'), ('server_now', false, 'search_path=""')$$,
  'invoker RPCs: really security invoker, search_path pinned');

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
-- Arrays: nulls, duplicates, unknown ids and a long list collapse to the routine's own ids.
select lives_ok($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000cb', current_date,
  array['teeth', null, 'teeth', 'x'] || array(select 'junk' || g from generate_series(1, 1000) g))$$, 'invoker: a hostile step array is accepted');
select results_eq($$select completed_steps, completed_at is null from public.routine_completions where kid_id = '00000000-0000-4000-8000-0000000000cb'$$,
  $$values ('{teeth}'::text[], true)$$, 'invoker: only the routine''s own step ids are stored, once each');
select is(audit.try($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', null, current_date, '{teeth}')::text$$), 'err 23502', 'invoker: a null kid is refused');
select is(audit.try($$select public.save_routine_progress(null, '00000000-0000-4000-8000-0000000000cb', current_date, '{teeth}')::text$$), 'err 42501', 'invoker: a null routine is refused');
-- Reset plan arrays.
select is(audit.try($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', '{}', array(select 't' || g from generate_series(1, 9) g))::text$$), 'err 23514', 'invoker: more than 8 tools refused');
select is(audit.try($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', array[null::text], '{}')::text$$), 'err 23514', 'invoker: a null body sign refused');
select is(audit.try($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cb', array[''], '{}')::text$$), 'err 23514', 'invoker: an empty body sign refused');
select is(audit.try($$select public.save_reset_plan('00000000-0000-4000-8000-0000000000cc', '{}', '{turtle}')::text$$), 'err 42501', 'invoker: another family''s kid is invisible');
reset role;
-- The upserts never move a row to another kid or family.
select is((select count(*)::int from public.reset_plans where family_id = '00000000-0000-4000-8000-0000000000f2'), 0, 'invoker: no reset plan landed in family 2');
select is((select count(*)::int from public.routine_completions where family_id = '00000000-0000-4000-8000-0000000000f2'), 0, 'invoker: no completion landed in family 2');

-- What the RPC computes, the table still lets a device write directly. The grants include
-- completed_at, so "completed" can be claimed with no steps done and any timestamp; on_date
-- is unbounded either way.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(audit.try($$insert into public.routine_completions (family_id, routine_id, kid_id, on_date, completed_steps, completed_at)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date, '{}', '2099-01-01') returning 'x'$$),
  'err 42501', 'invoker: a device cannot claim a routine complete with no steps done');
select is(audit.try($$select public.save_routine_progress('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date + 3650, '{teeth}')::text$$) like 'err %', true,
  'invoker: progress for a date ten years out is refused');
reset role;

select * from finish();
rollback;
