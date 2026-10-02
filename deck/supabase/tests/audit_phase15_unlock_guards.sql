-- AUDIT (Phase 1.5 slice 1): the kitchen display unlock, before its RPCs exist (slice 15).
--
-- These are the contract slice 15 must keep. The fixture already holds an ACTIVE unlock (ee1)
-- of the Kitchen iPad (d1) by Parent A, so every assertion here runs with a live unlock row:
--   1. Phone-only actions (kid and parent PINs, pairing and unpairing, parent accounts, export,
--      delete family) are refused to the display even while it is unlocked. Forever.
--   2. No client can create, extend, end or revive an unlock row.
--   3. An expired unlock, an ended one (Lock), one on a revoked display, one on a display whose
--      parent unlock was turned off or whose job is now Kid's iPad, and another device's
--      unlock all give nothing parent-only.
-- Plain assertions are blocking; todo() blocks are non-blocking hardening.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_phase15();

create function pg_temp.probe(uid uuid, aal text, anon boolean, q text) returns text language plpgsql as $$
declare r text;
begin
  begin
    if uid is null then perform tests.as_anon(); else perform tests.authenticate(uid, aal, anon); end if;
    execute q into r;
    raise exception 'probe-done' using detail = coalesce(r, 'null');
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm = 'probe-done' then
      get stacked diagnostics r = pg_exception_detail;
      return 'ok:' || r;
    end if;
    return 'err:' || sqlstate;
  end;
end $$;
create function pg_temp.d1(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d1', 'aal1', true, q) $$;
create function pg_temp.d3(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d3', 'aal1', true, q) $$;
-- d1's id presented as a non-anonymous, MFA-passed user: the display must not "become" a parent.
create function pg_temp.d1_forged(q text) returns text language sql as $$ select pg_temp.probe('00000000-0000-4000-8000-0000000000d1', 'aal2', false, q) $$;

select ok(exists (select 1 from public.display_unlocks where id = '00000000-0000-4000-8000-000000000ee1'
                  and ended_at is null and expires_at > now() and device_id = '00000000-0000-4000-8000-000000000dd1'),
  'setup: the Kitchen iPad has an active unlock by Parent A');

-- ---- 1. phone-only actions, refused while unlocked ------------------------------------------------
create temp table phone_only (what text, q text, want text);
insert into phone_only values
  ('set a kid PIN', $$select public.set_kid_pin('00000000-0000-4000-8000-0000000000cb', '1111')::text$$, 'err:42501'),
  ('clear a kid PIN', $$select public.set_kid_pin('00000000-0000-4000-8000-0000000000ca', null)::text$$, 'err:42501'),
  ('read a kid PIN hash', $$select pin_hash from public.kids limit 1$$, 'err:42501'),
  ('read the parent PIN hash', $$select unlock_pin_hash from public.parents limit 1$$, 'err:42501'),
  ('write the parent PIN hash', $$update public.parents set unlock_pin_hash = null$$, 'err:42501'),
  ('make a pairing code', $$select code from public.create_pairing_code('Sneaky iPad')$$, 'err:42501'),
  ('cancel a pairing code', $$select public.cancel_pairing_code(gen_random_uuid())::text$$, 'err:42501'),
  ('list pairing codes', $$select count(*)::text from public.pairing_codes$$, 'ok:0'),
  ('unpair a kid iPad', $$select public.revoke_device('00000000-0000-4000-8000-000000000dd3')::text$$, 'err:42501'),
  ('unpair itself', $$select public.revoke_device('00000000-0000-4000-8000-000000000dd1')::text$$, 'err:42501'),
  ('forget a revoked iPad', $$with d as (delete from public.devices where id = '00000000-0000-4000-8000-000000000dd9' returning 1) select count(*)::text from d$$, 'ok:0'),
  ('set revoked_at directly', $$update public.devices set revoked_at = now() where id = '00000000-0000-4000-8000-000000000dd3'$$, 'err:42501'),
  ('invite a parent', $$insert into public.parent_allowlist (email, family_id) values ('new@example.test', '00000000-0000-4000-8000-0000000000f1') returning 'x'$$, 'err:42501'),
  ('withdraw an invite', $$with d as (delete from public.parent_allowlist returning 1) select count(*)::text from d$$, 'ok:0'),
  ('read the parent list', $$select count(*)::text from public.parents$$, 'ok:0'),
  ('rename a parent', $$with u as (update public.parents set display_name = 'X' returning 1) select count(*)::text from u$$, 'ok:0'),
  ('accept an invite as itself', $$select public.accept_invite('00000000-0000-4000-8000-0000000000f1', 'Kitchen')::text$$, 'err:42501'),
  ('export all family data', $$select public.export_family()::text$$, 'err:42501'),
  ('delete the family', $$select public.delete_family('Family One')::text$$, 'err:42501');

select is(pg_temp.d1(p.q), p.want, format('unlocked display, phone-only: cannot %s', p.what)) from phone_only p;
select is(pg_temp.d1_forged(p.q), p.want, format('display id as a forged non-anonymous aal2 session, phone-only: cannot %s', p.what)) from phone_only p;

-- Nothing changed.
select ok((select revoked_at is null from public.devices where id = '00000000-0000-4000-8000-000000000dd3'), 'phone-only: Kid A''s iPad is still paired');
select ok((select has_pin from public.kids where id = '00000000-0000-4000-8000-0000000000ca') and not (select has_pin from public.kids where id = '00000000-0000-4000-8000-0000000000cb'),
  'phone-only: kid PINs unchanged');
select is((select count(*)::int from public.pairing_codes where family_id = '00000000-0000-4000-8000-0000000000f1'), 0, 'phone-only: no pairing code was made');
select is((select count(*)::int from public.parents where family_id = '00000000-0000-4000-8000-0000000000f1'), 2, 'phone-only: still the same two parents');

-- ---- 2. unlock rows: only the server function writes them ---------------------------------------
create temp table unlock_writers (who text, uid uuid, aal text, anon boolean);
insert into unlock_writers values
  ('the display', '00000000-0000-4000-8000-0000000000d1', 'aal1', true),
  ('a kid iPad', '00000000-0000-4000-8000-0000000000d3', 'aal1', true),
  ('a revoked iPad', '00000000-0000-4000-8000-0000000000d9', 'aal1', true),
  ('the other family''s display', '00000000-0000-4000-8000-0000000000d2', 'aal1', true),
  ('Parent A (phone)', '00000000-0000-4000-8000-0000000000a1', 'aal2', false),
  ('the other family''s parent', '00000000-0000-4000-8000-0000000000b1', 'aal2', false),
  ('a stranger', '00000000-0000-4000-8000-0000000000e1', 'aal2', false),
  ('the anon key', null, null, null);
select is(pg_temp.probe(w.uid, w.aal, w.anon, format(q.q, '00000000-0000-4000-8000-000000000ee1')), 'err:42501', format('unlock rows: %s cannot %s', w.who, q.what))
  from unlock_writers w cross join (values
    ('create one', $q$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '2 minutes') returning 'x' -- %s$q$),
    ('extend one', $q$update public.display_unlocks set expires_at = expires_at + interval '20 minutes' where id = %L$q$),
    ('end one (Lock goes through the server)', $q$update public.display_unlocks set ended_at = now() where id = %L$q$),
    ('move one to another display', $q$update public.display_unlocks set device_id = '00000000-0000-4000-8000-000000000dd3' where id = %L$q$),
    ('delete one (wipe the history)', $q$delete from public.display_unlocks where id = %L$q$),
    ('clear its own lockout', $q$delete from public.display_unlock_attempts -- %s$q$),
    ('add lockout rows to someone else', $q$insert into public.display_unlock_attempts (family_id, device_user_id) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000d2') returning 'x' -- %s$q$)
  ) as q(what, q);
select is((select count(*)::int from public.display_unlock_attempts where device_user_id = '00000000-0000-4000-8000-0000000000d1'), 1, 'unlock attempts: the display''s lockout row is still there');

-- Reading: only the family's parents, never the display, another device or another family.
select is(pg_temp.d1($$select count(*)::text from public.display_unlocks$$), 'ok:0', 'unlock rows: the display reads none directly');
select is(pg_temp.d3($$select count(*)::text from public.display_unlocks$$), 'ok:0', 'unlock rows: a kid iPad reads none');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000b1', 'aal2', false, $$select count(*)::text from public.display_unlocks where family_id = '00000000-0000-4000-8000-0000000000f1'$$), 'ok:0',
  'unlock rows: the other family''s parent reads none of ours');
select is(pg_temp.probe('00000000-0000-4000-8000-0000000000d2', 'aal1', true, $$select count(*)::text from public.display_unlocks$$), 'ok:0',
  'unlock rows: the other family''s (unlocked) display reads none');

-- ---- 3. stale, ended and borrowed unlocks give nothing parent-only ---------------------------------
-- Parent-only reads that a *valid* unlock may open in slice 15; here each variant must stay at 0.
create temp table parent_reads (tbl text);
insert into parent_reads values ('parents'), ('feelings_checkins'), ('feelings_notes'), ('meals'), ('dinner_plan'),
  ('usage_events'), ('usage_monthly'), ('display_unlocks'), ('parent_calendar_prefs'), ('parent_allowlist'), ('pairing_codes');
create function pg_temp.parent_reads_as(uid uuid) returns table (tbl text, result text) language sql as $$
  select r.tbl, pg_temp.probe(uid, 'aal1', true, format('select count(*)::text from public.%I where family_id = %L', r.tbl, '00000000-0000-4000-8000-0000000000f1'))
  from parent_reads r
$$;
create function pg_temp.parent_writes_as(uid uuid) returns table (what text, result text) language sql as $$
  select * from (values
    ('turn a kid''s look switch off', pg_temp.probe(uid, 'aal1', true, $q$with u as (update public.kids set can_change_look = false where family_id = '00000000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$q$)),
    ('plan a dinner', pg_temp.probe(uid, 'aal1', true, $q$with u as (update public.dinner_plan set kind = 'none', options = '{}' where family_id = '00000000-0000-4000-8000-0000000000f1' and kind = 'undecided' returning 1) select count(*)::text from u$q$)),
    ('show a hidden event to kids', pg_temp.probe(uid, 'aal1', true, $q$with u as (update public.events set kid_visibility = 'shown' where id = '00000000-0000-4000-8000-00000000e1c0' returning 1) select count(*)::text from u$q$)),
    ('turn a kid iPad into a display', pg_temp.probe(uid, 'aal1', true, $q$with u as (update public.devices set job = 'display', parent_unlock = true where id = '00000000-0000-4000-8000-000000000dd3' returning 1) select count(*)::text from u$q$)),
    ('change a calendar''s kid default', pg_temp.probe(uid, 'aal1', true, $q$with u as (update public.calendars set kids_default = 'shown' where id = '00000000-0000-4000-8000-000000000c1c' returning 1) select count(*)::text from u$q$))
  ) v(what, result)
$$;

-- 3a. Expired: created 10 minutes ago, expired 9 minutes ago.
update public.display_unlocks set created_at = now() - interval '10 minutes', expires_at = now() - interval '9 minutes' where id = '00000000-0000-4000-8000-000000000ee1';
select is(r.result, 'ok:0', format('expired unlock: the display reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d1') r;
select is(r.result, 'ok:0', format('expired unlock: the display cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d1') r;

-- 3b. Ended by Lock (still inside its expiry).
update public.display_unlocks set created_at = now(), expires_at = now() + interval '2 minutes', ended_at = now() where id = '00000000-0000-4000-8000-000000000ee1';
select is(r.result, 'ok:0', format('ended unlock (Lock): the display reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d1') r;
select is(r.result, 'ok:0', format('ended unlock (Lock): the display cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d1') r;

-- 3c. Active, but borrowed: another device of the family, and the other family's display.
-- (Builder, slice 1 fix: Lock is final now, so the ended unlock is replaced, not revived.)
delete from public.display_unlocks where id = '00000000-0000-4000-8000-000000000ee1';
insert into public.display_unlocks (id, family_id, device_id, parent_user_id, expires_at) values
  ('00000000-0000-4000-8000-000000000ee1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000a1', now() + interval '2 minutes');
select is(r.result, 'ok:0', format('another device''s unlock: a kid iPad reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d3') r;
select is(r.result, 'ok:0', format('another device''s unlock: a kid iPad cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d3') r;
select is(r.result, 'ok:0', format('another family''s unlock: their display reads nothing of ours from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d2') r;
select is(r.result, 'ok:0', format('another family''s unlock: their display cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d2') r;
select is(r.result, 'ok:0', format('active unlock: a revoked iPad of the family reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d9') r;

-- 3d. Active, but the parent turned Parent unlock off for this display.
update public.devices set parent_unlock = false where id = '00000000-0000-4000-8000-000000000dd1';
select is(r.result, 'ok:0', format('unlock switched off: the display reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d1') r;
select is(r.result, 'ok:0', format('unlock switched off: the display cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d1') r;

-- 3e. Active, but the iPad's job is now Kid's iPad.
update public.devices set parent_unlock = true, job = 'kid' where id = '00000000-0000-4000-8000-000000000dd1';
select is(r.result, 'ok:0', format('job changed to kid: the iPad reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d1') r;
select is(r.result, 'ok:0', format('job changed to kid: the iPad cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d1') r;

-- 3f. Active, but the display was unpaired.
update public.devices set job = 'display', revoked_at = now() where id = '00000000-0000-4000-8000-000000000dd1';
select is(r.result, 'ok:0', format('unpaired display: reads nothing from %s', r.tbl)) from pg_temp.parent_reads_as('00000000-0000-4000-8000-0000000000d1') r;
select is(r.result, 'ok:0', format('unpaired display: cannot %s', r.what)) from pg_temp.parent_writes_as('00000000-0000-4000-8000-0000000000d1') r;
select is(pg_temp.d1($$select count(*)::text from public.kids$$), 'ok:0', 'unpaired display: not even kid-facing reads');
update public.devices set revoked_at = null where id = '00000000-0000-4000-8000-000000000dd1';

-- ---- non-blocking: schema backstops for the slice 15 server function -------------------------------
-- The server function will run as the definer, so these are what the schema itself would refuse
-- if that function ever got a check wrong. Today the foreign keys only check the family.
-- (Promoted from todo: fixed in slice 1 after the review.)
select throws_ok($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd3', '00000000-0000-4000-8000-0000000000a1', now() + interval '2 minutes')$$,
  '23514', null, 'unlock schema: not for a kid iPad (job kid, Parent unlock off)');
select throws_ok($$insert into public.display_unlocks (family_id, device_id, parent_user_id, expires_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000dd9', '00000000-0000-4000-8000-0000000000a1', now() + interval '2 minutes')$$,
  '23514', null, 'unlock schema: not for a revoked iPad');
update public.display_unlocks set ended_at = now() where id = '00000000-0000-4000-8000-000000000ee1';
-- (Promoted from todo: fixed in slice 1 after the review.)
select throws_ok($$update public.display_unlocks set ended_at = null where id = '00000000-0000-4000-8000-000000000ee1'$$,
  '23514', null, 'unlock schema: an ended unlock can''t be revived');

select * from finish();
rollback;
