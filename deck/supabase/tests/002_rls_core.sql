-- Core RLS: each role against each Phase 1 table. Fixture: tests.make_two_families() (seed.sql).
-- Ids: ...f1/f2 families, a1 Parent A, a2 Parent A2 (used at aal1), b1 Parent B, d1 iPad,
-- d9 revoked iPad, d2 family-2 iPad, e1 stranger, e2 never-paired anonymous user,
-- ca/cb Kid A/B (family 1), cc Kid C (family 2), 101/201 routines.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
insert into public.pairing_codes (family_id, code_hash, label)
values ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('12345678', extensions.gen_salt('bf', 8)), 'Test');

-- =============================================================================================
-- Parent A: aal2, family 1
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');

select results_eq('select id from public.families', $$values ('00000000-0000-4000-8000-0000000000f1'::uuid)$$,
  'parent: sees only their own family');
select results_eq('select count(*)::int from public.kids', 'values (2)', 'parent: sees only their family''s 2 kids');
select is_empty($$select 1 from public.kids where family_id = '00000000-0000-4000-8000-0000000000f2'$$,
  'parent: cannot see another family''s kids');
select results_eq('select count(*)::int from public.feelings_checkins', 'values (1)',
  'parent: sees their family''s check-ins only');
select results_eq('select count(*)::int from public.events', 'values (2)',
  'parent: sees all their family''s events, including parents-only ones');
select results_eq('select count(*)::int from public.devices', 'values (2)', 'parent: sees their family''s devices only');
select results_eq('select count(*)::int from public.parents', 'values (2)', 'parent: sees their family''s parents only');
select results_eq('select count(*)::int from public.parent_allowlist', 'values (1)',
  'parent: sees their family''s allowlist only (not bootstrap rows, not other families)');
select results_eq('select count(*)::int from public.pairing_codes', 'values (1)', 'parent: sees their family''s pairing codes');
select throws_ok('select pin_hash from public.kids', '42501', null, 'parent: cannot read pin_hash');
select throws_ok('select code_hash from public.pairing_codes', '42501', null, 'parent: cannot read pairing code hashes');
select throws_ok('select * from public.pairing_attempts', '42501', null, 'parent: lockout table is unreachable');

select throws_ok($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f2', 'Sneaky', 'reader')$$,
  '42501', null, 'parent: cannot add a kid to another family');
select lives_ok($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f1', 'Kid D', 'reader')$$,
  'parent: can add a kid to their own family');
select results_eq($$with u as (update public.kids set nickname = 'Hacked' where id = '00000000-0000-4000-8000-0000000000cc' returning 1) select count(*)::int from u$$,
  'values (0)', 'parent: cannot rename another family''s kid');
select results_eq($$with u as (update public.kid_focus set mode = 'lights_out' where kid_id = '00000000-0000-4000-8000-0000000000ca' returning 1) select count(*)::int from u$$,
  'values (1)', 'parent: can change their kid''s focus mode');
select results_eq($$with u as (update public.kid_focus set mode = 'lights_out' where kid_id = '00000000-0000-4000-8000-0000000000cc' returning 1) select count(*)::int from u$$,
  'values (0)', 'parent: cannot change another family''s focus mode');
select results_eq($$select updated_by from public.kid_focus where kid_id = '00000000-0000-4000-8000-0000000000ca'$$,
  $$values ('00000000-0000-4000-8000-0000000000a1'::uuid)$$, 'kid_focus.updated_by is stamped by the server');
select throws_ok($$insert into public.parents (family_id, user_id, display_name) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'Mallory')$$,
  '42501', null, 'parent: cannot add a parents row directly (only through RPCs)');
select throws_ok($$insert into public.parent_allowlist (email, family_id) values ('x@example.test', '00000000-0000-4000-8000-0000000000f2')$$,
  '42501', null, 'parent: cannot add an allowlist entry for another family');
select throws_ok($$insert into public.parent_allowlist (email, family_id) values ('boot@example.test', null)$$,
  '42501', null, 'parent: cannot create a bootstrap (family-less) allowlist entry');
select throws_ok($$update public.devices set revoked_at = null$$, '42501', null, 'parent: cannot un-revoke a device directly');
select throws_ok($$insert into public.family_modules (family_id, module_key, enabled) values ('00000000-0000-4000-8000-0000000000f1', 'wave_check', false)
  on conflict (family_id, module_key) do update set enabled = false$$,
  '23514', null, 'parent: Wave Check cannot be switched off');
reset role;

-- =============================================================================================
-- Parent A2: a real parent of family 1, but MFA not passed (aal1). Must get nothing.
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select is_empty('select 1 from public.families', 'aal1 parent: sees no family (MFA enforced in the database)');
select is_empty('select 1 from public.kids', 'aal1 parent: sees no kids');
select is_empty('select 1 from public.feelings_checkins', 'aal1 parent: sees no check-ins');
select throws_ok($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f1', 'X', 'reader')$$,
  '42501', null, 'aal1 parent: cannot add a kid');
select results_eq($$with u as (update public.kid_focus set mode = 'lights_out' returning 1) select count(*)::int from u$$,
  'values (0)', 'aal1 parent: cannot change focus modes');
reset role;

-- A parent's id presented as an anonymous session is not a parent.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1', 'aal2', true);
select is_empty('select 1 from public.kids', 'parent id with is_anonymous=true: no access');
reset role;

-- =============================================================================================
-- Device 1: paired iPad in family 1 (anonymous session)
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);

select results_eq('select id from public.families', $$values ('00000000-0000-4000-8000-0000000000f1'::uuid)$$,
  'device: sees its own family only');
select results_eq('select count(*)::int from public.kids', 'values (3)', 'device: sees its family''s kids (Kid A, Kid B, and Kid D added above)');
select throws_ok('select pin_hash from public.kids', '42501', null, 'device: cannot read pin_hash');
select throws_ok('select * from public.kids', '42501', null, 'device: select * on kids is refused (pin_hash column)');
select is_empty('select 1 from public.parents', 'device: cannot see parents');
select is_empty('select 1 from public.parent_allowlist', 'device: cannot see the allowlist');
select is_empty('select 1 from public.pairing_codes', 'device: cannot see pairing codes');
select results_eq('select title from public.events', $$values ('Beach trip')$$, 'device: sees only kid-visible events');
select is_empty('select 1 from public.feelings_checkins', 'device: cannot read check-ins');
select is_empty('select 1 from public.usage_events', 'device: cannot read usage events');
select results_eq('select count(*)::int from public.devices', 'values (1)', 'device: sees only its own device row');

select lives_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'rolling', 1)$$,
  'device: can record a check-in for a kid in its family');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'rolling', 1)$$,
  '42501', null, 'device: cannot record a check-in in another family');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cc', 'rolling', 1)$$,
  '23503', null, 'device: cannot attach another family''s kid to its own family (composite FK)');
select lives_ok($$insert into public.routine_completions (family_id, routine_id, kid_id, on_date, completed_steps) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date, '{teeth}')$$,
  'device: can record routine progress');
select throws_ok($$insert into public.routine_completions (family_id, routine_id, kid_id, on_date) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000ca', current_date)$$,
  '23503', null, 'device: cannot record progress on another family''s routine');
select lives_ok($$insert into public.reset_plans (kid_id, family_id, tools) values ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-0000000000f1', '{balloon}')$$,
  'device: can save a reset plan');
select lives_ok($$insert into public.usage_events (family_id, kid_id, module_key, action) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000cb', 'wave_check', 'opened')$$,
  'device: can log usage');

-- Parent actions a device must never perform.
select throws_ok($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f1', 'X', 'reader')$$,
  '42501', null, 'device: cannot add a kid');
select results_eq($$with u as (update public.kids set nickname = 'X' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot edit kids');
select results_eq($$with u as (delete from public.kids returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot delete kids');
select results_eq($$with u as (update public.kid_focus set mode = 'everything' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot change focus modes');
select throws_ok($$insert into public.kid_focus (kid_id, family_id, mode) values ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-0000000000f1', 'everything')$$,
  '42501', null, 'device: cannot create a focus mode row');
select throws_ok('delete from public.kid_focus', '42501', null, 'device: cannot delete focus modes (nobody can; rows go with their kid)');
select results_eq($$with u as (update public.families set name = 'X' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot rename the family');
select results_eq($$with u as (update public.devices set ground = 'night', label = 'Mine' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot change device settings, even its own');
select results_eq($$with u as (delete from public.devices returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot delete devices');
select throws_ok($$insert into public.routines (family_id, slot, name, starts_at, steps) values ('00000000-0000-4000-8000-0000000000f1', 'morning', 'X', '07:00', '[{"id":"a","text":"A","icon":"star"}]')$$,
  '42501', null, 'device: cannot create routines');
select results_eq($$with u as (update public.routines set name = 'X' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot edit routines');
select throws_ok($$insert into public.events (family_id, title, on_date) values ('00000000-0000-4000-8000-0000000000f1', 'X', current_date)$$,
  '42501', null, 'device: cannot create events');
select results_eq($$with u as (delete from public.events returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot delete events');
select throws_ok($$insert into public.family_modules (family_id, module_key) values ('00000000-0000-4000-8000-0000000000f1', 'session')$$,
  '42501', null, 'device: cannot enable modules');
select results_eq($$with u as (update public.family_modules set settings = '{"x":1}' returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot change module settings');
select throws_ok($$insert into public.parent_allowlist (email, family_id) values ('me@example.test', '00000000-0000-4000-8000-0000000000f1')$$,
  '42501', null, 'device: cannot invite a parent');
select results_eq($$with u as (delete from public.routine_completions returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot delete routine history');
select results_eq($$with u as (delete from public.feelings_checkins returning 1) select count(*)::int from u$$, 'values (0)', 'device: cannot delete check-ins');
reset role;

-- A device's id presented as a non-anonymous session is not a device.
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal2', false);
select is_empty('select 1 from public.kids', 'device id with is_anonymous=false: no access');
reset role;

-- =============================================================================================
-- Revoked device: loses access on its next request
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select is_empty('select 1 from public.families', 'revoked device: sees no family');
select is_empty('select 1 from public.kids', 'revoked device: sees no kids');
select is_empty('select 1 from public.routines', 'revoked device: sees no routines');
select is_empty('select 1 from public.kid_focus', 'revoked device: sees no focus modes');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1)$$,
  '42501', null, 'revoked device: cannot write');
select results_eq('select revoked_at is not null from public.devices', 'values (true)', 'revoked device: can still see that it was revoked');
reset role;

-- Revoking takes effect immediately for a device that was working.
update public.devices set revoked_at = now() where id = '00000000-0000-4000-8000-000000000dd1';
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select is_empty('select 1 from public.kids', 'device revoked mid-session: next request sees nothing');
reset role;
update public.devices set revoked_at = null where id = '00000000-0000-4000-8000-000000000dd1';

-- =============================================================================================
-- Signed-in user on no allowlist and in no family (the fallback if the sign-up hook is
-- unavailable): zero access everywhere.
-- =============================================================================================
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select is_empty('select 1 from public.families', 'stranger: no families');
select is_empty('select 1 from public.parents', 'stranger: no parents');
select is_empty('select 1 from public.parent_allowlist', 'stranger: no allowlist rows');
select is_empty('select 1 from public.kids', 'stranger: no kids');
select is_empty('select 1 from public.routines', 'stranger: no routines');
select is_empty('select 1 from public.routine_completions', 'stranger: no routine history');
select is_empty('select 1 from public.events', 'stranger: no events');
select is_empty('select 1 from public.feelings_checkins', 'stranger: no check-ins');
select is_empty('select 1 from public.reset_plans', 'stranger: no reset plans');
select is_empty('select 1 from public.family_modules', 'stranger: no modules');
select is_empty('select 1 from public.kid_focus', 'stranger: no focus modes');
select is_empty('select 1 from public.usage_events', 'stranger: no usage');
select is_empty('select 1 from public.devices', 'stranger: no devices');
select is_empty('select 1 from public.pairing_codes', 'stranger: no pairing codes');
select throws_ok($$insert into public.kids (family_id, nickname, age_band) values ('00000000-0000-4000-8000-0000000000f1', 'X', 'reader')$$,
  '42501', null, 'stranger: cannot add a kid');
select throws_ok($$insert into public.parent_allowlist (email, family_id) values ('stranger@example.test', '00000000-0000-4000-8000-0000000000f1')$$,
  '42501', null, 'stranger: cannot add themself to a family''s allowlist');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1)$$,
  '42501', null, 'stranger: cannot write check-ins');
select throws_ok($$insert into public.usage_events (family_id, module_key, action) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'opened')$$,
  '42501', null, 'stranger: cannot write usage');
reset role;

-- Anonymous user that never redeemed a pairing code: zero access.
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select is_empty('select 1 from public.families', 'unpaired anonymous user: no families');
select is_empty('select 1 from public.kids', 'unpaired anonymous user: no kids');
select is_empty('select 1 from public.events', 'unpaired anonymous user: no events');
select throws_ok($$insert into public.routine_completions (family_id, routine_id, kid_id, on_date) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date)$$,
  '42501', null, 'unpaired anonymous user: cannot write');
reset role;

-- =============================================================================================
-- anon key only (no session)
-- =============================================================================================
select tests.as_anon();
select throws_ok('select 1 from public.families', '42501', null, 'anon: families refused');
select throws_ok('select 1 from public.kids', '42501', null, 'anon: kids refused');
select throws_ok('select 1 from public.module_catalog', '42501', null, 'anon: module catalog refused');
select throws_ok($$insert into public.usage_events (family_id, module_key, action) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'opened')$$,
  '42501', null, 'anon: cannot write');
reset role;

-- =============================================================================================
-- Data integrity checks that back the policies
-- =============================================================================================
select throws_ok($$insert into public.routines (family_id, slot, name, starts_at, steps) values ('00000000-0000-4000-8000-0000000000f1', 'morning', 'Bad', '07:00', '[{"id":"a","text":"A","icon":"x"},{"id":"a","text":"B","icon":"x"}]')$$,
  '23514', null, 'routine step ids must be unique');
select throws_ok($$insert into public.kids (family_id, nickname, age_band, birthday_month, birthday_day) values ('00000000-0000-4000-8000-0000000000f1', 'X', 'reader', 2, 30)$$,
  '23514', null, 'birthdays must be a real month and day');
select throws_ok($$insert into public.kids (family_id, nickname, age_band, birthday_month) values ('00000000-0000-4000-8000-0000000000f1', 'X', 'reader', 2)$$,
  '23514', null, 'birthday month and day come together');

select * from finish();
rollback;
