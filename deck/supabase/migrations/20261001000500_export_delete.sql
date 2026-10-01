-- The Deck: slice 6. Family export and full delete (CLAUDE.md req. 9).
--
-- export_family(): one JSON document with every family-owned row, good enough to rebuild the
-- app from. Secrets are left out on purpose (and listed under "omitted"): the bcrypt PIN and
-- pairing-code hashes. A 4-digit PIN hash is effectively the PIN, so an export file on a
-- phone must not carry it; PINs are set again after a rebuild.
--
-- delete_family(confirm): full wipe. The caller types the family name exactly. Removes every
-- row of the family (FK cascades), the lockout rows of its users, and the auth users of its
-- parents and iPads, so nothing of the family remains.

create function public.export_family()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  fid uuid;
begin
  select p.family_id into fid from public.parents p where p.user_id = auth.uid();
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'format', 'the-deck-family-export',
    'version', 1,
    'exported_at', now(),
    'family', (select to_jsonb(f) from public.families f where f.id = fid),
    'tables', jsonb_build_object(
      'parents', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.parents x where x.family_id = fid), '[]'),
      'parent_allowlist', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.parent_allowlist x where x.family_id = fid), '[]'),
      'devices', coalesce((select jsonb_agg(to_jsonb(x) order by x.paired_at) from public.devices x where x.family_id = fid), '[]'),
      'pairing_codes', coalesce((select jsonb_agg(to_jsonb(x) - 'code_hash' order by x.created_at) from public.pairing_codes x where x.family_id = fid), '[]'),
      'kids', coalesce((select jsonb_agg(to_jsonb(x) - 'pin_hash' order by x.sort_order, x.created_at) from public.kids x where x.family_id = fid), '[]'),
      'routines', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at, x.sort_order) from public.routines x where x.family_id = fid), '[]'),
      'routine_completions', coalesce((select jsonb_agg(to_jsonb(x) order by x.on_date, x.updated_at) from public.routine_completions x where x.family_id = fid), '[]'),
      'events', coalesce((select jsonb_agg(to_jsonb(x) order by x.on_date) from public.events x where x.family_id = fid), '[]'),
      'feelings_checkins', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.feelings_checkins x where x.family_id = fid), '[]'),
      'reset_plans', coalesce((select jsonb_agg(to_jsonb(x)) from public.reset_plans x where x.family_id = fid), '[]'),
      'family_modules', coalesce((select jsonb_agg(to_jsonb(x) order by x.module_key) from public.family_modules x where x.family_id = fid), '[]'),
      'kid_focus', coalesce((select jsonb_agg(to_jsonb(x)) from public.kid_focus x where x.family_id = fid), '[]'),
      'usage_events', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.usage_events x where x.family_id = fid), '[]')
    ),
    'module_catalog', (select jsonb_agg(to_jsonb(m) order by m.sort_order) from public.module_catalog m),
    'omitted', jsonb_build_object(
      'kids.pin_hash', 'secret: set PINs again after a rebuild',
      'pairing_codes.code_hash', 'secret: pairing codes are single-use and short-lived',
      'pairing_attempts', 'operational lockout rows, not family data',
      'pin_attempts', 'operational lockout rows, not family data')
  );
end;
$$;

create function public.delete_family(p_confirm text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fid uuid;
  fname text;
  v_users uuid[];
  v_emails extensions.citext[];
begin
  select p.family_id into fid from public.parents p where p.user_id = auth.uid();
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Lock the family first, so nobody can join or pair while it is being deleted.
  select f.name into fname from public.families f where f.id = fid for update;
  -- The typed name must match exactly (names are stored trimmed, so every family can be deleted).
  if p_confirm is distinct from fname then
    raise exception 'type the family name exactly to confirm' using errcode = '22023';
  end if;

  select coalesce(array_agg(u), '{}') into v_users from (
    select d.device_user_id as u from public.devices d where d.family_id = fid
    union select p.user_id from public.parents p where p.family_id = fid
  ) s;
  select coalesce(array_agg(u.email::extensions.citext), '{}') into v_emails
    from auth.users u where u.id = any (v_users) and u.email is not null;

  delete from public.pairing_attempts where user_id = any (v_users);
  delete from public.pin_attempts where user_id = any (v_users);
  -- Every family table cascades from families (allowlist rows for this family included).
  delete from public.families where id = fid;
  -- No leftover bootstrap rows for these parents either.
  delete from public.parent_allowlist where family_id is null and email = any (v_emails);
  -- Realtime keeps sent messages for a few days; the family's (and its iPads') go now.
  delete from realtime.messages m
    where m.topic in ('family:' || fid::text, 'parents:' || fid::text)
       or m.topic = any (select 'device:' || u::text from unnest(v_users) u);
  -- GoTrue's audit log holds their emails, ids and IP addresses: gone too.
  delete from auth.audit_log_entries a
    where a.payload ->> 'actor_id' = any (v_users::text[])
       or lower(a.payload ->> 'actor_username') = any (v_emails::text[]);
  delete from auth.users u where u.id = any (v_users);
end;
$$;

revoke execute on function public.export_family() from public, anon;
revoke execute on function public.delete_family(text) from public, anon;
grant execute on function public.export_family() to authenticated;
grant execute on function public.delete_family(text) to authenticated;
