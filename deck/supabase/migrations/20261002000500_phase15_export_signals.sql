-- The Deck: Phase 1.5 slice 1, part 5. Export, cleanup and Realtime signals for the 1.5 tables.
--
-- Delete family needs no change: every 1.5 table cascades from families, and the feed URLs
-- (private.calendar_feeds) cascade from their calendars. 010_phase15_export_delete.sql proves it.

-- ---------------------------------------------------------------------------------------------
-- Export, version 2: driven by private.deck_tables(), so a new table can't be left out. Every
-- table with family_id is exported, minus its secrets; the rest are listed under "omitted".
-- ---------------------------------------------------------------------------------------------

create or replace function public.export_family()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  fid uuid;
  t text;
  rows jsonb;
  out jsonb := '{}';
  secrets constant jsonb := '{"kids": ["pin_hash"], "pairing_codes": ["code_hash"], "parents": ["unlock_pin_hash"]}';
  skip constant text[] := array['families', 'module_catalog', 'pairing_attempts', 'pin_attempts', 'display_unlock_attempts'];
begin
  select p.family_id into fid from public.parents p where p.user_id = auth.uid();
  if fid is null or not private.is_parent_of(fid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  foreach t in array private.deck_tables() loop
    continue when t = any (skip);
    -- (alias r_, not x: sticker_awards has a column named x)
    execute format('select coalesce(jsonb_agg(to_jsonb(r_) - $2), ''[]''::jsonb) from public.%I r_ where r_.family_id = $1', t)
      into rows
      using fid, array(select jsonb_array_elements_text(coalesce(secrets -> t, '[]')));
    out := out || jsonb_build_object(t, rows);
  end loop;

  return jsonb_build_object(
    'format', 'the-deck-family-export',
    'version', 2,
    'exported_at', now(),
    'family', (select to_jsonb(f) from public.families f where f.id = fid),
    'tables', out,
    'module_catalog', (select jsonb_agg(to_jsonb(m) order by m.sort_order) from public.module_catalog m),
    'omitted', jsonb_build_object(
      'kids.pin_hash', 'secret: set PINs again after a rebuild',
      'parents.unlock_pin_hash', 'secret: set the kitchen PIN again after a rebuild',
      'pairing_codes.code_hash', 'secret: pairing codes are single-use and short-lived',
      'calendar feed links', 'secret: paste each calendar''s link again after a rebuild (Manage calendars)',
      'pairing_attempts', 'operational lockout rows, not family data',
      'pin_attempts', 'operational lockout rows, not family data',
      'display_unlock_attempts', 'operational lockout rows, not family data')
  );
end;
$$;
revoke execute on function public.export_family() from public, anon;
grant execute on function public.export_family() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Nightly cleanup: the guard reads the one table list; unlock attempts and old unlocks go too.
-- ---------------------------------------------------------------------------------------------

create or replace function private.cleanup_orphans() returns jsonb
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
    where t.schemaname = 'public' and t.tablename <> all (private.deck_tables())
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
  delete from public.display_unlock_attempts where attempted_at < now() - interval '1 day';
  -- Who unlocked the kitchen, and when, is kept 30 days.
  delete from public.display_unlocks where coalesce(ended_at, expires_at) < now() - interval '30 days';

  return jsonb_build_object('anonymous_removed', n_anon, 'unlisted_removed', n_unlisted);
end;
$$;
revoke execute on function private.cleanup_orphans() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Realtime: payload-free "changed" signals for the 1.5 tables. Parents-only changes go to the
-- parents topic, so iPads don't even learn they happened.
-- ---------------------------------------------------------------------------------------------

create or replace function private.signal_family_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  fid text := case when tg_table_name = 'families' then row_data ->> 'id' else row_data ->> 'family_id' end;
  parents_only boolean;
begin
  parents_only := case
    when tg_table_name in ('feelings_notes', 'parent_calendar_prefs') then true
    -- A calendar no iPad can list: never for kids (before and after) and no display shows it.
    when tg_table_name = 'calendars' then
      coalesce(to_jsonb(new) ->> 'kids_default', 'never') = 'never' and coalesce(to_jsonb(old) ->> 'kids_default', 'never') = 'never'
      and not exists (select 1 from public.device_calendars dc where dc.calendar_id = (row_data ->> 'id')::uuid and dc.mode <> 'off')
    -- An event kids can't see, before or after, is none of the iPads' business.
    -- (Read through jsonb: NEW and OLD are other tables' rows when this runs elsewhere.)
    when tg_table_name = 'events' then
      not coalesce(private.event_kid_visible((to_jsonb(new) ->> 'calendar_id')::uuid, (to_jsonb(new) ->> 'kid_visibility')::public.kid_visibility), false)
      and not coalesce(private.event_kid_visible((to_jsonb(old) ->> 'calendar_id')::uuid, (to_jsonb(old) ->> 'kid_visibility')::public.kid_visibility), false)
    else false
  end;
  if fid is not null then
    perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', (case when parents_only then 'parents:' else 'family:' end) || fid, true);
  end if;
  return null;
end;
$$;
revoke execute on function private.signal_family_change() from public, anon, authenticated;

create trigger routine_kids_signal after insert or update or delete on public.routine_kids
  for each row execute function private.signal_family_change();
create trigger device_kids_signal after insert or update or delete on public.device_kids
  for each row execute function private.signal_family_change();
create trigger checkin_moments_signal after insert or update or delete on public.checkin_moments
  for each row execute function private.signal_family_change();
create trigger feelings_notes_signal after insert or update or delete on public.feelings_notes
  for each row execute function private.signal_family_change();
create trigger calendars_signal after insert or update or delete on public.calendars
  for each row execute function private.signal_family_change();
create trigger device_calendars_signal after insert or update or delete on public.device_calendars
  for each row execute function private.signal_family_change();
create trigger parent_calendar_prefs_signal after insert or update or delete on public.parent_calendar_prefs
  for each row execute function private.signal_family_change();
create trigger event_kids_signal after insert or update or delete on public.event_kids
  for each row execute function private.signal_family_change();
create trigger meals_signal after insert or update or delete on public.meals
  for each row execute function private.signal_family_change();
create trigger dinner_plan_signal after insert or update or delete on public.dinner_plan
  for each row execute function private.signal_family_change();
create trigger weather_cache_signal after insert or update or delete on public.weather_cache
  for each row execute function private.signal_family_change();
create trigger kid_decks_signal after insert or update or delete on public.kid_decks
  for each row execute function private.signal_family_change();
create trigger sticker_awards_signal after insert or update or delete on public.sticker_awards
  for each row execute function private.signal_family_change();

-- Device settings a screen shows (job, start view, unlock, sound and so on), not last_seen_at.
drop trigger devices_signal on public.devices;
create trigger devices_signal after update on public.devices
  for each row when (
    (old.label, old.ground, old.revoked_at, old.job, old.start_view, old.return_to_start, old.parent_unlock,
     old.unlock_minutes, old.sound, old.read_aloud, old.dim_at_lights_out)
    is distinct from
    (new.label, new.ground, new.revoked_at, new.job, new.start_view, new.return_to_start, new.parent_unlock,
     new.unlock_minutes, new.sound, new.read_aloud, new.dim_at_lights_out))
  execute function private.signal_family_change();
