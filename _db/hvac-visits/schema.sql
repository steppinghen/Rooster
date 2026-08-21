-- =====================================================================
-- Rounds — Supabase schema (v1)
-- Source of truth: rounds-schema-and-import-spec.md (reviewed against the
-- real HVAC_Contracts.xlsx, 418 rows). Do NOT edit the data model here
-- without updating that spec.
--
-- REVIEW BEFORE RUNNING. This file only defines structure + RLS; it does
-- not import any data (see import_rounds.py) and has not been run.
-- =====================================================================

-- ── contractors ──────────────────────────────────────────────────────
create table contractors (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id),  -- multi-tenant from day 1
  legacy_id       text,                    -- "C001".."C418", kept for traceability
  company         text not null,
  street_address  text,
  city            text,
  state           text default 'NC',
  zip             text,
  phone           text,
  contact         text,                    -- freeform, unparsed (was contact_name)
  visitable       text not null default 'VISIT'
                    check (visitable in ('VISIT','CALL ONLY')),
  starred         boolean not null default false,
  territory       text not null,           -- computed on write, never hand-typed
  target_days     integer not null default 60,
  last_visited    date,                    -- NULL = never visited = calm start
  lat             double precision,        -- nullable; ~51 rows have none
  lng             double precision,
  status          text not null default 'active'
                    check (status in ('active','churned')),
  created_at      timestamptz not null default now()
);

-- ── visits — a real visit; resets the cadence clock ──────────────────
create table visits (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id),
  contractor_id  uuid not null references contractors(id) on delete cascade,
  visited_on     date not null default current_date,
  note           text,
  created_at     timestamptz not null default now()
);

-- ── updates — a CRM note; does NOT touch the clock ───────────────────
create table updates (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id),
  contractor_id  uuid not null references contractors(id) on delete cascade,
  note           text not null,
  created_at     timestamptz not null default now()
);

-- ── territory lookups — derivation data lives in the DB ──────────────
create table territory_cities (
  city       text primary key,
  territory  text not null
);
create table territory_raleigh_zips (
  zip        text primary key,
  territory  text not null
);

-- Helpful indexes for the read-time overdue math and roster filters.
create index contractors_owner_idx     on contractors (owner_id);
create index contractors_territory_idx on contractors (owner_id, territory);
create index visits_contractor_idx     on visits (contractor_id);
create index updates_contractor_idx    on updates (contractor_id);

-- =====================================================================
-- RLS — enabled on every table from the start (his book of business)
-- =====================================================================
alter table contractors enable row level security;
alter table visits      enable row level security;
alter table updates     enable row level security;

-- Owner-scoped: a user sees and writes only their own rows.
create policy "own rows" on contractors
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows" on visits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own rows" on updates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Territory lookups: non-sensitive reference data. RLS on; any signed-in
-- user may read; writes come only from the service role (which bypasses
-- RLS), so there is deliberately no insert/update/delete policy here.
alter table territory_cities        enable row level security;
alter table territory_raleigh_zips  enable row level security;

create policy "read cities" on territory_cities
  for select using (auth.role() = 'authenticated');
create policy "read zips" on territory_raleigh_zips
  for select using (auth.role() = 'authenticated');
