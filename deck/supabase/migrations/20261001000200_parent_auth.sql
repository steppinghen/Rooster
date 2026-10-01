-- The Deck: slice 2. Parent sign-in, family setup, second parent, kids' PINs.
--
-- Allowlist: "Allow new users to sign up" stays ON (turning it off also blocks the anonymous
-- sign-ins iPads pair with). Instead, a before_user_created auth hook rejects any new email
-- user whose address is not on parent_allowlist; anonymous users pass. Existing users sign in
-- without the hook running. If the hook were ever unavailable, an unlisted user still has zero
-- access (every policy needs a parents row; see supabase/tests/audit_unlisted_user.sql) and the
-- nightly cleanup removes them.

-- ---------------------------------------------------------------------------------------------
-- Auth hook (called by GoTrue as supabase_auth_admin; not callable through the API)
-- ---------------------------------------------------------------------------------------------

create function private.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  u jsonb := event -> 'user';
  raw text := coalesce(u ->> 'email', '');
  -- Plain ASCII is checked before lowering: lower() under ICU folds look-alikes (KELVIN SIGN
  -- to k), so a non-ASCII address must never reach the comparison.
  mail text := case when raw ~ '^[!-~]*$' then lower(raw) else '-' end;
begin
  -- iPads: anonymous users, with no email or phone. They get nothing until they redeem a
  -- pairing code.
  if (coalesce((u ->> 'is_anonymous')::boolean, false) or coalesce(u -> 'app_metadata' ->> 'provider', '') = 'anonymous')
     and mail = '' and coalesce(u ->> 'phone', '') = '' then
    return '{}'::jsonb;
  end if;
  if mail ~ '^[!-~]+$' and exists (select 1 from public.parent_allowlist a where a.email = mail) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email is not on the list for The Deck. Ask a parent to add it.'));
end;
$$;

revoke execute on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;

-- The caller's email, only if the email is confirmed. An anonymous user can attach an email
-- (updateUser) without the before_user_created hook running; until that email is confirmed it
-- must not count for allowlist decisions.
create function private.confirmed_email() returns extensions.citext
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email)::extensions.citext from auth.users u
  where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null and not u.is_anonymous
    and u.email ~ '^[!-~]+$'
$$;
revoke execute on function private.confirmed_email() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- whoami: what the app should show this session. Reveals only the caller's own membership.
-- ---------------------------------------------------------------------------------------------

create function public.whoami()
returns table (role text, family_id uuid, family_name text, timezone text, display_name text, device_id uuid, label text, ground public.ground_setting)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail extensions.citext;
begin
  if uid is null then
    return;
  end if;

  if private.is_anonymous_session() then
    return query
      select case when d.revoked_at is null then 'device' else 'revoked' end,
             case when d.revoked_at is null then d.family_id end,
             case when d.revoked_at is null then f.name end,
             case when d.revoked_at is null then f.timezone end,
             null::text, d.id, d.label, d.ground
      from public.devices d join public.families f on f.id = d.family_id
      where d.device_user_id = uid;
    if not found then
      return query select 'unpaired'::text, null::uuid, null::text, null::text, null::text, null::uuid, null::text, null::public.ground_setting;
    end if;
    return;
  end if;

  -- Real users: nothing about families is revealed before MFA.
  if not private.is_aal2_user() then
    return query select 'none'::text, null::uuid, null::text, null::text, null::text, null::uuid, null::text, null::public.ground_setting;
    return;
  end if;

  return query
    select 'parent'::text, p.family_id, f.name, f.timezone, p.display_name, null::uuid, null::text, null::public.ground_setting
    from public.parents p join public.families f on f.id = p.family_id
    where p.user_id = uid;
  if found then
    return;
  end if;

  mail := private.confirmed_email();
  if exists (select 1 from public.parent_allowlist a where a.email = mail and a.family_id is null) then
    return query select 'bootstrap'::text, null::uuid, null::text, null::text, null::text, null::uuid, null::text, null::public.ground_setting;
    return;
  end if;
  return query
    select 'invited'::text, null::uuid, f.name, null::text, null::text, null::uuid, null::text, null::public.ground_setting
    from public.parent_allowlist a join public.families f on f.id = a.family_id
    where a.email = mail and a.joined_at is null
    order by a.created_at desc
    limit 1;
  if found then
    return;
  end if;
  return query select 'none'::text, null::uuid, null::text, null::text, null::text, null::uuid, null::text, null::public.ground_setting;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- create_family: only a bootstrap allowlist entry (family_id null, inserted by hand at go-live)
-- can create a family. The entry is consumed, so it works once.
-- ---------------------------------------------------------------------------------------------

create function public.create_family(p_name text, p_display_name text, p_timezone text default 'UTC')
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail extensions.citext;
  fid uuid;
  tz text := p_timezone;
begin
  if not private.is_aal2_user() then
    raise exception 'two-step sign-in required' using errcode = '42501';
  end if;
  if exists (select 1 from public.parents p where p.user_id = uid) then
    raise exception 'already in a family' using errcode = '23505';
  end if;
  mail := private.confirmed_email();
  -- Consuming the bootstrap row is the atomic check: only one family can come of it.
  delete from public.parent_allowlist a where a.email = mail and a.family_id is null;
  if mail is null or not found then
    raise exception 'this account cannot create a family' using errcode = '42501';
  end if;
  if tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then
    tz := 'UTC';
  end if;

  insert into public.families (name, timezone) values (btrim(p_name), tz) returning id into fid;
  insert into public.parents (family_id, user_id, display_name) values (fid, uid, btrim(p_display_name));
  insert into public.parent_allowlist (email, family_id, added_by, joined_at) values (mail, fid, uid, now());
  insert into public.family_modules (family_id, module_key, enabled)
    select fid, c.key, c.default_enabled from public.module_catalog c;
  return fid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Invitations: the second parent sees which families listed their (confirmed) email and joins
-- one explicitly. One family per person (parents.user_id is unique).
-- ---------------------------------------------------------------------------------------------

create function public.my_invites()
returns table (family_id uuid, family_name text, invited_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.family_id, f.name, a.created_at
  from public.parent_allowlist a join public.families f on f.id = a.family_id
  where private.is_aal2_user()
    and a.email = private.confirmed_email()
    and a.joined_at is null
    and not exists (select 1 from public.parents p where p.user_id = auth.uid())
  order by a.created_at desc
$$;

create function public.accept_invite(p_family_id uuid, p_display_name text)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail extensions.citext;
  fid uuid;
begin
  if not private.is_aal2_user() then
    raise exception 'two-step sign-in required' using errcode = '42501';
  end if;
  if exists (select 1 from public.parents p where p.user_id = uid) then
    raise exception 'already in a family' using errcode = '23505';
  end if;
  mail := private.confirmed_email();
  update public.parent_allowlist a set joined_at = now()
    where a.email = mail and a.family_id = p_family_id and a.joined_at is null
    returning a.family_id into fid;
  if mail is null or fid is null then
    raise exception 'no invitation for this account' using errcode = '42501';
  end if;
  insert into public.parents (family_id, user_id, display_name) values (fid, uid, btrim(p_display_name));
  return fid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- set_kid_pin: parents set or clear a kid's 4-digit PIN. Stored as bcrypt; never readable.
-- ---------------------------------------------------------------------------------------------

create function public.set_kid_pin(p_kid_id uuid, p_pin text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fid uuid;
begin
  select k.family_id into fid from public.kids k where k.id = p_kid_id;
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pin is null then
    update public.kids set pin_hash = null where id = p_kid_id;
  elsif p_pin ~ '^[0-9]{4}$' then
    update public.kids set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) where id = p_kid_id;
  else
    raise exception 'a PIN is exactly 4 digits' using errcode = '22023';
  end if;
  delete from public.pin_attempts where kid_id = p_kid_id;
end;
$$;

revoke execute on function public.whoami() from public, anon;
revoke execute on function public.create_family(text, text, text) from public, anon;
revoke execute on function public.accept_invite(uuid, text) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.set_kid_pin(uuid, text) from public, anon;
grant execute on function public.whoami() to authenticated;
grant execute on function public.create_family(text, text, text) to authenticated;
grant execute on function public.accept_invite(uuid, text) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.set_kid_pin(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Every kid starts in Everything mode.
-- ---------------------------------------------------------------------------------------------

create function private.kid_created() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.kid_focus (kid_id, family_id) values (new.id, new.family_id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.kid_created() from public, anon, authenticated;
create trigger kids_created after insert on public.kids
  for each row execute function private.kid_created();

-- ---------------------------------------------------------------------------------------------
-- Nightly cleanup: orphaned auth users and stale lockout rows.
--   * anonymous users that never paired, after 24 hours
--   * email users in no family and on no allowlist (only possible if the hook is unavailable),
--     after 24 hours
--   * pairing/PIN attempt rows and expired pairing codes, after a day
-- ---------------------------------------------------------------------------------------------

create function private.cleanup_orphans() returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n_anon int;
  n_unlisted int;
begin
  -- Guard: this deletes every auth user not tied to The Deck, so it only runs in a database
  -- that is The Deck's own (no tables from other apps in public).
  if exists (
    select 1 from pg_catalog.pg_tables t
    where t.schemaname = 'public' and t.tablename not in (
      'families', 'parents', 'parent_allowlist', 'devices', 'pairing_codes', 'pairing_attempts', 'kids', 'pin_attempts',
      'routines', 'routine_completions', 'events', 'feelings_checkins', 'reset_plans', 'module_catalog', 'family_modules',
      'kid_focus', 'usage_events', 'usage_monthly')
  ) then
    raise warning 'cleanup_orphans: public has tables The Deck does not own; refusing to delete users';
    return jsonb_build_object('skipped', true);
  end if;

  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.devices d where d.device_user_id = u.id);
  get diagnostics n_anon = row_count;

  delete from auth.users u
  where not u.is_anonymous and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.parents p where p.user_id = u.id)
    and not exists (select 1 from public.parent_allowlist a where a.email = u.email::extensions.citext and u.email_confirmed_at is not null);
  get diagnostics n_unlisted = row_count;

  delete from public.pairing_attempts where attempted_at < now() - interval '1 day';
  -- GoTrue's audit log (emails, ids, IPs) is kept 90 days.
  delete from auth.audit_log_entries where created_at < now() - interval '90 days';
  delete from public.pin_attempts where attempted_at < now() - interval '1 day';
  delete from public.pairing_codes where expires_at < now() - interval '1 day';

  return jsonb_build_object('anonymous_removed', n_anon, 'unlisted_removed', n_unlisted);
end;
$$;
revoke execute on function private.cleanup_orphans() from public, anon, authenticated;

-- An anonymous (iPad) account can never take an email or phone (updateUser would otherwise
-- turn it into a real account without the before_user_created hook running). iPads never
-- need one.
create function private.anonymous_stays_anonymous() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_anonymous and (
       new.email is distinct from old.email or new.phone is distinct from old.phone
       or not new.is_anonymous
       or coalesce(new.email_change, '') <> coalesce(old.email_change, '')
       or coalesce(new.phone_change, '') <> coalesce(old.phone_change, '')) then
    raise exception 'an iPad account cannot take an email or phone' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.anonymous_stays_anonymous() from public, anon, authenticated;
create trigger deck_anonymous_stays_anonymous before update on auth.users
  for each row execute function private.anonymous_stays_anonymous();

create extension if not exists pg_cron;
select cron.schedule('deck-cleanup-orphans', '17 3 * * *', $$select private.cleanup_orphans()$$);
