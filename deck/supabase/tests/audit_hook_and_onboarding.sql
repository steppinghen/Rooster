-- AUDIT (slice 2): the allowlist hook and every way into a family: whoami, create_family,
-- my_invites, accept_invite. Attacks: anonymous-to-email conversion (updateUser, which never
-- runs before_user_created), unconfirmed and pending (email_change) addresses, case and
-- Unicode folding, forged claims, and every non-parent role.
--
-- GoTrue's writes to auth.users are simulated as postgres with the same column changes GoTrue
-- makes (checked against the local stack: gotrue v2.197.0 with MAILER_AUTOCONFIRM=true).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create schema audit;
grant usage on schema audit to anon, authenticated;
-- Run q as the current role in a subtransaction that is always rolled back.
-- Returns 'ok <first column as text>' or 'err <sqlstate>'.
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

-- Every onboarding entry point, as the current role. Each call is rolled back.
create function audit.onboarding_calls() returns table (call text, result text) language sql set search_path = '' as $$
  values
    ('1 whoami', audit.try($q$select string_agg(role || coalesce(':' || family_id::text, '') || coalesce(':' || family_name, ''), ',') from public.whoami()$q$)),
    ('2 create_family', audit.try($q$select public.create_family('Evil', 'Evil', 'UTC')::text$q$)),
    ('3 accept_invite f1', audit.try($q$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'Evil')::text$q$)),
    ('4 accept_invite f2', audit.try($q$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'Evil')::text$q$)),
    ('5 my_invites', audit.try($q$select count(*)::text from public.my_invites()$q$))
$$;
grant execute on all functions in schema audit to anon, authenticated;

select tests.make_two_families();
-- fx-invited@example.test is invited to family 2 (fixture, not yet signed up). Bootstrap row:
insert into public.parent_allowlist (email, family_id) values ('fx-bootstrap@example.test', null);

-- =============================================================================================
-- 1. BLOCKING. Anonymous -> email conversion. before_user_created does not run for updateUser,
--    so the allowlist rests on "the email must be confirmed". With MAILER_AUTOCONFIRM on (local
--    config.toml: [auth.email] enable_confirmations = false) GoTrue marks the new address
--    confirmed immediately and flips is_anonymous, with no mail sent. Reproduced live against
--    the local stack: anonymous sign-up, PUT /auth/v1/user {email}, refresh, enrol own TOTP,
--    then whoami() = 'bootstrap' (create_family open). An invited address gives accept_invite.
--    Password sign-up (POST /auth/v1/signup {email, password}) for a listed address is
--    auto-confirmed the same way (the hook passes because the address is listed).
-- =============================================================================================
select tests.create_user(null, true, '00000000-0000-4000-8000-00000000aa01');

select ok(
  audit.try($$update auth.users set email = 'fx-invited@example.test', email_confirmed_at = now(), is_anonymous = false,
                raw_app_meta_data = raw_app_meta_data || '{"provider":"email","providers":["email"]}'
              where id = '00000000-0000-4000-8000-00000000aa01' returning 'converted'$$) like 'err %',
  'audit hook-bypass: an anonymous (iPad) user cannot attach an email to itself (updateUser skips before_user_created)');

-- Apply GoTrue's end state for real, if the database lets it happen.
do $$ begin
  update auth.users set email = 'fx-invited@example.test', email_confirmed_at = now(), is_anonymous = false,
         raw_app_meta_data = raw_app_meta_data || '{"provider":"email","providers":["email"]}'
   where id = '00000000-0000-4000-8000-00000000aa01';
exception when others then null;
end $$;
select tests.authenticate('00000000-0000-4000-8000-00000000aa01', 'aal2', false);
select is(audit.try($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'Not Parent B2')::text$$), 'err 42501',
  'audit hook-bypass: a converted anonymous user cannot take over the second parent''s invitation');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-00000000aa01';

-- =============================================================================================
-- 2. Unconfirmed and pending addresses never count.
-- =============================================================================================
-- 2a. An email user with a pending email_change to an invited address.
update auth.users set email_change = 'fx-invited@example.test', email_change_token_new = 'x', email_change_sent_at = now(),
       email_change_confirm_status = 0
 where id = '00000000-0000-4000-8000-0000000000e1';
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is((select role from public.whoami()), 'none', 'pending email_change: whoami does not treat the new address as listed');
select is(audit.try($$select count(*)::text from public.my_invites()$$), 'ok 0', 'pending email_change: my_invites is empty');
select is(audit.try($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'X')::text$$), 'err 42501',
  'pending email_change: accept_invite refused');
reset role;
-- 2b. Double-confirm change with only one side confirmed (email not switched yet).
update auth.users set email_change_confirm_status = 1 where id = '00000000-0000-4000-8000-0000000000e1';
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is(audit.try($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'X')::text$$), 'err 42501',
  'half-confirmed email_change: accept_invite refused');
reset role;
update auth.users set email_change = '', email_change_token_new = '', email_change_sent_at = null, email_change_confirm_status = 0
 where id = '00000000-0000-4000-8000-0000000000e1';

-- 2c. Anonymous user with an email change pending (confirmations ON behaviour).
select tests.create_user(null, true, '00000000-0000-4000-8000-00000000aa02');
-- Since the slice 2-4 fixes, the database refuses even a pending email on an iPad account.
select ok(audit.try($$update auth.users set email_change = 'fx-bootstrap@example.test' where id = '00000000-0000-4000-8000-00000000aa02' returning 'x'$$) like 'err %',
  'anonymous user: a pending email change is refused outright');
select tests.authenticate('00000000-0000-4000-8000-00000000aa02', 'aal2', true);
select is((select role from public.whoami()), 'unpaired', 'anonymous with a pending email: still just unpaired');
select is(audit.try($$select public.create_family('X', 'Y', 'UTC')::text$$), 'err 42501', 'anonymous with a pending email: cannot create a family');
reset role;

-- 2d. A confirmed address whose email_confirmed_at was later cleared (e.g. by an admin).
select tests.create_user('fx-bootstrap@example.test', false, '00000000-0000-4000-8000-00000000aa06');
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-00000000aa06';
select tests.authenticate('00000000-0000-4000-8000-00000000aa06');
select is(audit.try($$select public.create_family('X', 'Y', 'UTC')::text$$), 'err 42501', 'unconfirmed bootstrap address: cannot create a family');
reset role;
select is((select count(*)::int from public.parent_allowlist where email = 'fx-bootstrap@example.test' and family_id is null), 1,
  'unconfirmed bootstrap address: the bootstrap row is not consumed');

-- 2e. Phone-only user (no email).
select tests.create_user(null, false, '00000000-0000-4000-8000-00000000aa03');
update auth.users set phone = '15555550100', phone_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000aa03';
select tests.authenticate('00000000-0000-4000-8000-00000000aa03');
select is((select role from public.whoami()), 'none', 'phone-only user: none');
select is(audit.try($$select public.create_family('X', 'Y', 'UTC')::text$$), 'err 42501', 'phone-only user: cannot create a family');
reset role;

-- =============================================================================================
-- 3. Case and Unicode.
-- =============================================================================================
-- GoTrue stores addresses lowercased (checked live). Every function here runs with
-- search_path = '', where citext's = operator (schema extensions) is not visible, so
-- allowlist.email = mail silently becomes a case-SENSITIVE text comparison. A row typed with
-- capitals (the go-live bootstrap insert, or any direct API insert) never matches.
insert into public.parent_allowlist (email, family_id) values ('FX-Mixed@Example.test', '00000000-0000-4000-8000-0000000000f2');
select tests.create_user('fx-mixed@example.test', false, '00000000-0000-4000-8000-00000000aa04');
select is(private.hook_before_user_created('{"user":{"email":"fx-mixed@example.test"}}'), '{}'::jsonb,
  'case: the hook lets in the lowercase sign-up for a mixed-case allowlist row');
select tests.authenticate('00000000-0000-4000-8000-00000000aa04');
select is((select role from public.whoami()), 'invited', 'case: whoami matches a mixed-case allowlist row');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-00000000aa04';

select is((private.hook_before_user_created('{"user":{"email":" fx-invited@example.test"}}') -> 'error' ->> 'http_code')::int, 403, 'hook: a leading space is not the listed address');
select is((private.hook_before_user_created('{"user":{"email":"fx-invited@example.test."}}') -> 'error' ->> 'http_code')::int, 403, 'hook: a trailing dot is not the listed address');
select is((private.hook_before_user_created('{"user":{"email":"fx-invited+x@example.test"}}') -> 'error' ->> 'http_code')::int, 403, 'hook: a plus tag is not the listed address');
select is((private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', U&'fx-\0130nvited@example.test'))) -> 'error' ->> 'http_code')::int, 403,
  'hook: DOTTED CAPITAL I does not fold to i');
select is(private.hook_before_user_created('{"user":{"email":"fx-invited@example.test","is_anonymous":"false"}}'), '{}'::jsonb,
  'hook: is_anonymous as the string "false" is handled');
select throws_ok($$select private.hook_before_user_created('{"user":{"email":"x@example.test","is_anonymous":"maybe"}}')$$, null, null,
  'hook: a garbage is_anonymous fails closed (error, never a pass)');

-- The ICU collation folds KELVIN SIGN (U+212A) to ASCII k in lower() and citext. GoTrue rejects
-- non-ASCII addresses before the hook (checked live: 400 validation_failed), so this is not
-- reachable today. An OAuth provider or a GoTrue change could make it reachable.
-- (The whoami half passes today only because of the case-sensitivity bug above; fixing that
-- with citext's real operator makes it fold, so keep both halves together.)
insert into public.parent_allowlist (email, family_id) values ('fx-kate@example.test', '00000000-0000-4000-8000-0000000000f2');
select tests.create_user(U&'fx-\212Aate@example.test', false, '00000000-0000-4000-8000-00000000aa05');
select is((private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', U&'fx-\212Aate@example.test'))) -> 'error' ->> 'http_code')::int, 403,
  'hook: a KELVIN SIGN variant of a listed address is refused');
select tests.authenticate('00000000-0000-4000-8000-00000000aa05');
select is((select role from public.whoami()), 'none', 'confirmed_email: a KELVIN SIGN variant is not the invited address');
reset role;

select is((private.hook_before_user_created('{"user":{"email":"nobody@example.test","is_anonymous":true}}') -> 'error' ->> 'http_code')::int, 403,
  'hook: an anonymous flag with an unlisted email is refused');

-- =============================================================================================
-- 4. Every non-qualifying role against every onboarding entry point.
-- =============================================================================================
select tests.create_user('fx-invited@example.test', false, '00000000-0000-4000-8000-00000000aa07');

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok device:00000000-0000-4000-8000-0000000000f1:Family One'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'paired device: no onboarding path');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok revoked'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'revoked device: no onboarding path, no family revealed');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok unpaired'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'unpaired anonymous user: no onboarding path');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok none'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'unlisted user: no onboarding path');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok parent:00000000-0000-4000-8000-0000000000f2:Family Two'), ('2 create_family', 'err 23505'),
  ('3 accept_invite f1', 'err 23505'), ('4 accept_invite f2', 'err 23505'), ('5 my_invites', 'ok 0')$$,
  'other-family parent: cannot create or join another family');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok none'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'aal1 parent: nothing before MFA');
reset role;
select tests.authenticate('00000000-0000-4000-8000-00000000aa07', 'aal1');
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'ok none'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'ok 0')$$,
  'invited user at aal1: nothing before MFA, family name not revealed');
reset role;
select tests.as_anon();
select results_eq('select call, result from audit.onboarding_calls()', $$values
  ('1 whoami', 'err 42501'), ('2 create_family', 'err 42501'),
  ('3 accept_invite f1', 'err 42501'), ('4 accept_invite f2', 'err 42501'), ('5 my_invites', 'err 42501')$$,
  'anon key: every onboarding RPC is denied');
reset role;

-- The invited user at aal2: sees only their own invitation; joining a family that didn't
-- invite them looks the same as joining one that doesn't exist.
insert into public.parent_allowlist (email, family_id) values ('fx-someone-else@example.test', '00000000-0000-4000-8000-0000000000f1');
select tests.authenticate('00000000-0000-4000-8000-00000000aa07');
select results_eq('select family_name from public.my_invites()', $$values ('Family Two'::text)$$, 'invited: my_invites lists only invitations for their own address');
select is(audit.try($$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'X')::text$$),
          audit.try($$select public.accept_invite('00000000-0000-4000-8000-00000000dead', 'X')::text$$),
  'invited: uninvited family and nonexistent family give the same error');
select is(audit.try($$select public.create_family('X', 'Y', 'UTC')::text$$), 'err 42501', 'invited (not bootstrap): cannot create a family');
reset role;

-- An invitation withdrawn before acceptance can't be used.
delete from public.parent_allowlist where email = 'fx-invited@example.test' and family_id = '00000000-0000-4000-8000-0000000000f2';
select tests.authenticate('00000000-0000-4000-8000-00000000aa07');
select is(audit.try($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'X')::text$$), 'err 42501', 'withdrawn invitation: refused');
select is((select role from public.whoami()), 'none', 'withdrawn invitation: whoami is none');
reset role;

-- =============================================================================================
-- 5. Bootstrap: one family, once, and a failed attempt doesn't burn the row.
-- =============================================================================================
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000aa06';
select tests.authenticate('00000000-0000-4000-8000-00000000aa06');
select is(audit.try($$select public.create_family('Fam', '', 'UTC')::text$$), 'err 23514', 'bootstrap: an invalid display name fails');
reset role;
select is((select count(*)::int from public.parent_allowlist where email = 'fx-bootstrap@example.test' and family_id is null), 1,
  'bootstrap: a failed create_family does not consume the row');
select tests.authenticate('00000000-0000-4000-8000-00000000aa06');
select ok((select public.create_family('Fam', 'P', 'Not/AZone') is not null), 'bootstrap: create_family works');
select is((select timezone from public.families), 'UTC', 'bootstrap: an unknown time zone falls back to UTC');
select is(audit.try($$select public.create_family('Fam 2', 'P', 'UTC')::text$$), 'err 23505', 'bootstrap: only once');
reset role;
select is((select count(*)::int from public.parents where user_id = '00000000-0000-4000-8000-00000000aa06'), 1, 'bootstrap: exactly one family came of the row');
select is((select count(*)::int from public.parent_allowlist where email = 'fx-bootstrap@example.test' and family_id is null), 0, 'bootstrap: the row is consumed');

select * from finish();
rollback;
