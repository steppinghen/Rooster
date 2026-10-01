-- The Deck: foundation.
--
-- 1. Match the hosted project's "automatically expose new tables and functions" = OFF, so the
--    local stack behaves like production: nothing in `public` is reachable by the API roles
--    unless a migration grants it explicitly. (Hosted already does this; running it there is a
--    no-op. Locally it removes the CLI's permissive defaults.)
-- 2. A `private` schema for helper functions that RLS policies call. It is not in the Data API's
--    exposed schemas, so its functions cannot be called as RPCs.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
-- EXECUTE to PUBLIC is a global (not per-schema) default, so it must be revoked globally.
alter default privileges for role postgres revoke execute on functions from public;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- Policies run with the caller's privileges, so the API roles need USAGE to evaluate them.
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Session helpers. All read the verified JWT claims PostgREST puts in request.jwt.claims.
-- ---------------------------------------------------------------------------------------------

-- True when the session has passed MFA (TOTP) and is a real (non-anonymous) user.
create function private.is_aal2_user() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create function private.is_anonymous_session() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

grant execute on function private.is_aal2_user() to anon, authenticated;
grant execute on function private.is_anonymous_session() to anon, authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
