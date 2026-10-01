-- AUDIT (slice 6): delete_family(confirm) edge cases.
--   * typed-name confirmation: case, whitespace, invisible and Unicode-equivalent input
--   * every non-parent role, an aal1 parent, and another family's parent are refused
--   * the second parent's sessions, refresh tokens, MFA factors and identities go with it
--   * pending invitees: the family's invitations go; another family's stay
--   * bootstrap rows: the family's parents' leftovers go; anyone else's stay
--   * auth audit-log rows (parents' emails and IPs) for the family's users
--   * stale JWTs of deleted parents and iPads can do nothing afterwards
-- One snapshot for the whole file: the local database is shared with running e2e sessions,
-- whose concurrent commits must not show up between a before/after comparison.
begin isolation level repeatable read;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

-- Pending invitees who already signed up (confirmed email, aal2-capable), not yet joined.
--   i1: invited by family 1 only.   i2: invited by family 1 AND family 2.
select tests.create_user('audit-invitee-1@example.test', false, '00000000-0000-4000-8000-00000000a0e1');
select tests.create_user('audit-invitee-2@example.test', false, '00000000-0000-4000-8000-00000000a0e2');
insert into public.parent_allowlist (email, family_id) values
  ('audit-invitee-1@example.test', '00000000-0000-4000-8000-0000000000f1'),
  ('audit-invitee-2@example.test', '00000000-0000-4000-8000-0000000000f1'),
  ('audit-invitee-2@example.test', '00000000-0000-4000-8000-0000000000f2');
-- Bootstrap rows: one left over for Parent A2 (family 1), one for an unrelated person.
insert into public.parent_allowlist (email, family_id) values
  ('fx-parent-a2@example.test', null), ('audit-other-bootstrap@example.test', null);

-- The second parent (A2) is signed in elsewhere: a session, a refresh token, a TOTP factor,
-- an identity.
insert into auth.sessions (id, user_id, aal, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a2a2', '00000000-0000-4000-8000-0000000000a2', 'aal2', now(), now());
insert into auth.refresh_tokens (instance_id, token, user_id, revoked, session_id, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'audit-a2-refresh', '00000000-0000-4000-8000-0000000000a2', false,
   '00000000-0000-4000-8000-00000000a2a2', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a2f0', '00000000-0000-4000-8000-0000000000a2', 'audit phone', 'totp', 'verified', now(), now());
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', '{"sub":"a2"}', 'email', now(), now());

-- GoTrue's audit log: what it writes on login / refresh (actor_id, actor_username = email, IP).
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-4000-8000-0000000000a1","actor_username":"fx-parent-a@example.test","log_type":"account"}', now(), '198.51.100.1'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"token_refreshed","actor_id":"00000000-0000-4000-8000-0000000000a2","actor_username":"fx-parent-a2@example.test","log_type":"token"}', now(), '198.51.100.2'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"token_refreshed","actor_id":"00000000-0000-4000-8000-0000000000d1","actor_username":"","log_type":"token"}', now(), '198.51.100.3'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-4000-8000-0000000000b1","actor_username":"fx-parent-b@example.test","log_type":"account"}', now(), '203.0.113.9'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"token_refreshed","actor_id":"00000000-0000-4000-8000-0000000000d2","actor_username":"","log_type":"token"}', now(), '203.0.113.10');

insert into public.pairing_attempts (user_id) values
  ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d9'),
  ('00000000-0000-4000-8000-0000000000d2'), ('00000000-0000-4000-8000-0000000000e2');

-- ----- Typed-name confirmation ----------------------------------------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$select public.delete_family('Family One ')$$, '22023', null, 'confirm: a trailing space does not match');
select throws_ok($$select public.delete_family(' Family One')$$, '22023', null, 'confirm: a leading space does not match');
select throws_ok($$select public.delete_family('FAMILY ONE')$$, '22023', null, 'confirm: case must match');
select throws_ok($$select public.delete_family('Family  One')$$, '22023', null, 'confirm: inner whitespace must match');
select throws_ok($$select public.delete_family(U&'Family\200BOne')$$, '22023', null, 'confirm: a zero-width space does not match');
select throws_ok($$select public.delete_family(U&'Family\00A0One')$$, '22023', null, 'confirm: a no-break space does not match');
select throws_ok($$select public.delete_family('')$$, '22023', null, 'confirm: empty does not match');
select throws_ok($$select public.delete_family('Family Two')$$, '22023', null, 'confirm: another family''s name does not match');
select throws_ok($$select public.delete_family('%')$$, '22023', null, 'confirm: no pattern matching');
reset role;

-- Unicode: an NFC name (as typed on iPhone) and its NFD equivalent are compared byte for byte.
update public.families set name = U&'Caf\00E9 One' where id = '00000000-0000-4000-8000-0000000000f1';
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$select public.delete_family(U&'Cafe\0301 One')$$, '22023', null,
  'confirm (documents): canonically equivalent NFD input is refused for an NFC name (strict, fails safe)');
-- Names are stored trimmed (check constraint), so every family's name can be typed back.
select throws_ok($$update public.families set name = ' Spaced ' where id = '00000000-0000-4000-8000-0000000000f1'$$, '23514', null,
  'confirm: a family name with surrounding spaces is refused, so the typed confirmation is always possible');
update public.families set name = U&'Caf\00E9 One' where id = '00000000-0000-4000-8000-0000000000f1';
reset role;
select ok(exists (select 1 from public.families where id = '00000000-0000-4000-8000-0000000000f1'), 'confirm: after every miss, family 1 still exists');

-- ----- Who can call it ------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.delete_family(text)', 'execute'), 'delete: anon key has no EXECUTE');
select tests.as_anon();
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: anon role refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: the family''s iPad refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal2', true);
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: the family''s iPad with an aal2 claim refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: a revoked iPad refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: an unpaired anonymous session refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: the second parent at aal1 refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1', 'aal2', true);
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: a parent uid flagged anonymous refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-00000000a0e1');
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '42501', null, 'delete: a pending invitee refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select throws_ok($$select public.delete_family(U&'Caf\00E9 One')$$, '22023', null, 'delete: family 2''s parent typing family 1''s name is refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.delete_family('wrong')$$, '22023', null, 'delete: the second parent at aal2 passes the role check (equal parents)');
reset role;
select ok(exists (select 1 from public.families where id = '00000000-0000-4000-8000-0000000000f1')
      and exists (select 1 from public.families where id = '00000000-0000-4000-8000-0000000000f2'),
  'delete: both families survive every refused call');

-- ----- The real delete --------------------------------------------------------------------
create temp table others_before as
  select (select count(*) from auth.users where id not in (
            '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
            '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9')) as users,
         (select count(*) from public.parent_allowlist where family_id is distinct from '00000000-0000-4000-8000-0000000000f1'
            and not (family_id is null and email = 'fx-parent-a2@example.test')) as allow;

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$select public.delete_family(U&'Caf\00E9 One')$$, 'delete: an exact NFC name deletes');
reset role;

select is_empty($$select 1 from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9')$$, 'delete: both parents and every iPad (incl. revoked) are gone');
select is_empty($$select 1 from auth.sessions where user_id = '00000000-0000-4000-8000-0000000000a2'$$, 'delete: the second parent''s sessions are gone');
select is_empty($$select 1 from auth.refresh_tokens where token = 'audit-a2-refresh'$$, 'delete: the second parent''s refresh token is gone (no new access tokens)');
select is_empty($$select 1 from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000000a2'$$, 'delete: the second parent''s TOTP factor is gone');
select is_empty($$select 1 from auth.identities where user_id = '00000000-0000-4000-8000-0000000000a2'$$, 'delete: the second parent''s identity is gone');

select is((select users from others_before), (select count(*) from auth.users), 'delete: no other auth user was removed');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000a0e2'), 'delete: an invitee another family also invited keeps their account');
select ok(exists (select 1 from public.parent_allowlist where email = 'audit-invitee-2@example.test' and family_id = '00000000-0000-4000-8000-0000000000f2'),
  'delete: another family''s invitation for the same email stays');
select is_empty($$select 1 from public.parent_allowlist where family_id = '00000000-0000-4000-8000-0000000000f1'$$, 'delete: all of the family''s invitations are gone');
select is_empty($$select 1 from public.parent_allowlist where family_id is null and email = 'fx-parent-a2@example.test'$$, 'delete: the second parent''s leftover bootstrap row is gone');
select ok(exists (select 1 from public.parent_allowlist where family_id is null and email = 'audit-other-bootstrap@example.test'), 'delete: an unrelated bootstrap row stays');
select is((select allow from others_before), (select count(*) from public.parent_allowlist), 'delete: no other allowlist row was removed');
select is((select count(*)::int from public.pairing_attempts where user_id in ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e2')), 2,
  'delete: other users'' lockout rows stay');
select is_empty($$select 1 from public.pairing_attempts where user_id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9')$$,
  'delete: the family''s iPads'' lockout rows are gone');

-- The family-1-only invitee's account is not the family's to delete, and has no access left.
-- (Their auth row lingers until the nightly cleanup_orphans; see the report.)
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000a0e1'),
  'delete (documents): a family-1-only pending invitee''s account is left for cleanup_orphans');
select tests.authenticate('00000000-0000-4000-8000-00000000a0e1');
select is((select role from public.whoami()), 'none', 'delete: the leftover invitee is "none"');
select is_empty('select * from public.my_invites()', 'delete: the leftover invitee has no invitations');
select throws_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'Late')$$, '42501', null, 'delete: the leftover invitee cannot join the deleted family');
reset role;

-- GoTrue's audit log holds the deleted parents' emails, ids and IPs. They are family rows too.
select is_empty($$
  select 1 from auth.audit_log_entries
  where payload ->> 'actor_id' in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000d1')
     or payload ->> 'actor_username' in ('fx-parent-a@example.test', 'fx-parent-a2@example.test')
$$, 'delete: no auth audit-log row (email, user id, IP) of the deleted family''s parents or iPads remains');
select is((select count(*)::int from auth.audit_log_entries
  where payload ->> 'actor_id' in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d2')), 2,
  'delete: other families'' audit-log rows stay');

-- Stale tokens: a deleted parent's still-unexpired JWT can do nothing.
select tests.authenticate('00000000-0000-4000-8000-0000000000a2');
select is((select role from public.whoami()), 'none', 'stale parent JWT: whoami says none');
select throws_ok('select public.export_family()', '42501', null, 'stale parent JWT: cannot export');
select throws_ok($$select public.create_family('Again', 'A2')$$, '42501', null, 'stale parent JWT: cannot create a family');
select throws_ok($$select * from public.create_pairing_code('iPad')$$, '42501', null, 'stale parent JWT: cannot create a pairing code');
select is_empty('select * from public.my_invites()', 'stale parent JWT: no invitations');
select is_empty('select 1 from public.families', 'stale parent JWT: sees no family');
reset role;

-- Stale tokens: a deleted iPad's still-unexpired JWT can't pair into another family.
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
create temp table f2code as select code from public.create_pairing_code('Spare iPad');
reset role;
grant select on f2code to authenticated;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is((select public.redeem_pairing_code((select code from f2code)) ->> 'reason'), 'not_a_device_session',
  'stale iPad JWT: cannot redeem another family''s code');
select is((select role from public.whoami()), 'unpaired', 'stale iPad JWT: whoami says unpaired, no family data');
select is_empty('select 1 from public.kids', 'stale iPad JWT: sees no kids');
reset role;
select is_empty($$select 1 from public.devices where device_user_id = '00000000-0000-4000-8000-0000000000d1'$$, 'stale iPad JWT: no device row was created');

select * from finish();
rollback;
