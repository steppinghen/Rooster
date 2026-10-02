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
    'calendars:DELETE',
    'calendars:SELECT(builtin_key,color,created_at,family_id,id,kids_default,last_error,last_synced_at,name,owner_user_id,provider,sort_order,source,synced_count)',
    'calendars:UPDATE(color,kids_default,name,sort_order)',
    'checkin_moments:DELETE',
    'checkin_moments:INSERT(anchor_routine_id,at_time,family_id,kid_id,label,sort_order)',
    'checkin_moments:SELECT',
    'checkin_moments:UPDATE(anchor_routine_id,at_time,label,sort_order)',
    'device_calendars:DELETE',
    'device_calendars:INSERT(calendar_id,device_id,family_id,mode)',
    'device_calendars:SELECT',
    'device_calendars:UPDATE(mode)',
    'device_kids:DELETE',
    'device_kids:INSERT(device_id,family_id,kid_id)',
    'device_kids:SELECT',
    'devices:DELETE',
    'devices:SELECT(device_user_id,dim_at_lights_out,family_id,ground,id,job,label,last_seen_at,paired_at,parent_unlock,read_aloud,return_to_start,revoked_at,sound,start_view,unlock_minutes)',
    'devices:UPDATE(dim_at_lights_out,ground,job,label,parent_unlock,read_aloud,return_to_start,sound,start_view,unlock_minutes)',
    'dinner_plan:DELETE',
    'dinner_plan:INSERT(family_id,kind,meal_id,on_date,options,sides)',
    'dinner_plan:SELECT',
    'dinner_plan:UPDATE(kind,meal_id,options,sides)',
    'display_unlocks:SELECT',
    'event_kids:DELETE',
    'event_kids:INSERT(event_id,family_id,kid_id)',
    'event_kids:SELECT',
    'events:DELETE',
    'events:INSERT(birthday_kid_id,calendar_id,countdown,family_id,holiday_key,icon,kid_icon,kid_title,kid_visibility,kind,on_date,repeats_yearly,title)',
    'events:SELECT',
    'events:UPDATE(birthday_kid_id,countdown,holiday_key,icon,kid_icon,kid_title,kid_visibility,kind,on_date,repeats_yearly,title)',
    'families:SELECT',
    'families:UPDATE(name,settings,timezone)',
    'family_modules:INSERT(enabled,family_id,module_key,settings)',
    'family_modules:SELECT',
    'family_modules:UPDATE(enabled,settings)',
    'feelings_checkins:DELETE',
    'feelings_checkins:INSERT(family_id,feeling,kid_id,moment,size)',
    'feelings_checkins:SELECT',
    'feelings_notes:DELETE',
    'feelings_notes:INSERT(body,checkin_id,family_id)',
    'feelings_notes:SELECT',
    'kid_decks:SELECT',
    'kid_focus:SELECT',
    'kids:DELETE',
    'kids:INSERT(accent,age_band,avatar,birthday_day,birthday_month,can_change_look,default_volume,dock_picks,family_id,nickname,sort_order)',
    'kids:SELECT(accent,age_band,avatar,birthday_day,birthday_month,can_change_look,created_at,default_volume,dock_picks,family_id,has_pin,id,nickname,sort_order)',
    'kids:UPDATE(accent,age_band,avatar,birthday_day,birthday_month,can_change_look,default_volume,dock_picks,nickname,sort_order)',
    'meals:DELETE',
    'meals:INSERT(default_sides,family_id,icon,ingredients,last_used_at,name,recipe_url)',
    'meals:SELECT',
    'meals:UPDATE(default_sides,icon,ingredients,last_used_at,name,recipe_url)',
    'module_catalog:SELECT',
    'pairing_codes:SELECT(created_at,created_by,expires_at,family_id,id,label,used_at,used_by_device)',
    'parent_allowlist:DELETE',
    'parent_allowlist:INSERT(email,family_id)',
    'parent_allowlist:SELECT(created_at,email,family_id,id,joined_at)',
    'parent_calendar_prefs:DELETE',
    'parent_calendar_prefs:INSERT(calendar_id,family_id,shown,user_id)',
    'parent_calendar_prefs:SELECT',
    'parent_calendar_prefs:UPDATE(shown)',
    'parents:SELECT(color,created_at,display_name,family_id,has_unlock_pin,initial,user_id)',
    'parents:UPDATE(color,display_name,initial)',
    'reset_plans:INSERT(body_signs,family_id,kid_id,tools)',
    'reset_plans:SELECT',
    'reset_plans:UPDATE(body_signs,tools)',
    'routine_completions:DELETE',
    'routine_completions:INSERT(completed_steps,family_id,kid_id,on_date,routine_id)',
    'routine_completions:SELECT',
    'routine_completions:UPDATE(completed_steps)',
    'routine_kids:DELETE',
    'routine_kids:INSERT(family_id,kid_id,routine_id)',
    'routine_kids:SELECT',
    'routines:DELETE',
    'routines:INSERT(days,earns_sticker,family_id,finish_by,finish_label,name,slot,sort_order,starts_at,steps)',
    'routines:SELECT',
    'routines:UPDATE(days,earns_sticker,finish_by,finish_label,name,slot,sort_order,starts_at,steps)',
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
    'rpc:save_routine(p_id uuid, p_family_id uuid, p_name text, p_slot routine_slot, p_starts_at time without time zone, p_steps jsonb, p_kid_ids uuid[], p_days smallint[], p_finish_by time without time zone, p_finish_label finish_label, p_earns_sticker boolean)',
    'rpc:save_routine_progress(p_routine_id uuid, p_kid_id uuid, p_on_date date, p_steps text[])',
    'rpc:server_now()',
    'rpc:set_focus(p_kid_ids uuid[], p_mode focus_mode, p_minutes integer, p_now boolean)',
    'rpc:set_kid_pin(p_kid_id uuid, p_pin text)',
    'rpc:verify_kid_pin(p_kid_id uuid, p_pin text)',
    'rpc:whoami()',
    'sticker_awards:SELECT',
    'usage_events:INSERT(action,duration_ms,family_id,kid_id,module_key,target_id)',
    'usage_events:SELECT',
    'usage_monthly:SELECT',
    'weather_cache:SELECT'
  ]::text[],
  'authenticated has exactly the expected grants and RPCs; anon has none');

select * from finish();
rollback;
