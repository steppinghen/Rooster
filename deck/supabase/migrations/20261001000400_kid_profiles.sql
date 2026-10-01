-- The Deck: slice 4 (+ shared kid-device writes). Kid profile PIN check, server time, and
-- the upsert paths kid screens use.

-- Kid PIN: the hash is compared here and never leaves the database. 5 wrong tries per kid
-- per session in 5 minutes locks that kid's profile on that device for 5 minutes. Returns
-- {ok, reason?, retry_after_s?, tries_left?}; never raises on a wrong PIN, so the attempt
-- it records is kept.
-- Note: both kids share one device identity, so the PIN is a sibling keep-out on the iPad,
-- not a database boundary (CLAUDE.md req. 4 calls it exactly that).
create function public.verify_kid_pin(p_kid_id uuid, p_pin text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  hash text;
  fails int;
  oldest timestamptz;
begin
  select k.family_id, k.pin_hash into fid, hash from public.kids k where k.id = p_kid_id;
  if fid is null or not private.is_member_of(fid) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if hash is null then
    return jsonb_build_object('ok', true);
  end if;
  select count(*), min(a.attempted_at) into fails, oldest from public.pin_attempts a
    where a.kid_id = p_kid_id and a.user_id = uid and a.attempted_at > now() - interval '5 minutes';
  if fails >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'retry_after_s', greatest(1, ceil(extract(epoch from (oldest + interval '5 minutes' - now())))::int));
  end if;
  if coalesce(p_pin, '') ~ '^[0-9]{4}$' and extensions.crypt(p_pin, hash) = hash then
    delete from public.pin_attempts where kid_id = p_kid_id and user_id = uid;
    return jsonb_build_object('ok', true);
  end if;
  insert into public.pin_attempts (kid_id, user_id) values (p_kid_id, uid);
  return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', 4 - fails);
end;
$$;

-- Server clock, so a wrong iPad clock can't stretch, skip or escape a timed focus mode.
create function public.server_now()
returns timestamptz
language sql stable
set search_path = ''
as $$ select now() $$;

-- Routine progress upsert for kid screens. SECURITY INVOKER: RLS and column grants apply as
-- the caller; completed_at is computed here when every step of the routine is done.
create function public.save_routine_progress(p_routine_id uuid, p_kid_id uuid, p_on_date date, p_steps text[])
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  fid uuid;
  all_ids text[];
  done timestamptz;
begin
  select r.family_id, array(select e ->> 'id' from jsonb_array_elements(r.steps) e)
    into fid, all_ids
    from public.routines r where r.id = p_routine_id;
  if fid is null then
    raise exception 'routine not found' using errcode = '42501';
  end if;
  -- Only ids that exist in the routine are kept, once each, in the order they were done.
  p_steps := array(
    select u.s from unnest(coalesce(p_steps, '{}')) with ordinality u(s, n)
    where u.s = any (all_ids)
    group by u.s order by min(u.n));
  done := case when cardinality(p_steps) = cardinality(all_ids) then now() end;
  insert into public.routine_completions as rc (family_id, routine_id, kid_id, on_date, completed_steps, completed_at)
    values (fid, p_routine_id, p_kid_id, p_on_date, p_steps, done)
  on conflict (family_id, routine_id, kid_id, on_date) do update
    set completed_steps = excluded.completed_steps,
        completed_at = case when excluded.completed_at is null then null
                            else coalesce(rc.completed_at, excluded.completed_at) end;
end;
$$;

create function public.save_reset_plan(p_kid_id uuid, p_body_signs text[], p_tools text[])
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  fid uuid;
begin
  select k.family_id into fid from public.kids k where k.id = p_kid_id;
  if fid is null then
    raise exception 'kid not found' using errcode = '42501';
  end if;
  insert into public.reset_plans (kid_id, family_id, body_signs, tools)
    values (p_kid_id, fid, coalesce(p_body_signs, '{}'), coalesce(p_tools, '{}'))
  on conflict (family_id, kid_id) do update set body_signs = excluded.body_signs, tools = excluded.tools;
end;
$$;

revoke execute on function public.verify_kid_pin(uuid, text) from public, anon;
revoke execute on function public.server_now() from public, anon;
revoke execute on function public.save_routine_progress(uuid, uuid, date, text[]) from public, anon;
revoke execute on function public.save_reset_plan(uuid, text[], text[]) from public, anon;
grant execute on function public.verify_kid_pin(uuid, text) to authenticated;
grant execute on function public.server_now() to authenticated;
grant execute on function public.save_routine_progress(uuid, uuid, date, text[]) to authenticated;
grant execute on function public.save_reset_plan(uuid, text[], text[]) to authenticated;
