-- AUDIT: sessions that hold no role get zero access to every relation in `public`.
--
-- This is the fallback proof for when the before_user_created allowlist hook is unavailable (or
-- bypassed: converting an anonymous user to a permanent one with updateUser({ email }) does
-- not run before_user_created). Every relation is enumerated from the catalog, so a table or
-- view added later is attacked automatically; every probe is select, insert, update and delete.
-- Pass condition per probe: 'none' (filtered to zero rows) or 'denied' (42501).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---- audit harness (identical in every audit_*.sql; created and rolled back per file) --------
-- audit.sweep(fam) probes every relation in `public` (tables, views, matviews, foreign tables,
-- found from the catalog, so a table added later is covered automatically) for select, insert,
-- update and delete, as the CURRENT role. Each probe runs in its own subtransaction and is
-- always rolled back, so a probe that succeeds cannot change data for later assertions.
-- Results: 'none' (0 rows), 'denied' (42501), 'READ n' / 'WROTE n', or 'blocked:<sqlstate>'.
-- Inserts copy a real row (captured as postgres) using only the columns the role may insert,
-- so a constraint error can't mask a missing RLS check (RLS WITH CHECK runs before unique/FK).
create schema audit;
grant usage on schema audit to anon, authenticated;

create function audit.tenancy_col(t regclass) returns text language sql stable set search_path = '' as $$
  select case
    when t = 'public.families'::regclass then 'id'
    when exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = t and a.attname = 'family_id' and not a.attisdropped) then 'family_id'
  end
$$;

create function audit.qn(t regclass) returns text language sql stable set search_path = '' as $$ select t::text $$;

create function audit.relations() returns setof regclass language sql stable set search_path = '' as $$
  select c.oid::regclass from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
  order by c.relname
$$;

create table audit.sample (tbl regclass, fam uuid, row jsonb);
grant select on audit.sample to anon, authenticated;

create function audit.capture() returns void language plpgsql set search_path = '' as $$
declare t regclass; tc text;
begin
  delete from audit.sample;
  for t in select * from audit.relations() loop
    tc := audit.tenancy_col(t);
    if tc is null then
      execute format('insert into audit.sample select %L::regclass, null, pg_catalog.to_jsonb(x) from (select * from %s limit 1) x', t, t);
    else
      execute format('insert into audit.sample select distinct on (x.%I) %L::regclass, x.%I, pg_catalog.to_jsonb(x) from %s x order by x.%I', tc, t, tc, t, tc);
    end if;
  end loop;
end $$;

-- p_fam: when set, restrict the probe to rows of that family (and copy that family's row).
-- p_override: jsonb merged over the copied row before insert (used for retargeting attacks).
create function audit.probe(t regclass, op text, p_fam uuid default null, p_override jsonb default '{}')
returns text language plpgsql set search_path = '' as $$
declare
  tc text := audit.tenancy_col(t);
  w text := case when p_fam is not null and tc is not null then format(' where %I = %L', tc, p_fam) else '' end;
  s jsonb; cols text; ucol text; q text; n bigint := 0; res text;
begin
  if op = 'select' then
    q := format('select count(*) from %s%s', t, w);
  elsif op = 'insert' then
    select a.row || p_override into s from audit.sample a
      where a.tbl = t and (p_fam is null or tc is null or a.fam = p_fam) limit 1;
    select string_agg(quote_ident(attname), ',' order by attnum) into cols from pg_catalog.pg_attribute
      where attrelid = t and attnum > 0 and not attisdropped and attgenerated = ''
        and pg_catalog.has_column_privilege(t, attname, 'INSERT');
    if cols is null or s is null then
      q := format('insert into %s default values', t);
    else
      q := format('insert into %s (%s) select %s from pg_catalog.jsonb_populate_record(null::%s, %L::jsonb)', t, cols, cols, t, s);
    end if;
  elsif op = 'update' then
    select quote_ident(attname) into ucol from pg_catalog.pg_attribute
      where attrelid = t and attnum > 0 and not attisdropped and attgenerated = ''
      order by pg_catalog.has_column_privilege(t, attname, 'UPDATE') desc, attnum limit 1;
    q := format('update %s set %s = %s%s', t, ucol, ucol, w);
  elsif op = 'delete' then
    q := format('delete from %s%s', t, w);
  else
    raise exception 'unknown op %', op;
  end if;
  begin
    if op = 'select' then execute q into n; else execute q; get diagnostics n = row_count; end if;
    raise exception using errcode = 'AUDT0', message = 'undo probe';
  exception
    when sqlstate 'AUDT0' then
      res := case when n = 0 then 'none' when op = 'select' then 'READ ' || n else 'WROTE ' || n end;
    when insufficient_privilege then res := 'denied';
    when others then res := 'blocked:' || sqlstate;
  end;
  return res;
end $$;

create function audit.sweep(p_fam uuid default null)
returns table (tbl text, op text, result text) language sql set search_path = '' as $$
  select r::text, o.op, audit.probe(r, o.op, p_fam)
  from audit.relations() r cross join (values ('select'), ('insert'), ('update'), ('delete')) o (op)
  where p_fam is null or audit.tenancy_col(r) is not null
  order by 1, 2
$$;

grant execute on all functions in schema audit to anon, authenticated;

-- Fixture: the shared two-family fixture, plus a row in every table for BOTH families so that
-- "zero rows" means "filtered", never "empty table".
select tests.make_two_families();
insert into public.pairing_codes (family_id, code_hash, label) values
  ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 8)), 'Code 1'),
  ('00000000-0000-4000-8000-0000000000f2', extensions.crypt('33334444', extensions.gen_salt('bf', 8)), 'Code 2');
insert into public.pairing_attempts (user_id) values ('00000000-0000-4000-8000-0000000000e2'), ('00000000-0000-4000-8000-0000000000d1');
insert into public.pin_attempts (kid_id, user_id) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000d2');
insert into public.routine_completions (family_id, routine_id, kid_id, on_date, completed_steps) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date, '{teeth}'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000cc', current_date, '{teeth}');
insert into public.reset_plans (kid_id, family_id, tools) values
  ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', '{breathe}');
insert into public.usage_events (family_id, kid_id, module_key, action) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'routines', 'opened');
select audit.capture();
-- ---- end harness ------------------------------------------------------------------------------

-- Extra identities for this file.
select tests.create_user('fx-invited@example.test', false, '00000000-0000-4000-8000-0000000000e3');  -- on family 2's allowlist, never joined
select tests.create_user('bootstrap@example.test', false, '00000000-0000-4000-8000-0000000000e4'); -- on a bootstrap (family_id null) row
insert into public.parent_allowlist (email, family_id) values ('bootstrap@example.test', null);
select audit.capture();

-- Non-vacuous: the sweep covers every relation, and every relation has data to find.
select cmp_ok((select count(*)::int from audit.relations()), '>=', 17, 'sweep covers every public relation (17+ in slice 1)');
select is_empty($$select r::text from audit.relations() r where not exists (select 1 from audit.sample s where s.tbl = r)$$,
  'every public relation has at least one row for the sweep to find');
select is_empty($$select r::text from audit.relations() r where audit.tenancy_col(r) is not null
  and (select count(distinct s.fam) from audit.sample s where s.tbl = r) < 2$$,
  'every family-scoped relation has rows in both families');

-- Positive control: the same probes, run as a real parent, do find their family's rows. If the
-- harness were broken, this would fail instead of the zero-access checks silently passing.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok(result like 'READ %', format('control, parent A reads own family: %s -> %s', tbl, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1') where op = 'select'
    -- Lockout rows (Phase 1.5) are reachable by no API role, parents included.
    and tbl <> 'public.display_unlock_attempts';
-- (Builder, slice 4: the insert probe copies an arbitrary family 1 row. Since 1.5 most events
-- are synced, and copying one into a synced calendar is refused by design, which made this
-- control flaky. Check-in moments: any copy is a valid insert (Kid A has 2 of 3).)
select is(audit.probe('public.checkin_moments', 'insert', '00000000-0000-4000-8000-0000000000f1'), 'WROTE 1', 'control: parent A insert probe writes');
select is(audit.probe('public.kids', 'update', '00000000-0000-4000-8000-0000000000f1'), 'WROTE 2', 'control: parent A update probe writes');
-- (Not events: since Phase 1.5 most of a family's events are synced and can't be deleted here.)
select is(audit.probe('public.checkin_moments', 'delete', '00000000-0000-4000-8000-0000000000f1'), 'WROTE 2', 'control: parent A delete probe writes');
select results_eq('select count(*)::int from public.events', 'values (7)', 'control: probes roll themselves back');
select results_eq('select count(*)::int from public.checkin_moments', 'values (2)', 'control: the delete probe rolled back too');
reset role;

-- 1. Signed-in user, email on no allowlist, in no family, MFA passed (aal2).
select tests.authenticate('00000000-0000-4000-8000-0000000000e1', 'aal2', false);
select ok(result in ('none', 'denied'), format('unlisted aal2 user: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 2. Same user at aal1.
select tests.authenticate('00000000-0000-4000-8000-0000000000e1', 'aal1', false);
select ok(result in ('none', 'denied'), format('unlisted aal1 user: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 3. Anonymous auth user that never redeemed a pairing code.
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select ok(result in ('none', 'denied'), format('never-paired anonymous user: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 3b. Never-paired anonymous user presenting aal2 (anonymous users must never count as parents).
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal2', true);
select ok(result in ('none', 'denied'), format('never-paired anonymous user at aal2: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 4. Invited to family 2 (allowlisted) but has not joined: no parents row, so no access yet.
select tests.authenticate('00000000-0000-4000-8000-0000000000e3', 'aal2', false);
select ok(result in ('none', 'denied'), format('invited-not-joined user: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 5. On a bootstrap allowlist row (family_id null) before create_family exists.
select tests.authenticate('00000000-0000-4000-8000-0000000000e4', 'aal2', false);
select ok(result in ('none', 'denied'), format('bootstrap-listed user: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 6. A real parent of family 1 at aal1 (MFA not passed).
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1', false);
select ok(result in ('none', 'denied'), format('aal1 parent: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 7. A parent's user id presented with is_anonymous = true.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1', 'aal2', true);
select ok(result in ('none', 'denied'), format('parent id as anonymous session: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- 8. A paired device's user id presented as a non-anonymous aal2 session.
--    (Reachable in practice: an anonymous user can link an email identity with updateUser.)
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal2', false);
select ok(result in ('none', 'denied'), format('device id as non-anonymous session: %s %s -> %s', tbl, op, result))
  from audit.sweep() where not (tbl = 'public.devices' and op = 'select');
select is_empty('select 1 from public.devices',
  'device id as non-anonymous session: cannot read its old devices row (family_id, label)');
reset role;

-- 9. Revoked device: zero access everywhere, including its own devices row (it learns it was
--    unpaired from whoami(), which reveals no family data). Hardened after the slice 2-4 audit.
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select ok(result in ('none', 'denied'), format('revoked device: %s %s -> %s', tbl, op, result))
  from audit.sweep();
select is_empty($$select 1 from public.devices$$, 'revoked device: cannot read even its own devices row');
reset role;

-- 10. The anon key with no session.
select tests.as_anon();
select ok(result = 'denied', format('anon key: %s %s -> %s', tbl, op, result)) from audit.sweep();
reset role;

-- Nothing above changed any data (every probe rolled itself back).
select is_empty($$
  select s.tbl::text from audit.sample s
  group by s.tbl
  having (select count(*) from audit.sample s2 where s2.tbl = s.tbl) <> count(*)
$$, 'sanity: sample table untouched');

select * from finish();
rollback;
