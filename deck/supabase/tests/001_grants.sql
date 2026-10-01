-- Grants: the Data API roles have exactly the privileges the migrations grant, nothing more.
-- Mirrors hosted "automatically expose new tables" = off. Update EXPECTED deliberately when a
-- migration adds a grant or RPC; an unexpected diff here is a finding.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'every table in public has row level security enabled');

select is_empty($$
  select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
  union all
  select table_name from information_schema.column_privileges where grantee = 'anon' and table_schema = 'public'
$$, 'anon has no table or column privileges in public');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('is_aal2_user', 'is_anonymous_session', 'is_parent_of', 'is_device_of', 'is_member_of', 'is_any_member')
    and p.prokind = 'f'
$$, 'anon can execute no functions in public or private, beyond the policy helpers');

select ok(
  not has_column_privilege('authenticated', 'public.kids', 'pin_hash', 'select')
  and not has_column_privilege('authenticated', 'public.kids', 'pin_hash', 'insert')
  and not has_column_privilege('authenticated', 'public.kids', 'pin_hash', 'update'),
  'no API role can read or write kids.pin_hash');

select ok(
  not has_column_privilege('authenticated', 'public.pairing_codes', 'code_hash', 'select')
  and not has_table_privilege('authenticated', 'public.pairing_codes', 'insert')
  and not has_table_privilege('authenticated', 'public.pairing_codes', 'update'),
  'no API role can read pairing code hashes or write pairing codes directly');

select ok(
  not has_table_privilege('authenticated', 'public.pairing_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.pin_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.pairing_attempts', 'insert')
  and not has_table_privilege('authenticated', 'public.pin_attempts', 'insert'),
  'lockout tables are not reachable through the API');

create temp table actual_grants as
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
) s order by line
;

select is(
  array(select line collate "default" from actual_grants order by line collate "C"),
  array[
    'devices:DELETE',
    'devices:SELECT(device_user_id,family_id,ground,id,label,last_seen_at,paired_at,revoked_at)',
    'devices:UPDATE(ground,label)',
    'events:DELETE',
    'events:INSERT(family_id,icon,kind,on_date,repeats_yearly,title,visible_to_kids)',
    'events:SELECT',
    'events:UPDATE(icon,kind,on_date,repeats_yearly,title,visible_to_kids)',
    'families:SELECT',
    'families:UPDATE(name,timezone)',
    'family_modules:INSERT(enabled,family_id,module_key,settings)',
    'family_modules:SELECT',
    'family_modules:UPDATE(enabled,settings)',
    'feelings_checkins:DELETE',
    'feelings_checkins:INSERT(family_id,feeling,kid_id,moment,size)',
    'feelings_checkins:SELECT',
    'kid_focus:INSERT(ends_at,family_id,kid_id,mode,pending_ends_at,pending_mode,pinned,return_mode,since,switch_at)',
    'kid_focus:SELECT',
    'kid_focus:UPDATE(ends_at,mode,pending_ends_at,pending_mode,pinned,return_mode,since,switch_at)',
    'kids:DELETE',
    'kids:INSERT(accent,age_band,avatar,birthday_day,birthday_month,default_volume,family_id,nickname,sort_order)',
    'kids:SELECT(accent,age_band,avatar,birthday_day,birthday_month,created_at,default_volume,family_id,has_pin,id,nickname,sort_order)',
    'kids:UPDATE(accent,age_band,avatar,birthday_day,birthday_month,default_volume,nickname,sort_order)',
    'module_catalog:SELECT',
    'pairing_codes:SELECT(created_at,created_by,expires_at,family_id,id,label,used_at,used_by_device)',
    'parent_allowlist:DELETE',
    'parent_allowlist:INSERT(email,family_id)',
    'parent_allowlist:SELECT(created_at,email,family_id,id,joined_at)',
    'parents:SELECT',
    'parents:UPDATE(display_name)',
    'reset_plans:INSERT(body_signs,family_id,kid_id,tools)',
    'reset_plans:SELECT',
    'reset_plans:UPDATE(body_signs,tools)',
    'routine_completions:DELETE',
    'routine_completions:INSERT(completed_steps,family_id,kid_id,on_date,routine_id)',
    'routine_completions:SELECT',
    'routine_completions:UPDATE(completed_steps)',
    'routines:DELETE',
    'routines:INSERT(family_id,kid_id,name,slot,sort_order,starts_at,steps)',
    'routines:SELECT',
    'routines:UPDATE(kid_id,name,slot,sort_order,starts_at,steps)',
    'rpc:accept_invite(p_family_id uuid, p_display_name text)',
    'rpc:cancel_focus_switch(p_kid_ids uuid[])',
    'rpc:cancel_pairing_code(p_code_id uuid)',
    'rpc:create_family(p_name text, p_display_name text, p_timezone text)',
    'rpc:create_pairing_code(p_label text)',
    'rpc:current_checkin(p_kid_id uuid)',
    'rpc:delete_family(p_confirm text)',
    'rpc:device_checkin()',
    'rpc:export_family()',
    'rpc:my_invites()',
    'rpc:redeem_pairing_code(p_code text)',
    'rpc:revoke_device(p_device_id uuid)',
    'rpc:save_reset_plan(p_kid_id uuid, p_body_signs text[], p_tools text[])',
    'rpc:save_routine_progress(p_routine_id uuid, p_kid_id uuid, p_on_date date, p_steps text[])',
    'rpc:server_now()',
    'rpc:set_focus(p_kid_ids uuid[], p_mode focus_mode, p_minutes integer, p_now boolean)',
    'rpc:set_kid_pin(p_kid_id uuid, p_pin text)',
    'rpc:verify_kid_pin(p_kid_id uuid, p_pin text)',
    'rpc:whoami()',
    'usage_events:INSERT(action,duration_ms,family_id,kid_id,module_key,target_id)',
    'usage_events:SELECT',
    'usage_monthly:SELECT'
  ]::text[],
  'authenticated has exactly the expected grants and RPCs; anon has none');

select * from finish();
rollback;
