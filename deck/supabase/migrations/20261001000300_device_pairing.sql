-- The Deck: slice 3. Device pairing and revocation.
--
-- A parent creates a short-lived (10 min), single-use, 8-digit code on the phone. The iPad
-- signs in anonymously and redeems it; that links its anonymous user to the family as a
-- device. Codes are stored as bcrypt hashes and returned in plain text exactly once.
-- Brute force: 10^8 codes, at most 5 wrong tries per anonymous user per 10 minutes, and at
-- most 100 wrong tries across all callers per 10 minutes (GoTrue also limits anonymous
-- sign-ins to 30 per hour per IP).

create function public.create_pairing_code(p_label text)
returns table (code text, expires_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  plain text;
  exp timestamptz := now() + interval '10 minutes';
begin
  select p.family_id into fid from public.parents p where p.user_id = uid;
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 40 then
    raise exception 'give the iPad a name (1 to 40 characters)' using errcode = '22023';
  end if;
  if (select count(*) from public.pairing_codes c where c.family_id = fid and c.used_at is null and c.expires_at > now()) >= 3 then
    raise exception 'too many open pairing codes; wait for one to expire' using errcode = '54000';
  end if;
  -- 8 random digits from the CSPRNG (modulo bias over 2^32 is negligible).
  plain := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0');
  insert into public.pairing_codes (family_id, code_hash, label, created_by, expires_at)
    values (fid, extensions.crypt(plain, extensions.gen_salt('bf', 8)), btrim(p_label), uid, exp);
  return query select plain, exp;
end;
$$;

-- Returns {ok, reason?, device_id?, family_id?}. Never raises on a wrong code, so the failed
-- attempt it records is not rolled back.
create function public.redeem_pairing_code(p_code text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c_id uuid;
  c_family uuid;
  c_label text;
  n_match int := 0;
  did uuid;
begin
  if uid is null or not private.is_anonymous_session() then
    return jsonb_build_object('ok', false, 'reason', 'not_a_device_session');
  end if;
  if exists (select 1 from public.devices d where d.device_user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_paired');
  end if;
  if (select count(*) from public.pairing_attempts a where a.user_id = uid and a.attempted_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.pairing_attempts a where a.attempted_at > now() - interval '10 minutes') >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if coalesce(p_code, '') ~ '^[0-9]{8}$' then
    -- Salted hashes can't carry a unique index, so two families' live codes could in theory
    -- collide. If more than one matches, refuse rather than guess.
    select count(*), (array_agg(pc.id))[1] into n_match, c_id
    from public.pairing_codes pc
    where pc.used_at is null and pc.expires_at > now()
      and pc.code_hash = extensions.crypt(p_code, pc.code_hash);
    if n_match <> 1 then
      c_id := null;
    end if;
  end if;

  -- Claim the code atomically: only one redeemer can win, and only while it is still live.
  if c_id is not null then
    update public.pairing_codes pc set used_at = now()
      where pc.id = c_id and pc.used_at is null and pc.expires_at > now()
      returning pc.family_id, pc.label into c_family, c_label;
    if not found then
      c_id := null;
    end if;
  end if;

  if c_id is null then
    insert into public.pairing_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  insert into public.devices (family_id, device_user_id, label) values (c_family, uid, c_label) returning id into did;
  update public.pairing_codes set used_by_device = did where id = c_id;
  delete from public.pairing_attempts where user_id = uid;
  return jsonb_build_object('ok', true, 'device_id', did, 'family_id', c_family);
end;
$$;

-- One-way: a revoked device stays revoked (re-pairing creates a new device identity).
create function public.revoke_device(p_device_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fid uuid;
begin
  select d.family_id into fid from public.devices d where d.id = p_device_id;
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.devices set revoked_at = now() where id = p_device_id and revoked_at is null;
end;
$$;

-- Parents can cancel an unused code early.
create function public.cancel_pairing_code(p_code_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  fid uuid;
begin
  select c.family_id into fid from public.pairing_codes c where c.id = p_code_id;
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.pairing_codes set expires_at = least(expires_at, now()) where id = p_code_id and used_at is null;
end;
$$;

-- A paired device reports in when it opens ("last seen" in Back Office).
create function public.device_checkin()
returns void
language sql volatile security definer
set search_path = ''
as $$
  update public.devices set last_seen_at = now()
  where device_user_id = auth.uid() and revoked_at is null and private.is_anonymous_session();
$$;

revoke execute on function public.create_pairing_code(text) from public, anon;
revoke execute on function public.redeem_pairing_code(text) from public, anon;
revoke execute on function public.revoke_device(uuid) from public, anon;
revoke execute on function public.cancel_pairing_code(uuid) from public, anon;
revoke execute on function public.device_checkin() from public, anon;
grant execute on function public.create_pairing_code(text) to authenticated;
grant execute on function public.redeem_pairing_code(text) to authenticated;
grant execute on function public.revoke_device(uuid) to authenticated;
grant execute on function public.cancel_pairing_code(uuid) to authenticated;
grant execute on function public.device_checkin() to authenticated;

-- Realtime: nothing is published with postgres_changes (it doesn't apply RLS to DELETE
-- events). Devices learn about revocation on their next request, and through private
-- Broadcast topics added in slice 10.
