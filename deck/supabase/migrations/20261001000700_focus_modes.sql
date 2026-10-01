-- The Deck: slice 10. Focus modes (parent-controlled), pushed to iPads with private Realtime
-- Broadcast.
--
-- Writes to kid_focus stay parents-only (RLS from the core migration). set_focus is SECURITY
-- INVOKER, so that policy is what lets it write. It works on server time: a switch either
-- happens now or after a 2-minute heads-up (pending_mode + switch_at), optionally for a set
-- number of minutes after which the kid returns to the mode they were in.
--
-- Realtime: no table is published with postgres_changes (it doesn't apply RLS to DELETE).
-- Instead, triggers send a payload-free "changed" message to the private topic
-- family:<family_id>; devices refetch through RLS. RLS on realtime.messages lets only that
-- family's members join the topic. A revoked iPad gets a message on its own topic
-- device:<auth uid>, so it can show "unpaired" at once.

create function public.set_focus(p_kid_ids uuid[], p_mode public.focus_mode, p_minutes integer default null, p_now boolean default false)
returns integer
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  r record;
  eff public.focus_mode;
  ret public.focus_mode;
  ends timestamptz;
  n int := 0;
begin
  if p_minutes is not null and (p_minutes not between 1 and 240 or p_mode = 'everything') then
    raise exception 'a duration is 1 to 240 minutes, and only for Session or Lights out' using errcode = '22023';
  end if;

  for r in select * from public.kid_focus f where f.kid_id = any (p_kid_ids) for update loop
    -- Where is this kid right now? (A pending switch whose time has come is live; a timed
    -- mode that has run out has returned.)
    eff := r.mode;
    ret := r.return_mode;
    ends := r.ends_at;
    if r.pending_mode is not null and r.switch_at <= now() then
      ret := coalesce(r.return_mode, r.mode);
      eff := r.pending_mode;
      ends := r.pending_ends_at;
    end if;
    if ends is not null and ends <= now() then
      eff := coalesce(ret, 'everything');
      ret := null;
      ends := null;
    end if;

    if p_now or p_mode = eff then
      update public.kid_focus set
        mode = p_mode, since = now(),
        ends_at = case when p_minutes is not null then now() + make_interval(mins => p_minutes) end,
        return_mode = case when p_minutes is not null then eff end,
        pending_mode = null, switch_at = null, pending_ends_at = null
      where family_id = r.family_id and kid_id = r.kid_id;
    else
      -- Heads-up: stay in the current mode for two more minutes, then switch.
      update public.kid_focus set
        mode = eff,
        since = case when eff = r.mode then r.since else coalesce(r.switch_at, now()) end,
        ends_at = null,
        return_mode = case when p_minutes is not null then eff end,
        pending_mode = p_mode,
        switch_at = now() + interval '2 minutes',
        pending_ends_at = case when p_minutes is not null then now() + interval '2 minutes' + make_interval(mins => p_minutes) end
      where family_id = r.family_id and kid_id = r.kid_id;
    end if;
    if not found then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    n := n + 1;
  end loop;

  if n < coalesce(cardinality(p_kid_ids), 0) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return n;
end;
$$;

create function public.cancel_focus_switch(p_kid_ids uuid[])
returns integer
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  n int;
begin
  update public.kid_focus set pending_mode = null, switch_at = null, pending_ends_at = null,
    return_mode = case when ends_at is null then null else return_mode end
  where kid_id = any (p_kid_ids) and pending_mode is not null and switch_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.set_focus(uuid[], public.focus_mode, integer, boolean) from public, anon;
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
begin
  if fid is not null then
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'family:' || fid, true);
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
      (realtime.topic() ~ '^family:[0-9a-f-]{36}$' and (select private.is_member_of(substring(realtime.topic() from 8)::uuid)))
      or (realtime.topic() = 'device:' || (select auth.uid())::text and (select private.is_anonymous_session()))
    )
  );
