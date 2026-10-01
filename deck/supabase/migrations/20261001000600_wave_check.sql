-- The Deck: slice 9. Wave Check retention and the kid's own current check-in; usage retention.

-- A kid sees only their own current check-in (CLAUDE.md req. 6): the latest one from today, in
-- the family's time zone. Devices can't read feelings_checkins at all; this returns one row.
create function public.current_checkin(p_kid_id uuid)
returns table (feeling public.feeling, size smallint, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select c.feeling, c.size, c.created_at
  from public.feelings_checkins c
  join public.kids k on k.id = c.kid_id and k.family_id = c.family_id
  join public.families f on f.id = c.family_id
  where c.kid_id = p_kid_id
    and private.is_member_of(c.family_id)
    and (c.created_at at time zone f.timezone)::date = (now() at time zone f.timezone)::date
  order by c.created_at desc
  limit 1
$$;
revoke execute on function public.current_checkin(uuid) from public, anon;
grant execute on function public.current_checkin(uuid) to authenticated;

-- 30-day retention for feelings (CLAUDE.md req. 6). Deletes only rows older than 30 days.
create function private.purge_old_checkins() returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from public.feelings_checkins where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.purge_old_checkins() from public, anon, authenticated;
select cron.schedule('deck-purge-checkins', '7 3 * * *', $$select private.purge_old_checkins()$$);

-- Usage: rows are kept 90 days, then rolled into monthly aggregates (CLAUDE.md "Usage
-- snapshots"). Aggregates carry counts and durations only.
create table public.usage_monthly (
  family_id uuid not null references public.families (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  kid_id uuid,
  module_key text not null,
  action public.usage_action not null,
  events integer not null default 0,
  total_duration_ms bigint not null default 0,
  foreign key (kid_id, family_id) references public.kids (id, family_id) on delete cascade,
  unique nulls not distinct (family_id, month, kid_id, module_key, action)
);
alter table public.usage_monthly enable row level security;
create policy usage_monthly_select on public.usage_monthly for select to authenticated
  using ((select private.is_parent_of(family_id)));
grant select on public.usage_monthly to authenticated;

create function private.rollup_old_usage() returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  n int;
begin
  with old as (
    delete from public.usage_events where created_at < now() - interval '90 days'
    returning family_id, kid_id, module_key, action, duration_ms, created_at
  ), agg as (
    select family_id, date_trunc('month', created_at)::date as month, kid_id, module_key, action,
           count(*)::int as events, coalesce(sum(duration_ms), 0)::bigint as total
    from old group by 1, 2, 3, 4, 5
  )
  insert into public.usage_monthly as m (family_id, month, kid_id, module_key, action, events, total_duration_ms)
  select family_id, month, kid_id, module_key, action, events, total from agg
  on conflict (family_id, month, kid_id, module_key, action)
  do update set events = m.events + excluded.events, total_duration_ms = m.total_duration_ms + excluded.total_duration_ms;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.rollup_old_usage() from public, anon, authenticated;
select cron.schedule('deck-rollup-usage', '27 3 * * *', $$select private.rollup_old_usage()$$);

-- The export includes the new table.
create or replace function public.export_family()
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
      'usage_events', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.usage_events x where x.family_id = fid), '[]'),
      'usage_monthly', coalesce((select jsonb_agg(to_jsonb(x) order by x.month) from public.usage_monthly x where x.family_id = fid), '[]')
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
