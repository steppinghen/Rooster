-- Read-only grant snapshot for the Data API roles. Run locally (supabase/tests/001_grants.sql
-- compares it to the expected list) and against the hosted project at Gate 2 (G2) to verify
-- that "automatically expose new tables" being off left exactly these privileges.
select line::text collate "C" as line from (
  select t.table_name || ':' || t.privilege_type as line
  from information_schema.role_table_grants t
  where t.grantee = 'authenticated' and t.table_schema = 'public'
  union all
  select c.table_name || ':' || c.privilege_type || '(' || string_agg(c.column_name, ',' order by c.column_name) || ')'
  from information_schema.column_privileges c
  where c.grantee = 'authenticated' and c.table_schema = 'public'
    and not exists (
      select 1 from information_schema.role_table_grants t
      where t.grantee = 'authenticated' and t.table_schema = 'public'
        and t.table_name = c.table_name and t.privilege_type = c.privilege_type)
  group by c.table_name, c.privilege_type
  union all
  select 'rpc:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 'ANON:' || table_name || ':' || privilege_type
  from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
  union all
  select 'ANON-rpc:' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
) s order by line;
