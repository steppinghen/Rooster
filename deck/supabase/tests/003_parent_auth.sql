-- Slice 2: allowlist hook, whoami, create_family, invitations, kid PINs, cleanup job.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

-- ----- before_user_created hook (called by GoTrue as supabase_auth_admin) -----
select is(private.hook_before_user_created('{"user":{"email":"","is_anonymous":true}}'), '{}'::jsonb, 'hook: anonymous (iPad) sign-ups pass');
select is(private.hook_before_user_created('{"user":{"email":"fx-invited@example.test","is_anonymous":false}}'), '{}'::jsonb, 'hook: an allowlisted email passes');
select is(private.hook_before_user_created('{"user":{"email":"FX-Invited@Example.TEST"}}'), '{}'::jsonb, 'hook: email match ignores case');
select is((private.hook_before_user_created('{"user":{"email":"nobody@example.test","is_anonymous":false}}') -> 'error' ->> 'http_code')::int, 403, 'hook: an unlisted email is refused');
select is((private.hook_before_user_created('{"user":{"is_anonymous":false}}') -> 'error' ->> 'http_code')::int, 403, 'hook: a non-anonymous user without email is refused');
select ok(has_function_privilege('supabase_auth_admin', 'private.hook_before_user_created(jsonb)', 'execute'), 'hook: GoTrue can call it');
select ok(not has_function_privilege('authenticated', 'private.hook_before_user_created(jsonb)', 'execute')
      and not has_function_privilege('anon', 'private.hook_before_user_created(jsonb)', 'execute'), 'hook: API roles cannot call it');

-- ----- whoami -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select results_eq('select role, family_name from public.whoami()', $$values ('parent'::text, 'Family One'::text)$$, 'whoami: parent at aal2');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1', 'aal1');
select results_eq('select role, family_id from public.whoami()', $$values ('none'::text, null::uuid)$$, 'whoami: nothing about the family before MFA');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq('select role, label from public.whoami()', $$values ('device'::text, 'Kitchen iPad'::text)$$, 'whoami: paired iPad');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select results_eq('select role, family_id, family_name from public.whoami()', $$values ('revoked'::text, null::uuid, null::text)$$, 'whoami: revoked iPad learns nothing about the family');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select results_eq('select role from public.whoami()', $$values ('unpaired'::text)$$, 'whoami: anonymous, never paired');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select results_eq('select role from public.whoami()', $$values ('none'::text)$$, 'whoami: stranger');
reset role;

-- ----- create_family: only a confirmed, bootstrap-listed account, once -----
select tests.create_user('boot@example.test', false, '00000000-0000-4000-8000-0000000000b8');
insert into public.parent_allowlist (email, family_id) values ('boot@example.test', null);
select tests.authenticate('00000000-0000-4000-8000-0000000000b8', 'aal1');
select throws_ok($$select public.create_family('X', 'Y', 'UTC')$$, '42501', null, 'create_family: refused before MFA');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b8');
select results_eq('select role from public.whoami()', $$values ('bootstrap'::text)$$, 'whoami: bootstrap-listed account');
select lives_ok($$select public.create_family('Family Boot', 'Parent Boot', 'America/New_York')$$, 'create_family: works for a bootstrap-listed account');
select results_eq('select role, family_name, timezone from public.whoami()', $$values ('parent'::text, 'Family Boot'::text, 'America/New_York'::text)$$, 'create_family: caller is now that family''s parent');
select results_eq('select count(*)::int from public.family_modules', 'values (6)', 'create_family: every catalog module is set up');
select throws_ok($$select public.create_family('Again', 'Y', 'UTC')$$, '23505', null, 'create_family: a parent cannot make a second family');
reset role;
select is((select count(*)::int from public.parent_allowlist where email = 'boot@example.test' and family_id is null), 0, 'create_family: the bootstrap row was consumed');

select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select throws_ok($$select public.create_family('Stranger family', 'S', 'UTC')$$, '42501', null, 'create_family: refused for an unlisted account');
reset role;

-- An unconfirmed email (e.g. an anonymous user that called updateUser) never counts.
select tests.create_user('sneaky@example.test', false, '00000000-0000-4000-8000-0000000000b9');
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-0000000000b9';
insert into public.parent_allowlist (email, family_id) values ('sneaky@example.test', null);
insert into public.parent_allowlist (email, family_id) values ('sneaky@example.test', '00000000-0000-4000-8000-0000000000f1');
select tests.authenticate('00000000-0000-4000-8000-0000000000b9');
select results_eq('select role from public.whoami()', $$values ('none'::text)$$, 'unconfirmed email: not treated as listed');
select throws_ok($$select public.create_family('S', 'S', 'UTC')$$, '42501', null, 'unconfirmed email: cannot create a family');
select throws_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'S')$$, '42501', null, 'unconfirmed email: cannot accept an invite');
select is_empty('select * from public.my_invites()', 'unconfirmed email: sees no invites');
reset role;

-- ----- invitations -----
select tests.create_user('fx-invited@example.test', false, '00000000-0000-4000-8000-0000000000b7');
select tests.authenticate('00000000-0000-4000-8000-0000000000b7', 'aal1');
select is_empty('select * from public.my_invites()', 'invites: nothing before MFA');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b7');
select results_eq('select role, family_name from public.whoami()', $$values ('invited'::text, 'Family Two'::text)$$, 'whoami: invited');
select results_eq('select family_name from public.my_invites()', $$values ('Family Two'::text)$$, 'my_invites: lists the inviting family');
select throws_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'Nope')$$, '42501', null, 'accept_invite: cannot join a family that did not invite you');
select lives_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'Parent B2')$$, 'accept_invite: joins the inviting family');
select results_eq('select count(*)::int from public.kids', 'values (1)', 'accept_invite: now sees that family''s kids');
select throws_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'Again')$$, '23505', null, 'accept_invite: only once');
reset role;

-- ----- set_kid_pin -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', '4321')$$, 'set_kid_pin: parent sets a PIN');
select results_eq($$select has_pin from public.kids where id = '00000000-0000-4000-8000-0000000000cb'$$, 'values (true)', 'set_kid_pin: has_pin shows it');
select throws_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', '12')$$, '22023', null, 'set_kid_pin: must be 4 digits');
select throws_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', 'abcd')$$, '22023', null, 'set_kid_pin: digits only');
select throws_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cc', '1111')$$, '42501', null, 'set_kid_pin: not for another family''s kid');
select lives_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', null)$$, 'set_kid_pin: parent clears a PIN');
reset role;
select is((select pin_hash from public.kids where id = '00000000-0000-4000-8000-0000000000cb'), null, 'set_kid_pin: cleared');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000ca', '0000')$$, '42501', null, 'set_kid_pin: a device cannot set PINs');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok($$select public.set_kid_pin('00000000-0000-4000-8000-0000000000ca', '0000')$$, '42501', null, 'set_kid_pin: an aal1 parent cannot set PINs');
reset role;

-- ----- new kids get a focus row -----
insert into public.kids (id, family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000cd', '00000000-0000-4000-8000-0000000000f1', 'Kid D', 'reader');
select is((select mode::text from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000cd'), 'everything', 'a new kid starts in Everything mode');

-- ----- cleanup job -----
update auth.users set created_at = now() - interval '2 days'
  where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b9');
select is(private.cleanup_orphans(), '{"anonymous_removed": 1, "unlisted_removed": 2}'::jsonb,
  'cleanup: removes the never-paired anonymous user, the unlisted stranger and the unconfirmed sneaky account');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d1'), 'cleanup: keeps a paired iPad');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a1'), 'cleanup: keeps parents');
select ok(not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000e1'), 'cleanup: stranger gone');
select ok(exists (select 1 from cron.job where jobname = 'deck-cleanup-orphans'), 'cleanup: scheduled nightly');

select * from finish();
rollback;
