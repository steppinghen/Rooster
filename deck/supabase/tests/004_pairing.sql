-- Slice 3: pairing codes (create, redeem, lockouts, single use, expiry), revocation, check-in.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
-- Fresh anonymous iPads that haven't paired yet.
select tests.create_user(null, true, '00000000-0000-4000-8000-0000000000f7');
select tests.create_user(null, true, '00000000-0000-4000-8000-0000000000f8');
select tests.create_user(null, true, '00000000-0000-4000-8000-0000000000f9');

-- ----- create_pairing_code -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok((select code ~ '^[0-9]{8}$' from public.create_pairing_code('Bedroom iPad')), 'create: returns an 8-digit code');
select ok((select expires_at between now() + interval '9 minutes' and now() + interval '10 minutes' from public.create_pairing_code('Bedroom iPad 2')),
  'create: expires in 10 minutes');
select throws_ok($$select * from public.create_pairing_code('')$$, '22023', null, 'create: needs a name');
select lives_ok($$select * from public.create_pairing_code('Third')$$, 'create: a third open code is allowed');
select throws_ok($$select * from public.create_pairing_code('Fourth')$$, '54000', null, 'create: at most 3 open codes per family');
reset role;
select ok(not exists (select 1 from public.pairing_codes where code_hash ~ '^[0-9]{8}$'), 'create: only hashes are stored');
select ok((select bool_and(created_by = '00000000-0000-4000-8000-0000000000a1') from public.pairing_codes where label like 'Bedroom%'), 'create: records who made it');
delete from public.pairing_codes;

select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok($$select * from public.create_pairing_code('X')$$, '42501', null, 'create: refused for an aal1 parent');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select * from public.create_pairing_code('X')$$, '42501', null, 'create: refused for a device');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$select * from public.create_pairing_code('X')$$, '42501', null, 'create: refused for a stranger');
reset role;

-- A known code for family 1 (inserted as postgres so the test knows the digits).
insert into public.pairing_codes (id, family_id, code_hash, label)
values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 8)), 'Den iPad');

-- ----- redeem: guards -----
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'not_a_device_session', 'redeem: a real (email) user cannot become a device');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'already_paired', 'redeem: an already-paired iPad cannot join a second time');
reset role;

-- ----- redeem: wrong codes are recorded and lock out -----
select tests.authenticate('00000000-0000-4000-8000-0000000000f7', 'aal1', true);
select is(public.redeem_pairing_code('00000000') ->> 'reason', 'invalid_or_expired', 'redeem: wrong code');
select is(public.redeem_pairing_code('abc') ->> 'reason', 'invalid_or_expired', 'redeem: malformed code');
select is(public.redeem_pairing_code(null) ->> 'reason', 'invalid_or_expired', 'redeem: null code');
select is(public.redeem_pairing_code('00000001') ->> 'reason', 'invalid_or_expired', 'redeem: wrong code 4');
select is(public.redeem_pairing_code('00000002') ->> 'reason', 'invalid_or_expired', 'redeem: wrong code 5');
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'too_many_attempts', 'redeem: after 5 wrong tries even the right code is refused');
reset role;
select is((select count(*)::int from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000f7'), 5,
  'redeem: failed attempts are kept (not rolled back)');
select is((select used_at from public.pairing_codes where id = '00000000-0000-4000-8000-00000000c001'), null, 'redeem: the locked-out iPad did not use the code');

-- ----- redeem: success, single use -----
select tests.authenticate('00000000-0000-4000-8000-0000000000f8', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'ok', 'true', 'redeem: the right code pairs the iPad');
select results_eq('select role, family_name, label from public.whoami()', $$values ('device'::text, 'Family One'::text, 'Den iPad'::text)$$,
  'redeem: the iPad is now a device in family 1, named by the code');
select results_eq('select count(*)::int from public.kids', 'values (2)', 'redeem: the new device can see its family''s kids');
reset role;
select ok((select used_at is not null and used_by_device is not null from public.pairing_codes where id = '00000000-0000-4000-8000-00000000c001'), 'redeem: code marked used, linked to the device');
select tests.authenticate('00000000-0000-4000-8000-0000000000f9', 'aal1', true);
select is(public.redeem_pairing_code('11112222') ->> 'reason', 'invalid_or_expired', 'redeem: a used code cannot pair a second iPad');
reset role;

-- ----- redeem: expiry -----
insert into public.pairing_codes (family_id, code_hash, label)
values ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('33334444', extensions.gen_salt('bf', 8)), 'Late iPad');
update public.pairing_codes set expires_at = now() - interval '1 second' where label = 'Late iPad';
select tests.authenticate('00000000-0000-4000-8000-0000000000f9', 'aal1', true);
select is(public.redeem_pairing_code('33334444') ->> 'reason', 'invalid_or_expired', 'redeem: an expired code is refused');
reset role;

-- The server owns the clock: a writer can't make a code live longer than 10 minutes.
insert into public.pairing_codes (family_id, code_hash, label, created_at, expires_at)
values ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('55556666', extensions.gen_salt('bf', 8)), 'Forever', now() + interval '1 year', now() + interval '1 year');
select ok((select expires_at <= now() + interval '10 minutes' and created_at <= now() from public.pairing_codes where label = 'Forever'),
  'codes: created_at/expires_at are clamped by the server');

-- ----- redeem: colliding codes in two families fail closed -----
insert into public.pairing_codes (family_id, code_hash, label) values
  ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('77778888', extensions.gen_salt('bf', 8)), 'Twin A'),
  ('00000000-0000-4000-8000-0000000000f2', extensions.crypt('77778888', extensions.gen_salt('bf', 8)), 'Twin B');
select tests.authenticate('00000000-0000-4000-8000-0000000000f9', 'aal1', true);
select is(public.redeem_pairing_code('77778888') ->> 'reason', 'invalid_or_expired', 'redeem: two families'' identical codes pair nobody');
reset role;

-- ----- redeem: global cap across many anonymous users -----
insert into public.pairing_attempts (user_id) select gen_random_uuid() from generate_series(1, 100);
insert into public.pairing_codes (family_id, code_hash, label)
values ('00000000-0000-4000-8000-0000000000f2', extensions.crypt('99990000', extensions.gen_salt('bf', 8)), 'Capped');
select tests.authenticate('00000000-0000-4000-8000-0000000000f9', 'aal1', true);
select is(public.redeem_pairing_code('99990000') ->> 'reason', 'too_many_attempts', 'redeem: 100 recent failures anywhere pause all pairing');
reset role;
delete from public.pairing_attempts;

-- ----- cancel_pairing_code -----
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select throws_ok($$select public.cancel_pairing_code('00000000-0000-4000-8000-00000000c001')$$, '42501', null, 'cancel: not another family''s code');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.cancel_pairing_code((select id from public.pairing_codes where label = 'Forever'))$$, 'cancel: a parent cancels their own open code');
reset role;
select ok((select expires_at <= now() from public.pairing_codes where label = 'Forever'), 'cancel: the code is dead');

-- ----- device_checkin -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select public.device_checkin();
reset role;
select ok((select last_seen_at > now() - interval '1 minute' from public.devices where id = '00000000-0000-4000-8000-000000000dd1'), 'checkin: records last seen');
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select public.device_checkin();
reset role;
select is((select last_seen_at from public.devices where id = '00000000-0000-4000-8000-000000000dd9'), null, 'checkin: a revoked iPad cannot report in');

-- ----- revoke_device -----
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.revoke_device('00000000-0000-4000-8000-000000000dd2')$$, '42501', null, 'revoke: a device cannot revoke');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select throws_ok($$select public.revoke_device('00000000-0000-4000-8000-000000000dd1')$$, '42501', null, 'revoke: not another family''s device');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.revoke_device('00000000-0000-4000-8000-000000000dd1')$$, 'revoke: parent unpairs their iPad');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty('select 1 from public.kids', 'revoke: the iPad loses access on its next request');
select results_eq('select role from public.whoami()', $$values ('revoked'::text)$$, 'revoke: the iPad can tell it was unpaired');
select is(public.redeem_pairing_code('12345678') ->> 'reason', 'already_paired', 'revoke: the same identity cannot re-pair (it needs a new one)');
reset role;

select * from finish();
rollback;
