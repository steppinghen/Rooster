-- Slice 6: export every family table (never secrets); delete family wipes exactly that family.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select tests.make_two_families();

-- ----- export_family -----
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
create temp table ex as select public.export_family() as doc;
reset role;

select is((select doc ->> 'format' from ex), 'the-deck-family-export', 'export: self-describing');
select is((select doc -> 'family' ->> 'name' from ex), 'Family One', 'export: the caller''s family');

-- Every public table that holds family rows is in the export (so a new table can't be forgotten).
select is_empty($$
  select c.table_name from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'family_id' and c.table_name <> 'families'
    and not ((select doc from ex) -> 'tables') ? c.table_name
$$, 'export: includes every family table');

select is((select jsonb_array_length(doc -> 'tables' -> 'kids') from ex), 2, 'export: both kids');
select is((select jsonb_array_length(doc -> 'tables' -> 'events') from ex), 2, 'export: parents-only events too');
select is((select jsonb_array_length(doc -> 'tables' -> 'feelings_checkins') from ex), 1, 'export: check-ins');
select ok((select not (doc::text ~ '00000000-0000-4000-8000-0000000000f2') from ex), 'export: nothing from family 2');
select ok((select not (doc::text like '%$2a$%' or doc::text like '%$2b$%') from ex), 'export: no bcrypt hashes anywhere');
select ok((select not (doc -> 'tables' -> 'kids' -> 0 ? 'pin_hash') from ex), 'export: no pin_hash key');
select ok((select doc -> 'omitted' ? 'kids.pin_hash' from ex), 'export: says what it left out and why');

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok('select public.export_family()', '42501', null, 'export: a device cannot export');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a2', 'aal1');
select throws_ok('select public.export_family()', '42501', null, 'export: an aal1 parent cannot export');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
select throws_ok('select public.export_family()', '42501', null, 'export: a stranger cannot export');
reset role;

-- ----- delete_family -----
insert into public.pairing_attempts (user_id) values ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2');
create temp table before_f2 as
  select 'kids' t, count(*) n from public.kids where family_id = '00000000-0000-4000-8000-0000000000f2'
  union all select 'events', count(*) from public.events where family_id = '00000000-0000-4000-8000-0000000000f2'
  union all select 'devices', count(*) from public.devices where family_id = '00000000-0000-4000-8000-0000000000f2'
  union all select 'users', count(*) from auth.users where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d2');

select tests.authenticate('00000000-0000-4000-8000-0000000000d1', 'aal1', true);
select throws_ok($$select public.delete_family('Family One')$$, '42501', null, 'delete: a device cannot delete the family');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000b1');
select throws_ok($$select public.delete_family('Family One')$$, '22023', null, 'delete: another family''s name does nothing to it');
reset role;
select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$select public.delete_family('family one')$$, '22023', null, 'delete: the name must match exactly');
select throws_ok($$select public.delete_family(null)$$, '22023', null, 'delete: no confirmation, no delete');
select lives_ok($$select public.delete_family('Family One')$$, 'delete: typed confirmation deletes the family');
reset role;

select is((select count(*)::int from public.families where id = '00000000-0000-4000-8000-0000000000f1'), 0, 'delete: family gone');
select is_empty($$
  select c.table_name from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name = 'family_id'
    and exists (select 1 from public.kids where family_id = '00000000-0000-4000-8000-0000000000f1')
$$, 'delete: no kids remain');
select is((select count(*)::int from public.kids where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.routines where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.events where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.feelings_checkins where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.devices where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.parent_allowlist where family_id = '00000000-0000-4000-8000-0000000000f1')
        + (select count(*)::int from public.usage_events where family_id = '00000000-0000-4000-8000-0000000000f1'), 0, 'delete: every family row is gone');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d9')), 0,
  'delete: the family''s parent and iPad accounts are gone');
select is((select count(*)::int from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000d1'), 0, 'delete: the family''s lockout rows are gone');
select is((select count(*)::int from public.pairing_attempts where user_id = '00000000-0000-4000-8000-0000000000d2'), 1, 'delete: another family''s lockout rows stay');
select results_eq(
  $$select t, count from (
    select 'kids' t, count(*) from public.kids where family_id = '00000000-0000-4000-8000-0000000000f2'
    union all select 'events', count(*) from public.events where family_id = '00000000-0000-4000-8000-0000000000f2'
    union all select 'devices', count(*) from public.devices where family_id = '00000000-0000-4000-8000-0000000000f2'
    union all select 'users', count(*) from auth.users where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d2')) s order by t$$,
  'select t, n from before_f2 order by t', 'delete: family 2 is untouched');

select * from finish();
rollback;
