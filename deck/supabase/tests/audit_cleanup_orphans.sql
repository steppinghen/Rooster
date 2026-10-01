-- AUDIT (slice 2): private.cleanup_orphans() deletes exactly what it should and nothing else.
-- Must keep: parents, paired and revoked iPads, an invited parent mid-onboarding (confirmed,
-- listed, not yet joined), a bootstrap parent mid-onboarding, anything under 24 hours old,
-- live pairing codes and attempts inside their lockout windows, and every family row.
-- Assertions are scoped to fixture ids, because the live local database holds other rows.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

-- Extra users (ids ...aaNN):
--   aa10 invited parent mid-onboarding: confirmed, on family 2's list, no parents row yet
--   aa11 bootstrap parent mid-onboarding: confirmed, bootstrap row, no family yet
--   aa12 invited but never entered the code (unconfirmed): may be removed, can sign in again
--   aa13 stranger created an hour ago (too young to remove)
--   aa14 anonymous, an hour old, not paired yet (mid-pairing)
--   aa15 anonymous, 3 days old, paired a minute ago
--   aa16 phone-only user, no email, in no family
select tests.create_user('fx-invited@example.test', false, '00000000-0000-4000-8000-00000000aa10');
select tests.create_user('fx-bootstrap@example.test', false, '00000000-0000-4000-8000-00000000aa11');
insert into public.parent_allowlist (email, family_id) values ('fx-bootstrap@example.test', null);
select tests.create_user('fx-unconfirmed@example.test', false, '00000000-0000-4000-8000-00000000aa12');
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-00000000aa12';
insert into public.parent_allowlist (email, family_id) values ('fx-unconfirmed@example.test', '00000000-0000-4000-8000-0000000000f1');
select tests.create_user('fx-young@example.test', false, '00000000-0000-4000-8000-00000000aa13');
select tests.create_user(null, true, '00000000-0000-4000-8000-00000000aa14');
select tests.create_user(null, true, '00000000-0000-4000-8000-00000000aa15');
insert into public.devices (family_id, device_user_id, label) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000aa15', 'Late iPad');
select tests.create_user(null, false, '00000000-0000-4000-8000-00000000aa16');
update auth.users set phone = '15555550101', phone_confirmed_at = now() where id = '00000000-0000-4000-8000-00000000aa16';
-- A parent whose own allowlist row is gone is still a parent.
delete from public.parent_allowlist where email = 'fx-parent-a@example.test';

update auth.users set created_at = now() - interval '2 days'
 where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1',
              '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000d2',
              '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2',
              '00000000-0000-4000-8000-00000000aa10', '00000000-0000-4000-8000-00000000aa11', '00000000-0000-4000-8000-00000000aa12',
              '00000000-0000-4000-8000-00000000aa16');
update auth.users set created_at = now() - interval '1 hour'
 where id in ('00000000-0000-4000-8000-00000000aa13', '00000000-0000-4000-8000-00000000aa14');
update auth.users set created_at = now() - interval '3 days' where id = '00000000-0000-4000-8000-00000000aa15';

-- Housekeeping rows.
insert into public.pairing_codes (id, family_id, code_hash, label) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000f1', extensions.crypt('10000001', extensions.gen_salt('bf', 4)), 'Live'),
  ('00000000-0000-4000-8000-00000000c0a2', '00000000-0000-4000-8000-0000000000f1', extensions.crypt('10000002', extensions.gen_salt('bf', 4)), 'Expired 2h'),
  ('00000000-0000-4000-8000-00000000c0a3', '00000000-0000-4000-8000-0000000000f2', extensions.crypt('10000003', extensions.gen_salt('bf', 4)), 'Expired 25h');
update public.pairing_codes set expires_at = now() - interval '2 hours' where id = '00000000-0000-4000-8000-00000000c0a2';
update public.pairing_codes set expires_at = now() - interval '25 hours' where id = '00000000-0000-4000-8000-00000000c0a3';
insert into public.pairing_attempts (user_id, attempted_at) values
  ('00000000-0000-4000-8000-00000000aa14', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-00000000aa14', now() - interval '2 days');
insert into public.pin_attempts (kid_id, user_id, attempted_at) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000d1', now() - interval '1 minute'),
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000d1', now() - interval '2 days');

-- Snapshot of every family-scoped row of the two fixture families, per relation (from the
-- catalog, so a table added later is covered).
create function pg_temp.fam_counts() returns table (rel text, n bigint) language plpgsql as $$
declare t regclass; col text;
begin
  for t, col in
    select c.oid::regclass, case when c.oid = 'public.families'::regclass then 'id' else 'family_id' end
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and (c.oid = 'public.families'::regclass
           or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'family_id' and not a.attisdropped))
      and c.oid <> 'public.pairing_codes'::regclass
  loop
    rel := t::text;
    execute format('select count(*) from %s where %I in (%L, %L)', t, col,
                   '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2') into n;
    return next;
  end loop;
end $$;
create temp table fam_before as select * from pg_temp.fam_counts();

create temp table users_before as select id from auth.users;

select lives_ok($$select private.cleanup_orphans()$$, 'cleanup runs');

-- ----- auth users: exactly the orphans go -----
select results_eq($$
  select b.id::text from users_before b left join auth.users u on u.id = b.id
  where u.id is null and b.id::text like '00000000-0000-4000-8000-0000000000%' or (u.id is null and b.id::text like '00000000-0000-4000-8000-00000000aa%')
  order by 1$$,
  $$values ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2'),
           ('00000000-0000-4000-8000-00000000aa12'), ('00000000-0000-4000-8000-00000000aa16')$$,
  'cleanup: removes only the unlisted stranger, the unpaired anonymous user, the unconfirmed invitee and the phone-only stranger');

select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000aa10'), 'cleanup: keeps an invited parent mid-onboarding (confirmed, not yet joined)');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000aa11'), 'cleanup: keeps a bootstrap parent mid-onboarding');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a1'), 'cleanup: keeps a parent whose allowlist row is gone');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d1')
      and exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d2'), 'cleanup: keeps paired iPads in both families');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d9'), 'cleanup: keeps a revoked iPad until a parent forgets it');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000aa15'), 'cleanup: keeps an old anonymous user that just paired');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000aa14'), 'cleanup: keeps an anonymous user mid-pairing (under 24 hours)');
select ok(exists (select 1 from auth.users where id = '00000000-0000-4000-8000-00000000aa13'), 'cleanup: keeps a stranger under 24 hours old');

-- The invited parent can still finish joining afterwards.
select tests.authenticate('00000000-0000-4000-8000-00000000aa10');
select lives_ok($$select public.accept_invite('00000000-0000-4000-8000-0000000000f2', 'Parent B2')$$, 'cleanup: the kept invitee can still join');
reset role;

-- ----- family data untouched -----
select is_empty($$
  select b.rel || ': ' || b.n || ' -> ' || coalesce(a.n::text, 'gone') from fam_before b
  left join pg_temp.fam_counts() a on a.rel = b.rel
  where a.n is distinct from b.n
    and b.rel::regclass <> 'public.parents'::regclass -- aa10 joined above
$$, 'cleanup: no family-scoped row of either family changed (every table, from the catalog)');
select is((select count(*)::int from public.parents where family_id = '00000000-0000-4000-8000-0000000000f2'), 2, 'cleanup: family 2 parents are Parent B and the new joiner');
select is((select count(*)::int from public.module_catalog), 6, 'cleanup: the module catalog is untouched');

-- ----- housekeeping -----
select results_eq($$select label from public.pairing_codes where id in ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0a2', '00000000-0000-4000-8000-00000000c0a3') order by label$$,
  $$values ('Expired 2h'::text), ('Live'::text)$$, 'cleanup: keeps live and recently expired codes; drops codes expired over a day');
select is((select count(*)::int from public.pairing_attempts where user_id = '00000000-0000-4000-8000-00000000aa14'), 1, 'cleanup: keeps pairing attempts inside the lockout window');
select is((select count(*)::int from public.pin_attempts where user_id = '00000000-0000-4000-8000-0000000000d1'), 1, 'cleanup: keeps PIN attempts inside the lockout window');

-- ----- only the scheduler can run it -----
select ok(not has_function_privilege('authenticated', 'private.cleanup_orphans()', 'execute')
      and not has_function_privilege('anon', 'private.cleanup_orphans()', 'execute'), 'cleanup: not callable by API roles');
select results_eq($$select command, username, active from cron.job where jobname = 'deck-cleanup-orphans'$$,
  $$values ('select private.cleanup_orphans()'::text, 'postgres'::text, true)$$, 'cleanup: the nightly job runs exactly this function');

select * from finish();
rollback;
