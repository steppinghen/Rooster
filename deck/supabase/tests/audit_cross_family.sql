-- AUDIT: no session can read or write another family's rows (parent B and family 2's iPad
-- against family 1, and the reverse), including by pointing its own rows at another family's
-- kids or routines, joining across tables, or learning that another family's row exists.
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

-- Every family-scoped relation carries family_id (or is families). The only exceptions allowed
-- are the global catalog and the two RPC-only lockout tables; a new table without family_id
-- fails here instead of slipping past the sweeps below.
select set_eq($$select audit.qn(r) from audit.relations() r where audit.tenancy_col(r) is null$$,
  array['public.module_catalog', 'public.pairing_attempts', 'public.pin_attempts'],
  'only module_catalog and the lockout tables lack family_id');
select is_empty($$
  select r::text from audit.relations() r
  where audit.qn(r) in ('public.pairing_attempts', 'public.pin_attempts')
    and (has_table_privilege('authenticated', r, 'select,insert,update,delete')
      or exists (select 1 from pg_attribute a where a.attrelid = r and a.attnum > 0
                 and has_column_privilege('authenticated', r, a.attname, 'select,insert,update')))
$$, 'tables without family_id that hold family data have no API privileges at all');

-- ---- the four cross-family directions ----------------------------------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select ok(result in ('none', 'denied'), format('parent B vs family 1: %s %s -> %s', tbl, op, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1');
reset role;

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok(result in ('none', 'denied'), format('parent A vs family 2: %s %s -> %s', tbl, op, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f2');
reset role;

select tests.authenticate('00000000-0000-4000-8000-0000000000d2', 'aal1', true);
select ok(result in ('none', 'denied'), format('family 2 iPad vs family 1: %s %s -> %s', tbl, op, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1');
reset role;

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select ok(result in ('none', 'denied'), format('family 1 iPad vs family 2: %s %s -> %s', tbl, op, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f2');
reset role;

-- The revoked family 1 iPad gets nothing from family 2 either.
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select ok(result in ('none', 'denied'), format('revoked iPad vs family 2: %s %s -> %s', tbl, op, result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f2');
reset role;

-- ---- composite FKs: copy family 2's row, relabel it as family 1, insert as family 1 --------
-- kid_id is pinned to family 2's Kid C so the copied row always points into family 2.
-- Every table whose rows point at a kid or routine must refuse this (23503), so a family can
-- never attach another family's kid or routine to its own rows.
create temp table retarget_tables as
  select distinct con.conrelid::regclass as t
  from pg_constraint con
  where con.contype = 'f' and con.connamespace = 'public'::regnamespace
    and cardinality(con.conkey) > 1
    and con.confrelid in ('public.kids'::regclass, 'public.routines'::regclass);
grant select on retarget_tables to authenticated;

select set_eq('select audit.qn(t) from retarget_tables',
  array['public.feelings_checkins', 'public.kid_focus', 'public.reset_plans', 'public.routine_completions',
        'public.routines', 'public.usage_events', 'public.usage_monthly'],
  'composite (id, family_id) FKs exist on every kid- or routine-linked table');

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok(r not like 'WROTE%', format('parent A relabels family 2 %s row as family 1 -> %s', t, r))
  from (select t::text, audit.probe(t, 'insert', '00000000-0000-4000-8000-0000000000f2',
                 '{"family_id":"00000000-0000-4000-8000-0000000000f1","kid_id":"00000000-0000-4000-8000-0000000000cc"}') r from retarget_tables) x;
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select ok(r not like 'WROTE%', format('family 1 iPad relabels family 2 %s row as family 1 -> %s', t, r))
  from (select t::text, audit.probe(t, 'insert', '00000000-0000-4000-8000-0000000000f2',
                 '{"family_id":"00000000-0000-4000-8000-0000000000f1","kid_id":"00000000-0000-4000-8000-0000000000cc"}') r from retarget_tables) x;
reset role;

-- Parent edits can't move a family 1 routine onto family 2's kid.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$update public.routines set kid_id = '00000000-0000-4000-8000-0000000000cc' where id = '00000000-0000-4000-8000-000000000101'$$,
  '23503', null, 'parent A cannot assign a family 1 routine to family 2''s kid');
reset role;

-- Every FK between two family-scoped tables should carry family_id, so no row can reference
-- another family's row even through a security definer RPC. (Non-blocking today: the only
-- offender, pairing_codes.used_by_device, is not writable through the API.)
select is_empty($$
  select con.conrelid::regclass::text || ' -> ' || con.confrelid::regclass::text || ' (' || con.conname || ')'
  from pg_constraint con
  where con.contype = 'f' and con.connamespace = 'public'::regnamespace
    and con.confrelid <> 'public.families'::regclass
    and audit.tenancy_col(con.conrelid::regclass) is not null
    and audit.tenancy_col(con.confrelid::regclass) is not null
    and not exists (select 1 from pg_attribute a where a.attrelid = con.conrelid
                    and a.attnum = any (con.conkey) and a.attname = 'family_id')
$$, 'every FK between family-scoped tables includes family_id');

-- ---- joins / embedding: RLS composes, nothing leaks through a join ------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select is_empty($$
  select k.nickname from public.kids k
  left join public.routines r on r.family_id = k.family_id
  left join public.kid_focus f on f.kid_id = k.id
  left join public.feelings_checkins c on c.kid_id = k.id
  where k.family_id = '00000000-0000-4000-8000-0000000000f1'
     or r.family_id = '00000000-0000-4000-8000-0000000000f1'
     or c.family_id = '00000000-0000-4000-8000-0000000000f1'
$$, 'parent B: joins across kids/routines/focus/feelings reveal nothing of family 1');
select is_empty($$select 1 from public.kids where id = '00000000-0000-4000-8000-0000000000ca'$$,
  'parent B: cannot see family 1''s kid even by exact id');
reset role;

-- ---- existence oracles: errors must not reveal another family's rows ----------------------
-- parent_allowlist.email is a global primary key, so a parent of ANY family can test whether
-- an email is on another family's allowlist: listed -> 23505, unlisted -> success. Emails are
-- guessable (unlike uuids), so this is a cross-family PII read.
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select lives_ok($$insert into public.parent_allowlist (email, family_id) values ('fx-parent-a@example.test', '00000000-0000-4000-8000-0000000000f2')$$,
  'BLOCKING: parent B cannot learn that fx-parent-a@example.test is on family 1''s allowlist (unique-violation oracle)');
reset role;

-- Same oracle class through primary keys keyed only by kid_id / (routine_id, kid_id, on_date):
-- the error code differs (23505 vs 23503) depending on whether another family's row exists.
-- Requires knowing another family's kid uuid, so non-blocking.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select is(audit.probe('public.kid_focus', 'insert', '00000000-0000-4000-8000-0000000000f2',
          '{"family_id":"00000000-0000-4000-8000-0000000000f1"}'), 'denied',
  'parent A: no direct kid_focus insert at all (writes only through set_focus), so no existence leak');
select is(audit.probe('public.reset_plans', 'insert', '00000000-0000-4000-8000-0000000000f2',
          '{"family_id":"00000000-0000-4000-8000-0000000000f1"}'), 'blocked:23503',
  'parent A: relabelled reset_plans insert fails on the FK, not on family 2''s existing row');
reset role;

select * from finish();
rollback;
