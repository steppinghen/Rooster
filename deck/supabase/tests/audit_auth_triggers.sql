-- AUDIT (R1b hardening): the devices_forgotten trigger on public.devices and the
-- anonymous_stays_anonymous trigger on auth.users.
--   * forgetting a device deletes only that device's anonymous identity and its lockout rows,
--     on every delete path (parent forget, auth-user delete, kid delete, cleanup), and can
--     never be aimed at a parent or any other user
--   * an anonymous identity can't gain an email, phone or pending change, or stop being
--     anonymous; GoTrue's normal writes (sign-in stamps, metadata, bans, delete) still work
-- GoTrue itself (supabase_auth_admin) can't be impersonated here; the same paths were run
-- against the local GoTrue for this audit: anonymous sign-up, refresh, getUser and a metadata
-- update succeed; attaching an email or a phone fails and leaves the row unchanged.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
insert into public.pairing_attempts (user_id) values
  ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d9'),
  ('00000000-0000-4000-8000-0000000000d2'), ('00000000-0000-4000-8000-0000000000e2');

-- ----- devices_forgotten -------------------------------------------------------------------
-- Who can't forget a device.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
delete from public.devices;
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
delete from public.devices where family_id = '00000000-0000-4000-8000-0000000000f1';
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
delete from public.devices;
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
delete from public.devices where id = '00000000-0000-4000-8000-000000000dd1'; -- not revoked
reset role;
select is((select count(*)::int from public.devices where id in ('00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-000000000dd9', '00000000-0000-4000-8000-000000000dd2')), 3, 'forget: no device row removed by an iPad, another family, an aal1 parent, or an unrevoked delete');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000d2')), 3,
  'forget: no iPad identity removed by those attempts');

-- The trigger's target can't be chosen: device_user_id is not updatable, devices not insertable.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$update public.devices set device_user_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-000000000dd9'$$,
  '42501', null, 'forget: a parent cannot repoint a device at another user');
select throws_ok($$insert into public.devices (family_id, device_user_id, label) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e2', 'x')$$,
  '42501', null, 'forget: a parent cannot insert a device row for an arbitrary user');
-- The legitimate path: forget the revoked iPad.
delete from public.devices where id = '00000000-0000-4000-8000-000000000dd9';
reset role;
select is_empty($$select 1 from public.devices where id = '00000000-0000-4000-8000-000000000dd9'$$, 'forget: the parent removed the revoked iPad');
select is_empty($$select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d9'$$, 'forget: its anonymous identity is gone (cannot re-pair)');
select is_empty($$select 1 from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000d9'$$, 'forget: its lockout rows are gone');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e2')), 3,
  'forget: no other anonymous identity touched');
select is((select count(*)::int from public.pairing_attempts where user_id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e2')), 3, 'forget: no other lockout rows touched');

-- Never a real (non-anonymous) account, even if a devices row ever pointed at one.
insert into public.devices (id, family_id, device_user_id, label, revoked_at) values
  ('00000000-0000-4000-8000-000000000de1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'Bad row', now());
delete from public.devices where id = '00000000-0000-4000-8000-000000000de1';
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000e1'), 'forget: a non-anonymous user is never deleted by the trigger');

-- Other delete paths.
select lives_ok($$delete from auth.users where id = '00000000-0000-4000-8000-0000000000d2'$$, 'forget: deleting an iPad''s auth user directly (GoTrue admin, cleanup) works');
select is_empty($$select 1 from public.devices where device_user_id = '00000000-0000-4000-8000-0000000000d2'$$, 'forget: ...and its device row cascades away');
select is_empty($$select 1 from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000d2'$$, 'forget: ...with its lockout rows');
select ok(exists (select 1 from public.families where id = '00000000-0000-4000-8000-0000000000f2'), 'forget: ...and nothing else of that family');
delete from public.kids where id = '00000000-0000-4000-8000-0000000000cb';
select ok(exists (select 1 from public.devices where id = '00000000-0000-4000-8000-000000000dd1')
      and exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d1'), 'forget: deleting a kid leaves the iPad alone');
select ok(not (private.cleanup_orphans() ? 'skipped'), 'cleanup_orphans: its table guard matches the current schema (it really runs)');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d1'), 'cleanup_orphans: a paired iPad survives');

-- ----- anonymous_stays_anonymous -------------------------------------------------------------
select throws_ok($$update auth.users set email = 'grab@example.test' where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: cannot take an email');
select throws_ok($$update auth.users set email = '' where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: even an empty-string email is a change');
select throws_ok($$update auth.users set phone = '15550000000' where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: cannot take a phone');
select throws_ok($$update auth.users set is_anonymous = false where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: cannot become a real account');
select throws_ok($$update auth.users set email_change = 'grab@example.test', email_change_token_new = 'x' where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: cannot start an email change');
select throws_ok($$update auth.users set phone_change = '15550000000' where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'anon user: cannot start a phone change');
select lives_ok($$update auth.users set last_sign_in_at = now(), updated_at = now(), raw_user_meta_data = '{"x":1}' where id = '00000000-0000-4000-8000-0000000000d1'$$,
  'anon user: sign-in stamps and metadata updates still work (GoTrue sign-in/refresh path)');
select lives_ok($$update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-0000000000e2'$$, 'anon user: bans still work');
select lives_ok($$update auth.users set email = 'fx-stranger-2@example.test' where id = '00000000-0000-4000-8000-0000000000e1'$$, 'real user: email changes are not affected');
select lives_ok($$delete from auth.users where id = '00000000-0000-4000-8000-0000000000e2'$$, 'anon user: deletion is not blocked');
select is((select tgenabled from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'deck_anonymous_stays_anonymous'), 'O'::"char", 'anon user: the trigger is enabled');
select ok(not has_table_privilege('authenticated', 'auth.users', 'update') and not has_table_privilege('anon', 'auth.users', 'update')
      and not has_table_privilege('authenticated', 'auth.users', 'trigger'), 'anon user: API roles cannot update auth.users or touch its triggers');
select ok((select not prosecdef and 'search_path=""' = any (proconfig) from pg_proc where oid = 'private.anonymous_stays_anonymous()'::regprocedure)
      and (select prosecdef and 'search_path=""' = any (proconfig) from pg_proc where oid = 'private.device_forgotten()'::regprocedure),
  'triggers: empty search_path; only device_forgotten is definer');

select * from finish();
rollback;
