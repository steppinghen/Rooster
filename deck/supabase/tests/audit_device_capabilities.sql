-- AUDIT: what a paired iPad can do in its OWN family. The allowed capabilities are listed
-- explicitly; every other (relation, operation) pair, including on any table added later, must
-- be 'none' or 'denied'. Then targeted attacks: PIN and code hashes through every SQL path,
-- server-set columns, read-back through RETURNING, upserts into parent-only tables.
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

create temp table device_allowed (tbl text, op text);
insert into device_allowed values
  -- kid-facing reads
  ('public.families', 'select'), ('public.kids', 'select'), ('public.routines', 'select'),
  ('public.routine_completions', 'select'), ('public.events', 'select'), ('public.reset_plans', 'select'),
  ('public.module_catalog', 'select'), ('public.family_modules', 'select'), ('public.kid_focus', 'select'),
  ('public.devices', 'select'),
  -- kid-facing writes
  ('public.routine_completions', 'insert'), ('public.routine_completions', 'update'),
  ('public.feelings_checkins', 'insert'),
  ('public.reset_plans', 'insert'), ('public.reset_plans', 'update'),
  ('public.usage_events', 'insert');
grant select on device_allowed to authenticated;

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);

select ok(s.result in ('none', 'denied'), format('device, own family, not allowed: %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1') s
  where not exists (select 1 from device_allowed a where a.tbl = s.tbl and a.op = s.op);
-- Lockout tables have no family_id, so sweep them unfiltered.
select ok(s.result = 'denied', format('device: lockout table %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep() s where s.tbl in ('public.pairing_attempts', 'public.pin_attempts');
-- The allowed list is exact: each allowed capability really works (no stale entries).
select ok(s.result not in ('none', 'denied'), format('device, own family, allowed: %s %s -> %s', s.tbl, s.op, s.result))
  from audit.sweep('00000000-0000-4000-8000-0000000000f1') s
  join device_allowed a on a.tbl = s.tbl and a.op = s.op;

-- Reads that are allowed are still narrowed.
select results_eq('select id from public.devices', $$values ('00000000-0000-4000-8000-000000000dd1'::uuid)$$,
  'device: reads only its own devices row, not the family''s other iPads');
select results_eq('select title from public.events', $$values ('Beach trip')$$, 'device: reads only kid-visible events');

-- ---- PIN hashes: no path reads, filters on, sorts by, or writes pin_hash ------------------
select throws_ok('select pin_hash from public.kids', '42501', null, 'device pin_hash: direct column');
select throws_ok('select * from public.kids', '42501', null, 'device pin_hash: select *');
select throws_ok('select k from public.kids k', '42501', null, 'device pin_hash: whole-row reference');
select throws_ok('select to_jsonb(k) from public.kids k', '42501', null, 'device pin_hash: to_jsonb(row)');
select throws_ok($$select nickname from public.kids where pin_hash = extensions.crypt('1234', pin_hash)$$, '42501', null,
  'device pin_hash: cannot test a guess in WHERE');
select throws_ok('select nickname from public.kids order by pin_hash', '42501', null, 'device pin_hash: cannot sort by it');
select throws_ok($$select r.name from public.routines r join public.kids k on k.id = r.kid_id and k.pin_hash is not null$$, '42501', null,
  'device pin_hash: cannot reference it in a join');
select throws_ok($$update public.kids set nickname = nickname where pin_hash is null$$, '42501', null,
  'device pin_hash: cannot reference it in an UPDATE filter');
select throws_ok($$update public.kids set pin_hash = null$$, '42501', null, 'device pin_hash: cannot clear a sibling''s PIN');
select results_eq($$select nickname, has_pin from public.kids order by nickname$$,
  $$values ('Kid A'::text, true), ('Kid B', false)$$, 'device: sees has_pin only (needed for the picker)');
select throws_ok('select code_hash from public.pairing_codes', '42501', null, 'device: cannot read code_hash');

-- ---- feelings: write-only for devices ----------------------------------------------------
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1) returning feeling, size$$,
  '42501', null, 'device: cannot read a check-in back through INSERT ... RETURNING');
select throws_ok($$insert into public.feelings_checkins (family_id, kid_id, feeling, size, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'flat', 1, now() + interval '1 year')$$,
  '42501', null, 'device: cannot set created_at on a check-in (no dodging or triggering the 30-day job)');
select throws_ok($$update public.feelings_checkins set size = 0$$, '42501', null, 'device: check-ins are never updatable');
select is_empty($$select 1 from public.kids k join public.feelings_checkins f on f.kid_id = k.id$$,
  'device: no check-in leaks through a join (kids see their current check-in only via a later RPC)');

-- ---- server-set and identity columns are not client-writable ------------------------------
select throws_ok($$insert into public.usage_events (family_id, module_key, action, created_at) values
  ('00000000-0000-4000-8000-0000000000f1', 'routines', 'opened', now() - interval '1 year')$$,
  '42501', null, 'device: cannot backdate usage events (90-day retention)');
select throws_ok($$update public.routine_completions set kid_id = '00000000-0000-4000-8000-0000000000cb'$$, '42501', null,
  'device: cannot move a completion to another kid');
select throws_ok($$update public.routine_completions set family_id = '00000000-0000-4000-8000-0000000000f2'$$, '42501', null,
  'device: cannot move a completion to another family');
select throws_ok($$update public.routine_completions set updated_at = now() - interval '1 year'$$, '42501', null,
  'device: cannot set updated_at');
select throws_ok($$update public.reset_plans set kid_id = '00000000-0000-4000-8000-0000000000cb'$$, '42501', null,
  'device: cannot re-key a reset plan');
select throws_ok($$update public.reset_plans set family_id = '00000000-0000-4000-8000-0000000000f2'$$, '42501', null,
  'device: cannot move a reset plan to another family');

-- ---- upserts into parent-only tables -----------------------------------------------------
select throws_ok($$insert into public.kid_focus (kid_id, family_id, mode) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', 'everything')
  on conflict (family_id, kid_id) do update set mode = 'everything', ends_at = null$$,
  '42501', null, 'device: cannot upsert its way out of a focus mode');
select throws_ok($$insert into public.family_modules (family_id, module_key, enabled) values
  ('00000000-0000-4000-8000-0000000000f1', 'routines', true)
  on conflict (family_id, module_key) do update set enabled = true$$,
  '42501', null, 'device: cannot upsert module settings');
select throws_ok($$insert into public.devices (family_id, device_user_id, label) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e2', 'Rogue')$$,
  '42501', null, 'device: cannot pair another device directly');
select throws_ok($$update public.devices set revoked_at = now()$$, '42501', null, 'device: cannot revoke devices directly');
select throws_ok($$insert into public.parents (family_id, user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', 'Me')$$,
  '42501', null, 'device: cannot make itself a parent');
-- reset_plans upsert is allowed, but only inside the device's own family.
select lives_ok($$insert into public.reset_plans (kid_id, family_id, tools) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', '{shell}')
  on conflict (family_id, kid_id) do update set tools = excluded.tools$$, 'device: can upsert its own family''s reset plan');
select throws_ok($$insert into public.reset_plans (kid_id, family_id, tools) values
  ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', '{x}')
  on conflict (family_id, kid_id) do update set tools = excluded.tools$$, '42501', null,
  'device: cannot upsert another family''s reset plan');

-- Unbounded element sizes on device-writable arrays (storage abuse from a kid tablet).
select throws_ok($$update public.reset_plans set body_signs = array[repeat('x', 100000)]$$, '23514', null,
  'device: cannot store a 100 kB reset-plan element');
reset role;

select * from finish();
rollback;
