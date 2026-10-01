-- AUDIT: the function and API surface. Security definer helpers pin search_path and can't be
-- steered by the caller; nothing new is exposed by default; views (none yet) can't bypass RLS;
-- Realtime can't publish secrets.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
select tests.make_two_families();

-- ---- definer functions -------------------------------------------------------------------
select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'every security definer function in public/private pins search_path to empty');
select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
$$, 'every function in public/private sets search_path (definer or not)');
select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and pg_get_userbyid(p.proowner) in ('anon', 'authenticated', 'authenticator')
$$, 'no definer function is owned by an API role');
select is_empty($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
$$, 'no security definer RPC in the exposed schema is callable with the anon key');
select ok(not has_schema_privilege('authenticated', 'public', 'create') and not has_schema_privilege('anon', 'public', 'create')
  and not has_schema_privilege('authenticated', 'private', 'create') and not has_schema_privilege('anon', 'private', 'create'),
  'API roles cannot create objects in public or private');
select is_empty($$
  select p.proname from pg_proc p where p.pronamespace = 'private'::regnamespace
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in ('is_aal2_user', 'is_anonymous_session', 'is_parent_of', 'is_device_of', 'is_member_of', 'is_any_member', 'valid_routine_steps', 'short_ids', 'short_id_list')
$$, 'trigger and check functions in private are not executable by API roles');

-- Caller can't steer the helpers: shadow tables in pg_temp plus a hostile search_path.
select tests.authenticate('00000000-0000-4000-8000-0000000000e1');
create temp table parents (family_id uuid, user_id uuid);
create temp table devices (family_id uuid, device_user_id uuid, revoked_at timestamptz);
insert into pg_temp.parents values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1');
insert into pg_temp.devices values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', null);
set local search_path = pg_temp, public, private, extensions;
select ok(not private.is_parent_of('00000000-0000-4000-8000-0000000000f1'), 'stranger: shadow parents table + search_path does not make them a parent');
select ok(not private.is_member_of('00000000-0000-4000-8000-0000000000f1'), 'stranger: shadow tables do not make them a member');
select is_empty('select 1 from public.kids', 'stranger: still no kids after shadowing attempt');
reset search_path;
reset role;

select tests.authenticate('00000000-0000-4000-8000-0000000000a1');
select ok(not coalesce(private.is_parent_of(null), false), 'is_parent_of(null) is false');
select ok(not private.is_parent_of('00000000-0000-4000-8000-0000000000f2'), 'parent A is not parent of family 2');
select ok(not private.is_device_of('00000000-0000-4000-8000-0000000000f1'), 'a parent session is never a device');
reset role;

-- Malformed claims fail closed (error or no access), never open.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated', 'aal', 'AAL2')::text, true);
set local role authenticated;
select is_empty('select 1 from public.kids', 'aal claim must be exactly aal2 (case-sensitive)');
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'aal', 'aal2', 'is_anonymous', false)::text, true);
set local role authenticated;
select is_empty('select 1 from public.kids', 'a JWT with no sub gets nothing');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000d1', 'role', 'authenticated', 'aal', 'aal1', 'is_anonymous', 'maybe')::text, true);
set local role authenticated;
select throws_ok('select 1 from public.kids', '22P02', null, 'garbage is_anonymous claim errors (fails closed)');
reset role;

-- ---- views (none yet): any future view must be security_invoker ---------------------------
select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
    and (c.relkind = 'm' or not coalesce(c.reloptions @> array['security_invoker=true'], false))
$$, 'every view in public is security_invoker (and there are no materialized views)');

-- ---- Realtime --------------------------------------------------------------------------
select is_empty($$
  select pt.tablename from pg_publication_tables pt
  join pg_class c on c.relname = pt.tablename and c.relnamespace = pt.schemaname::regnamespace
  where pt.pubname = 'supabase_realtime'
    and (not c.relrowsecurity
      or pt.schemaname <> 'public'
      or pt.tablename in ('parent_allowlist', 'pairing_codes', 'pairing_attempts', 'pin_attempts', 'parents', 'feelings_checkins', 'usage_events'))
$$, 'Realtime publishes no RLS-less, secret, parent-only or lockout table');
select ok(not (select puballtables from pg_publication where pubname = 'supabase_realtime'),
  'Realtime publication is not FOR ALL TABLES');
select ok((select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'realtime.messages has RLS on (private broadcast channels deny by default)');
select is_empty($$select policyname from pg_policies where schemaname = 'realtime' and 'anon' = any (roles)$$,
  'no Realtime policy grants anything to anon');

-- ---- Storage (unused in v1) ---------------------------------------------------------------
select is_empty('select id from storage.buckets where public', 'no public storage buckets');

select * from finish();
rollback;
