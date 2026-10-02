-- The Deck: Phase 1.5 slice 1, part 3. Snack Shack (meals, dinner plan) and the weather cache.
--
-- Meals and the dinner plan are parents-only tables. Kids and the locked kitchen hub read
-- dinners through an RPC (slice 12) that never returns the options being weighed for an
-- undecided night (REVIEW.md A13): parents and devices share the `authenticated` role, so a
-- column grant can't keep `options` from a device.

create type public.dinner_kind as enum ('meal', 'undecided', 'none');

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  default_sides text check (default_sides is null or char_length(btrim(default_sides)) between 1 and 60),
  icon text check (icon is null or char_length(icon) between 1 and 40),
  recipe_url text check (recipe_url is null or (char_length(recipe_url) <= 500 and recipe_url ~* '^https://[^[:space:]]+$')),
  ingredients text check (ingredients is null or char_length(ingredients) <= 2000),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (id, family_id)
);
-- Every meal entered becomes a favorite; one per name.
create unique index meals_name on public.meals (family_id, lower(btrim(name)));

create table public.dinner_plan (
  family_id uuid not null references public.families (id) on delete cascade,
  on_date date not null,
  kind public.dinner_kind not null,
  meal_id uuid,
  sides text check (sides is null or char_length(btrim(sides)) between 1 and 60),
  -- Undecided: the options being weighed. Never shown to kids.
  options text[] not null default '{}' check (options <@ '{leftovers,out,easy}'::text[]),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (family_id, on_date),
  foreign key (meal_id, family_id) references public.meals (id, family_id) on delete restrict,
  check ((kind = 'meal') = (meal_id is not null)),
  check (kind = 'meal' or sides is null),
  check (kind = 'undecided' or options = '{}')
);

create function private.dinner_plan_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger dinner_plan_stamp before insert or update on public.dinner_plan
  for each row execute function private.dinner_plan_stamp();

alter table public.meals enable row level security;
alter table public.dinner_plan enable row level security;

create policy meals_select on public.meals for select to authenticated using ((select private.is_parent_of(family_id)));
create policy meals_insert on public.meals for insert to authenticated with check ((select private.is_parent_of(family_id)));
create policy meals_update on public.meals for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy meals_delete on public.meals for delete to authenticated using ((select private.is_parent_of(family_id)));
grant select, delete on public.meals to authenticated;
grant insert (family_id, name, default_sides, icon, recipe_url, ingredients, last_used_at) on public.meals to authenticated;
grant update (name, default_sides, icon, recipe_url, ingredients, last_used_at) on public.meals to authenticated;

create policy dinner_plan_select on public.dinner_plan for select to authenticated using ((select private.is_parent_of(family_id)));
create policy dinner_plan_insert on public.dinner_plan for insert to authenticated with check ((select private.is_parent_of(family_id)));
create policy dinner_plan_update on public.dinner_plan for update to authenticated
  using ((select private.is_parent_of(family_id))) with check ((select private.is_parent_of(family_id)));
create policy dinner_plan_delete on public.dinner_plan for delete to authenticated using ((select private.is_parent_of(family_id)));
grant select, delete on public.dinner_plan to authenticated;
grant insert (family_id, on_date, kind, meal_id, sides, options) on public.dinner_plan to authenticated;
grant update (kind, meal_id, sides, options) on public.dinner_plan to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Weather: one row per family, written by the server's hourly job (slice 11) from the home
-- location rounded to about 1 km. Kid devices only read it, so weather works offline from the
-- last fetch; kid screens hide it once it's more than about 12 hours old.
-- ---------------------------------------------------------------------------------------------

create table public.weather_cache (
  family_id uuid primary key references public.families (id) on delete cascade,
  fetched_at timestamptz not null,
  location jsonb not null check (jsonb_typeof(location) = 'object'),
  today jsonb not null check (jsonb_typeof(today) = 'object'),
  days jsonb not null check (jsonb_typeof(days) = 'array'),
  source text not null default 'open-meteo' check (char_length(source) between 1 and 40)
);
alter table public.weather_cache enable row level security;
create policy weather_cache_select on public.weather_cache for select to authenticated
  using ((select private.is_member_of(family_id)));
grant select on public.weather_cache to authenticated;

revoke execute on function private.dinner_plan_stamp() from public, anon, authenticated;
