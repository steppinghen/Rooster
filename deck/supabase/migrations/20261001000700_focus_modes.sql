-- The Deck: slice 10. Focus modes (parent-controlled), pushed to iPads with private Realtime
-- Broadcast.
--
-- kid_focus has no write grants: set_focus and cancel_focus_switch (security definer, aal2
-- parents of the kids' family only, all kids or none) are the only writers, so only states
-- they create exist. They work on server time: a switch happens now or after a 2-minute
-- heads-up (pending_mode + switch_at), optionally for a set number of minutes, after which
-- the kid returns to where they were (pending_return_mode / return_mode).
--
-- Realtime: no table is published with postgres_changes (it doesn't apply RLS to DELETE).
-- Instead, triggers send a payload-free "changed" message to the private topic
-- family:<family_id>; devices refetch through RLS. RLS on realtime.messages lets only that
-- family's members join the topic. A revoked iPad gets a message on its own topic
-- device:<auth uid>, so it can show "unpaired" at once.

create function public.set_focus(p_kid_ids uuid[], p_mode public.focus_mode, p_minutes integer default null, p_now boolean default false)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  ids uuid[];
  r record;
  eff public.focus_mode;
  ret public.focus_mode;
  ends timestamptz;
  next_return public.focus_mode;
  at timestamptz;
  n int := 0;
begin
  if p_minutes is not null and (p_minutes not between 1 and 240 or p_mode = 'everything') then
    raise exception 'a duration is 1 to 240 minutes, and only for Session or Lights out' using errcode = '22023';
  end if;
  if p_kid_ids is null or array_position(p_kid_ids, null) is not null then
    raise exception 'kid ids are required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct k), '{}') into ids from unnest(p_kid_ids) k;

  -- Parents of the kids' family only (aal2). All kids or none.
  if exists (
    select 1 from unnest(ids) k
    where not exists (select 1 from public.kid_focus f where f.kid_id = k and private.is_parent_of(f.family_id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for r in select * from public.kid_focus f where f.kid_id = any (ids) order by f.kid_id for update loop
    -- Where is this kid right now? A pending switch whose time has come is live; a timed mode
    -- that has run out has returned.
    eff := r.mode;
    ret := r.return_mode;
    ends := r.ends_at;
    if ends is not null and ends <= now() and not (r.switch_at is not null and r.switch_at <= ends) then
      eff := coalesce(ret, 'everything');
      ret := null;
      ends := null;
    end if;
    if r.pending_mode is not null and r.switch_at <= now() then
      ret := r.pending_return_mode;
      eff := r.pending_mode;
      ends := r.pending_ends_at;
      if ends is not null and ends <= now() then
        eff := coalesce(ret, 'everything');
        ret := null;
        ends := null;
      end if;
    end if;

    at := case when p_now then now() else now() + interval '2 minutes' end;
    -- Where a timed switch returns to: the mode the kid will be in when it starts (re-timing
    -- the same mode keeps that mode's own return).
    next_return := case
      when p_minutes is null then null
      when p_mode = eff then coalesce(ret, 'everything')
      when ends is not null and ends <= at then coalesce(ret, 'everything')
      else eff end;

    if p_now or p_mode = eff then
      update public.kid_focus set
        mode = p_mode, since = now(),
        ends_at = case when p_minutes is not null then now() + make_interval(mins => p_minutes) end,
        return_mode = next_return,
        pending_mode = null, switch_at = null, pending_ends_at = null, pending_return_mode = null
      where family_id = r.family_id and kid_id = r.kid_id;
    else
      -- Heads-up: the current mode (and its timer) carries on for two more minutes.
      update public.kid_focus set
        mode = eff,
        since = case when eff = r.mode then r.since else coalesce(r.switch_at, now()) end,
        ends_at = ends,
        return_mode = ret,
        pending_mode = p_mode,
        switch_at = at,
        pending_ends_at = case when p_minutes is not null then at + make_interval(mins => p_minutes) end,
        pending_return_mode = next_return
      where family_id = r.family_id and kid_id = r.kid_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create function public.cancel_focus_switch(p_kid_ids uuid[])
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n int;
begin
  if exists (
    select 1 from unnest(coalesce(p_kid_ids, '{}')) k
    where not exists (select 1 from public.kid_focus f where f.kid_id = k and private.is_parent_of(f.family_id))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Only the pending switch is called off; a running timed mode keeps its timer.
  update public.kid_focus set pending_mode = null, switch_at = null, pending_ends_at = null, pending_return_mode = null
  where kid_id = any (p_kid_ids) and pending_mode is not null and switch_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.set_focus(uuid[], public.focus_mode, integer, boolean) from public, anon;
-- (definer functions: callable by authenticated, and they check the caller themselves)
revoke execute on function public.cancel_focus_switch(uuid[]) from public, anon;
grant execute on function public.set_focus(uuid[], public.focus_mode, integer, boolean) to authenticated;
grant execute on function public.cancel_focus_switch(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: payload-free change signals on private topics.
-- ---------------------------------------------------------------------------------------------

create function private.signal_family_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  fid text := case when tg_table_name = 'families' then row_data ->> 'id' else row_data ->> 'family_id' end;
  parents_only boolean := tg_table_name = 'events'
    and not coalesce((to_jsonb(new) ->> 'visible_to_kids')::boolean, false)
    and not coalesce((to_jsonb(old) ->> 'visible_to_kids')::boolean, false);
begin
  if fid is not null then
    -- A parents-only event is none of the iPads' business, not even that it changed.
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', (case when parents_only then 'parents:' else 'family:' end) || fid, true);
  end if;
  return null;
end;
$$;

create function private.signal_device_revoked() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    perform realtime.send('{}'::jsonb, 'revoked', 'device:' || new.device_user_id::text, true);
  end if;
  return null;
end;
$$;

revoke execute on function private.signal_family_change() from public, anon, authenticated;
revoke execute on function private.signal_device_revoked() from public, anon, authenticated;

create trigger kid_focus_signal after insert or update or delete on public.kid_focus
  for each row execute function private.signal_family_change();
create trigger family_modules_signal after insert or update or delete on public.family_modules
  for each row execute function private.signal_family_change();
create trigger routines_signal after insert or update or delete on public.routines
  for each row execute function private.signal_family_change();
create trigger events_signal after insert or update or delete on public.events
  for each row execute function private.signal_family_change();
create trigger kids_signal after insert or update or delete on public.kids
  for each row execute function private.signal_family_change();
create trigger families_signal after update on public.families
  for each row execute function private.signal_family_change();
-- Not on last_seen_at check-ins, only on settings a screen shows.
create trigger devices_signal after update on public.devices
  for each row when (old.label is distinct from new.label or old.ground is distinct from new.ground or old.revoked_at is distinct from new.revoked_at)
  execute function private.signal_family_change();
create trigger devices_revoked_signal after update of revoked_at on public.devices
  for each row execute function private.signal_device_revoked();

-- Who may receive a topic's messages (Realtime checks this when a client joins a private
-- channel). No insert policy: clients can never broadcast; only these triggers do.
create policy deck_private_topics on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (realtime.topic() ~ '^family:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and (select private.is_member_of(substring(realtime.topic() from 8)::uuid)))
      or (realtime.topic() ~ '^parents:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and (select private.is_parent_of(substring(realtime.topic() from 9)::uuid)))
      or (realtime.topic() = 'device:' || (select auth.uid())::text and (select private.is_anonymous_session()))
    )
  );
