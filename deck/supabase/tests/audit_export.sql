-- AUDIT (slice 6/9): export_family() leaks nothing of another family, no secret, no bootstrap
-- row; it is complete (every table, every row, every column but the two hashes); and only an
-- aal2 parent of the family can call it. The completeness guard is catalog-driven, so a table
-- added later without an export entry fails here, whatever its key column is.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();
-- Rows in the tables the fixture leaves empty, for both families, so "missing" can't hide.
insert into public.pairing_codes (family_id, code_hash, label) values
  ('00000000-0000-4000-8000-0000000000f1', extensions.crypt('11112222', extensions.gen_salt('bf', 8)), 'Code 1'),
  ('00000000-0000-4000-8000-0000000000f2', extensions.crypt('33334444', extensions.gen_salt('bf', 8)), 'Code 2');
insert into public.routine_completions (family_id, routine_id, kid_id, on_date, completed_steps) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000ca', current_date, '{teeth}'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000cc', current_date, '{teeth}');
insert into public.reset_plans (kid_id, family_id, tools) values
  ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', '{breathe}');
insert into public.pin_attempts (kid_id, user_id) values
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000d1');
insert into public.pairing_attempts (user_id) values ('00000000-0000-4000-8000-0000000000d1');
-- Nested JSON a parent can write: make family 2's carry a marker, family 1's carry its own.
update public.kid_focus set pinned = '["f2-secret-pin"]' where family_id = '00000000-0000-4000-8000-0000000000f2';
update public.family_modules set settings = '{"note":"f2-secret-setting"}' where family_id = '00000000-0000-4000-8000-0000000000f2';
update public.kid_focus set pinned = '["f1-pin"]' where family_id = '00000000-0000-4000-8000-0000000000f1';
-- Bootstrap (family_id null) rows are never family data.
insert into public.parent_allowlist (email, family_id) values ('audit-bootstrap@example.test', null);

create schema audit;
create table audit.f2_markers (m text);
insert into audit.f2_markers values
  ('00000000-0000-4000-8000-0000000000f2'), ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000d2'),
  ('00000000-0000-4000-8000-0000000000cc'), ('00000000-0000-4000-8000-000000000201'), ('00000000-0000-4000-8000-00000000e201'),
  ('00000000-0000-4000-8000-000000000dd2'), ('Family Two'), ('Kid C'), ('Their iPad'), ('Code 2'), ('Zoo'),
  ('fx-parent-b@example.test'), ('fx-invited@example.test'), ('fx-stranger@example.test'), ('audit-bootstrap@example.test'),
  ('f2-secret-pin'), ('f2-secret-setting'), ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2');
grant usage on schema audit to authenticated;
grant select on audit.f2_markers to authenticated;

-- ----- Who can call it -----------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.export_family()', 'execute'), 'export: anon key has no EXECUTE');
select tests.as_anon();
select throws_ok('select public.export_family()', '42501', null, 'export: anon role refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal2', true);
select throws_ok('select public.export_family()', '42501', null, 'export: a device session refused even with an aal2 claim');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000d9', 'aal1', true);
select throws_ok('select public.export_family()', '42501', null, 'export: a revoked device refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e2', 'aal1', true);
select throws_ok('select public.export_family()', '42501', null, 'export: an unpaired anonymous session refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok('select public.export_family()', '42501', null, 'export: an aal1 parent refused');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok('select public.export_family()', '42501', null, 'export: an aal2 stranger refused');
reset role;
-- A parent's uid presented as anonymous (claim mismatch) is not a parent.
select tests.authenticate('00000000-0000-4000-8000-0000000000a1', 'aal2', true);
select throws_ok('select public.export_family()', '42501', null, 'export: a parent uid with is_anonymous=true is refused');
reset role;

-- ----- Family 2's parent gets only family 2 -----------------------------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
create temp table ex2 as select public.export_family() as doc;
reset role;
select is((select doc -> 'family' ->> 'id' from ex2), '00000000-0000-4000-8000-0000000000f2', 'export (family 2): its own family');
select ok((select not (doc::text ~ '00000000-0000-4000-8000-0000000000(f1|a1|a2|d1|d9|ca|cb)') from ex2), 'export (family 2): no family 1 ids');

-- ----- Family 1's export --------------------------------------------------------------------
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
create temp table ex as select public.export_family() as doc;
reset role;
-- The second parent at aal2 can export too (equal parents).
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal2');
select lives_ok('select public.export_family()', 'export: the second parent at aal2 can export');
reset role;

select is_empty($$select m from audit.f2_markers where (select doc::text from ex) like '%' || m || '%'$$,
  'export: no id, name, email or nested JSON value of family 2, strangers, or bootstrap rows');
select ok((select doc::text like '%f1-pin%' and doc::text like '%Family One%' and doc::text like '%fx-parent-a@example.test%' from ex),
  'export (control): the same scan does find family 1''s own nested values, name and allowlist email');

-- Every row in every exported table is family 1's (nothing joined in from elsewhere).
select is_empty($$
  select t.key from ex, jsonb_each(doc -> 'tables') t, jsonb_array_elements(t.value) r
  where r ->> 'family_id' is distinct from '00000000-0000-4000-8000-0000000000f1'
$$, 'export: every exported row carries family_id = family 1');

-- No secret anywhere, at any depth: no hash-named key, no bcrypt string, no auth fields.
select is_empty($$
  select k from ex, jsonb_path_query(doc, 'strict $.** ? (@.type() == "object").keyvalue().key') k
  where k #>> '{}' in ('pin_hash', 'code_hash', 'encrypted_password', 'confirmation_token', 'recovery_token',
                       'email_change_token_new', 'refresh_token', 'secret', 'token', 'ip_address')
$$, 'export: no secret-bearing key at any depth');
select ok((select doc::text !~ '\$2[abxy]\$' from ex), 'export: no bcrypt hash anywhere');

-- Completeness, guard 1: every public base table is exported, explicitly omitted, or global.
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'm', 'f')
    and c.relname not in ('families', 'module_catalog')
    and not ((select doc from ex) -> 'tables' ? c.relname)
    and not ((select doc from ex) -> 'omitted' ? c.relname)
$$, 'export guard: every public table (any key column) is exported or listed under "omitted"');

-- Completeness, guard 2: every row of the family, table by table.
create function audit.f1_count(t text) returns bigint language plpgsql set search_path = '' as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where family_id = %L', t, '00000000-0000-4000-8000-0000000000f1') into n;
  return n;
end $$;
select is_empty($$
  select t.key, jsonb_array_length(t.value), audit.f1_count(t.key)
  from ex, jsonb_each(doc -> 'tables') t
  where jsonb_array_length(t.value) <> audit.f1_count(t.key)
$$, 'export: row count matches the database for every exported table');
select is_empty($$
  select t.key from ex, jsonb_each(doc -> 'tables') t where jsonb_array_length(t.value) = 0
$$, 'export (non-vacuous): every exported table has at least one family 1 row');

-- Completeness, guard 3: every column except the two hashes is in every exported row.
select is_empty($$
  select t.key, a.attname from ex, jsonb_each(doc -> 'tables') t
  join pg_attribute a on a.attrelid = ('public.' || t.key)::regclass and a.attnum > 0 and not a.attisdropped
  cross join lateral jsonb_array_elements(t.value) r
  where (t.key, a.attname) not in (('kids', 'pin_hash'), ('pairing_codes', 'code_hash'))
    and not r ? a.attname
$$, 'export: every non-secret column is present in every row');
select is_empty($$
  select a.attname from ex, pg_attribute a
  where a.attrelid = 'public.families'::regclass and a.attnum > 0 and not a.attisdropped
    and not (doc -> 'family') ? a.attname
$$, 'export: the families row is complete');

-- Allowlist: the family's own entries (joined and pending) only.
select is((select jsonb_array_length(doc -> 'tables' -> 'parent_allowlist') from ex),
  (select count(*)::int from public.parent_allowlist where family_id = '00000000-0000-4000-8000-0000000000f1'),
  'export: allowlist entries are this family''s only');

-- module_catalog is global config, identical to the table (no family data hides in it).
select is((select doc -> 'module_catalog' from ex),
  (select jsonb_agg(to_jsonb(m) order by m.sort_order) from public.module_catalog m),
  'export: module_catalog is the global catalog, unchanged');

-- The definer function itself is safe.
select ok((select prosecdef and 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.export_family()'::regprocedure),
  'export: security definer with empty search_path');
select is((select provolatile from pg_proc where oid = 'public.export_family()'::regprocedure), 's'::"char",
  'export: STABLE, so it cannot write anything even when called with GET');

select * from finish();
rollback;
