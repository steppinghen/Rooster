-- AUDIT: "Delete family" removes every row for that family and nothing else.
-- delete_family (slice 6) is not built; it will rely on ON DELETE CASCADE from families. This
-- proves the cascade the RPC depends on: generic over every relation in `public`, comparing a
-- fingerprint of every row NOT belonging to family 1 before and after.
-- One snapshot for the whole file: the local database is shared with running e2e sessions,
-- whose concurrent commits must not show up between a before/after comparison.
begin isolation level repeatable read;
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

-- A bootstrap allowlist row for someone else must survive too.
insert into public.parent_allowlist (email, family_id) values ('bootstrap@example.test', null);

-- Which rows belong to family 1, per relation. Tables without family_id belong through a kid
-- (pin_attempts) or a device user (pairing_attempts); module_catalog is global.
create function audit.f1_filter(t regclass) returns text language sql stable set search_path = '' as $$
  select case
    when audit.tenancy_col(t) is not null then format('%I = %L', audit.tenancy_col(t), '00000000-0000-4000-8000-0000000000f1')
    when t = 'public.pin_attempts'::regclass then $f$kid_id in ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000cb')$f$
    when t = 'public.pairing_attempts'::regclass then $f$user_id in ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9')$f$
    else 'false'
  end
$$;
create function audit.fingerprint(t regclass, mine boolean) returns table (n bigint, digest text)
language plpgsql set search_path = '' as $$
begin
  return query execute format(
    'select count(*), md5(coalesce(string_agg(pg_catalog.to_jsonb(x)::text, '','' order by pg_catalog.to_jsonb(x)::text), '''')) from %s x where (%s) is %s true',
    t, audit.f1_filter(t), case when mine then '' else 'not' end);
end $$;

create temp table before as
  select audit.qn(r) as tbl, (audit.fingerprint(r, true)).n as mine, (audit.fingerprint(r, false)).digest as others
  from audit.relations() r;

select is_empty($$select tbl from before where mine = 0 and tbl not in ('public.module_catalog')$$,
  'non-vacuous: family 1 has rows in every family-owned relation before the delete');

delete from public.families where id = '00000000-0000-4000-8000-0000000000f1';

create temp table after as
  select audit.qn(r) as tbl, (audit.fingerprint(r, true)).n as mine, (audit.fingerprint(r, false)).digest as others
  from audit.relations() r;

select ok(a.mine = 0, format('delete family: no family 1 rows left in %s (%s left)', a.tbl, a.mine))
  from after a where a.tbl <> 'public.pairing_attempts';
select ok(a.others = b.others, format('delete family: rows of other families and global rows unchanged in %s', a.tbl))
  from after a join before b using (tbl);

-- Lockout rows are keyed by user_id with no family link, so the cascade can't reach them.
select is((select mine from after where tbl = 'public.pairing_attempts'), 0::bigint,
  'delete family: the family''s iPads'' pairing attempts are gone');

-- Deleting the family's devices rows removes the iPads' anonymous auth users too (the
-- devices_forgotten trigger); delete_family also removes the parents' accounts.
select is_empty($$select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000d1'$$,
  'delete family: the deleted family''s iPad auth user is gone');
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
-- (blocked:23514: since 1.5 a trigger refuses display modes for a device that isn't a Family display.)
select ok(result in ('none', 'denied') or result = 'blocked:23514', format('former iPad of deleted family: %s %s -> %s', tbl, op, result))
  from audit.sweep() where tbl <> 'public.module_catalog';
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok(result in ('none', 'denied') or result = 'blocked:23514', format('former parent of deleted family: %s %s -> %s', tbl, op, result))
  from audit.sweep() where tbl <> 'public.module_catalog';
reset role;

select * from finish();
rollback;
