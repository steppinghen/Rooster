-- LOCAL ONLY. Runs on `supabase db reset`; `supabase db push` never sends it to a hosted
-- project. Placeholder data only (Parent A / Parent B / Kid A / Kid B).

-- Parent A may sign in locally (the hosted equivalent is the one-off bootstrap insert at Gate 2).
insert into public.parent_allowlist (email, family_id) values ('parent-a@example.test', null)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- Test helpers for pgTAP (supabase/tests) and Playwright fixtures.
-- ---------------------------------------------------------------------------------------------

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Create an auth user directly (bypasses GoTrue; the before_user_created hook does not run).
create or replace function tests.create_user(p_email text default null, p_anonymous boolean default false, p_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(p_id, gen_random_uuid());
begin
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_anonymous,
          case when p_anonymous then '{"provider":"anonymous"}'::jsonb else '{"provider":"email"}'::jsonb end,
          '{}'::jsonb, now(), now(), case when p_anonymous then null else now() end);
  return uid;
end;
$$;

-- Act as a signed-in user for the rest of the transaction.
create or replace function tests.authenticate(p_uid uuid, p_aal text default 'aal2', p_anonymous boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'is_anonymous', p_anonymous)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Act as a request carrying only the anon key.
create or replace function tests.as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Two-family fixture used by the RLS tests. Fixed ids (last block of hex) keep assertions readable:
--   f1 / f2      families
--   a1           Parent A (family 1)     a2  Parent A2 (family 1; tests use it at aal1)
--   b1           Parent B (family 2)
--   d1 / d9      family 1 iPad / revoked family 1 iPad    d2  family 2 iPad
--   e1           signed-in user on no allowlist and in no family ("stranger")
--   e2           anonymous user that never paired
--   ca / cb      Kid A / Kid B (family 1)     cc  Kid C (family 2)
--   101 / 201    routines (family 1 / family 2)
create or replace function tests.make_two_families()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform tests.create_user('parent-a@example.test', false, '00000000-0000-4000-8000-0000000000a1');
  perform tests.create_user('parent-a2@example.test', false, '00000000-0000-4000-8000-0000000000a2');
  perform tests.create_user('parent-b@example.test', false, '00000000-0000-4000-8000-0000000000b1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d9');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000d2');
  perform tests.create_user('stranger@example.test', false, '00000000-0000-4000-8000-0000000000e1');
  perform tests.create_user(null, true, '00000000-0000-4000-8000-0000000000e2');

  insert into public.families (id, name) values
    ('00000000-0000-4000-8000-0000000000f1', 'Family One'),
    ('00000000-0000-4000-8000-0000000000f2', 'Family Two');
  insert into public.parents (family_id, user_id, display_name) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'Parent A'),
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'Parent A2'),
    ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b1', 'Parent B');
  insert into public.devices (id, family_id, device_user_id, label, revoked_at) values
    ('00000000-0000-4000-8000-000000000dd1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d1', 'Kitchen iPad', null),
    ('00000000-0000-4000-8000-000000000dd9', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d9', 'Old iPad', now() - interval '1 day'),
    ('00000000-0000-4000-8000-000000000dd2', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000d2', 'Their iPad', null);
  insert into public.kids (id, family_id, nickname, age_band, pin_hash, birthday_month, birthday_day) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', 'Kid A', 'reader', extensions.crypt('1234', extensions.gen_salt('bf', 8)), 3, 14),
    ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-0000000000f1', 'Kid B', 'prereader', null, null, null),
    ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', 'Kid C', 'reader', null, null, null);
  insert into public.routines (id, family_id, kid_id, slot, name, starts_at, steps) values
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000f1', null, 'morning', 'Dawn Patrol', '06:30',
      '[{"id":"teeth","text":"Brush teeth","icon":"toothbrush"},{"id":"dress","text":"Get dressed","icon":"shirt"}]'),
    ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f2', null, 'morning', 'Dawn Patrol', '07:00',
      '[{"id":"teeth","text":"Brush teeth","icon":"toothbrush"}]');
  insert into public.events (id, family_id, title, on_date, kind, visible_to_kids) values
    ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000f1', 'Beach trip', current_date + 12, 'trip', true),
    ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000f1', 'Parents night out', current_date + 3, 'other', false),
    ('00000000-0000-4000-8000-00000000e201', '00000000-0000-4000-8000-0000000000f2', 'Zoo', current_date + 5, 'trip', true);
  insert into public.feelings_checkins (family_id, kid_id, feeling, size) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'choppy', 3),
    ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000cc', 'pumping', 2);
  insert into public.kid_focus (kid_id, family_id, mode) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', 'everything'),
    ('00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000f2', 'everything');
  insert into public.family_modules (family_id, module_key) values
    ('00000000-0000-4000-8000-0000000000f1', 'routines'), ('00000000-0000-4000-8000-0000000000f1', 'wave_check'),
    ('00000000-0000-4000-8000-0000000000f2', 'routines'), ('00000000-0000-4000-8000-0000000000f2', 'wave_check');
  insert into public.reset_plans (kid_id, family_id, tools) values
    ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-0000000000f1', '{turtle}');
  insert into public.usage_events (family_id, kid_id, module_key, action) values
    ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000ca', 'routines', 'opened');
  delete from public.parent_allowlist where email = 'parent-a@example.test' and family_id is null;
  insert into public.parent_allowlist (email, family_id, joined_at) values
    ('parent-a@example.test', '00000000-0000-4000-8000-0000000000f1', now()),
    ('invited@example.test', '00000000-0000-4000-8000-0000000000f2', null);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
-- The security-definer helpers are for postgres-run fixtures only.
revoke execute on function tests.create_user(text, boolean, uuid) from anon, authenticated;
revoke execute on function tests.make_two_families() from anon, authenticated;
