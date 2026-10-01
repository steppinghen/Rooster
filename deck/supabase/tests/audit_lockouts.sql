-- AUDIT (slices 3 and 4): the pairing-code and kid-PIN lockouts. Does a failed attempt really
-- persist, can either lockout be sidestepped, and does either RPC leak another family's state?
--
-- The read-only attack: PostgREST runs GET /rest/v1/rpc/<fn> in a READ ONLY transaction, even
-- for VOLATILE functions (checked live: GET .../rpc/redeem_pairing_code?p_code=00000000 returns
-- 405 {"code":"25006","message":"cannot execute INSERT in a read-only transaction"}, and no
-- pairing_attempts row is written). Both RPCs compare the secret first and write afterwards,
-- with a different statement on each branch, so the error message says whether the guess was
-- right and nothing is recorded. audit.ro() reproduces that transaction mode in SQL.
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
-- Like PostgREST GET: run q in read-only mode (inside a rolled-back subtransaction).
create function audit.ro(q text) returns text language plpgsql set search_path = '' as $$
declare r text;
begin
  begin
    perform pg_catalog.set_config('transaction_read_only', 'on', true);
    execute q into r;
    raise exception using errcode = 'AUDT0', message = coalesce(r, '');
  exception
    when sqlstate 'AUDT0' then return 'ok ' || sqlerrm;
    when others then return sqlstate || ' ' || sqlerrm;
  end;
end $$;
grant execute on all functions in schema audit to anon, authenticated;

select tests.make_two_families();
select tests.create_user(null, true, '00000000-0000-4000-8000-0000000000f7');
select tests.create_user(null, true, '00000000-0000-4000-8000-0000000000f8');
insert into public.pairing_codes (id, family_id, code_hash, label) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 8)), 'Den iPad');
-- Kid A (ca, family 1) has PIN 1234. Give family 2's kid a PIN too.
update public.kids set pin_hash = extensions.crypt('4321', extensions.gen_salt('bf', 8)) where id = '00000000-0000-4000-8000-0000000000cc';
-- Ignore whatever the live database already holds.
delete from public.pairing_attempts;
delete from public.pin_attempts;

-- =============================================================================================
-- 1. BLOCKING. Read-only oracle (PostgREST GET): unlimited guesses, no lockout.
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select is(audit.ro($$select public.redeem_pairing_code('11112222')::text$$),
          audit.ro($$select public.redeem_pairing_code('99998888')::text$$),
  'audit lockout: in a read-only transaction (PostgREST GET), a right and a wrong pairing code are indistinguishable');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(audit.ro($$select public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234')::text$$),
          audit.ro($$select public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '0000')::text$$),
  'audit lockout: in a read-only transaction (PostgREST GET), a right and a wrong PIN are indistinguishable');
reset role;

-- Read-only guesses are not recorded. Together with the two tests above, this is what makes
-- the lockouts moot: 6 read-only guesses, then the real code still works.
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select audit.ro($$select public.redeem_pairing_code('0000000' || g)::text$$) from generate_series(0, 5) g;
reset role;
select is((select count(*)::int from public.pairing_attempts), 0, 'read-only: no pairing attempt is recorded (documents the bypass)');
select is((select used_at from public.pairing_codes where id = '00000000-0000-4000-8000-00000000c001'), null, 'read-only: the code is not consumed');

-- =============================================================================================
-- 2. Lockout windows (should pass).
-- =============================================================================================
-- Pairing: 5 failures inside 10 minutes lock; the same 5 just outside the window don't.
insert into public.pairing_attempts (user_id, attempted_at)
  select '00000000-0000-4000-8000-0000000000f7', now() - interval '9 minutes 59 seconds' from generate_series(1, 5);
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'too_many_attempts', 'pairing: 5 failures 9m59s ago still lock');
reset role;
update public.pairing_attempts set attempted_at = now() - interval '10 minutes 1 second';
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select is(public.redeem_pairing_code('12121212') ->> 'reason', 'invalid_or_expired', 'pairing: failures older than 10 minutes no longer lock');
reset role;
delete from public.pairing_attempts;

-- The cap is per anonymous identity, and every way of being wrong counts.
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select public.redeem_pairing_code(c) from unnest(array['', 'x', '1234567', '123456789', '1111 2222']) c;
reset role;
select is((select count(*)::int from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000f7'), 5,
  'pairing: empty, malformed, short, long and spaced codes all count as failures');
select tests.authenticate('00000000-0000-4000-8000-0000000000f8', 'aal1', true);
select is(public.redeem_pairing_code('00000000') ->> 'reason', 'invalid_or_expired', 'pairing: another identity is not locked by the first');
reset role;
delete from public.pairing_attempts;

-- An expired or used code counts as a failure (it is not a free probe).
update public.pairing_codes set expires_at = now() - interval '1 second' where id = '00000000-0000-4000-8000-00000000c001';
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'invalid_or_expired', 'pairing: a right but expired code is refused');
reset role;
select is((select count(*)::int from public.pairing_attempts), 1, 'pairing: a right but expired code is recorded as a failure');
delete from public.pairing_attempts;

-- Callers that are refused before the compare write nothing (no lockout pollution).
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.redeem_pairing_code('00000000') ->> 'reason', 'already_paired', 'pairing: a paired device is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is(public.redeem_pairing_code('00000000') ->> 'reason', 'already_paired', 'pairing: a revoked device is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is(public.redeem_pairing_code('00000000') ->> 'reason', 'not_a_device_session', 'pairing: an email user is refused');
reset role;
select tests.as_anon();
select is(audit.try($$select public.redeem_pairing_code('00000000')::text$$), 'err 42501', 'pairing: the anon key cannot call redeem');
reset role;
select is((select count(*)::int from public.pairing_attempts), 0, 'pairing: refused callers record nothing');

-- PIN: 5 wrong inside 5 minutes lock; outside, they don't.
insert into public.pin_attempts (kid_id, user_id, attempted_at)
  select '00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000d1', now() - interval '4 minutes 59 seconds' from generate_series(1, 5);
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'reason', 'locked', 'pin: 5 wrong 4m59s ago still lock');
reset role;
update public.pin_attempts set attempted_at = now() - interval '5 minutes 1 second';
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234') ->> 'ok', 'true', 'pin: wrong tries older than 5 minutes no longer lock');
reset role;
delete from public.pin_attempts;

-- PIN: null and junk count; tries_left never goes negative.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', null) ->> 'reason', 'wrong', 'pin: a null PIN for a PIN kid is wrong');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', ' 1234') ->> 'reason', 'wrong', 'pin: a padded PIN is wrong');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '12345') ->> 'reason', 'wrong', 'pin: 5 digits is wrong');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1') ->> 'reason', 'wrong', 'pin: 1 digit is wrong');
select is((public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '9') ->> 'tries_left')::int, 0, 'pin: the fifth wrong try leaves 0');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '9') ->> 'reason', 'locked', 'pin: the sixth is locked, not wrong');
reset role;
select is((select count(*)::int from public.pin_attempts), 5, 'pin: locked calls are not recorded (the lock does not extend itself)');
delete from public.pin_attempts;

-- =============================================================================================
-- 3. No cross-family PIN state leaks (should pass).
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000cc', '4321'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: other family''s kid, right PIN: not_allowed');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000cc', '0000'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: other family''s kid, wrong PIN: not_allowed');
select is(public.verify_kid_pin('00000000-0000-4000-8000-00000000dead', '0000'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: nonexistent kid: not_allowed');
reset role;
update public.kids set pin_hash = null where id = '00000000-0000-4000-8000-0000000000cc';
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000cc', null), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: other family''s kid without a PIN: not_allowed (not ok)');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: other family''s parent: not_allowed');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: unpaired anonymous user: not_allowed');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select is(public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234'), '{"ok": false, "reason": "not_allowed"}'::jsonb, 'pin: aal1 parent: not_allowed');
reset role;
select tests.as_anon();
select is(audit.try($$select public.verify_kid_pin('00000000-0000-4000-8000-0000000000ca', '1234')::text$$), 'err 42501', 'pin: the anon key cannot call verify');
reset role;
select is((select count(*)::int from public.pin_attempts), 0, 'pin: refused callers record nothing');

select * from finish();
rollback;
