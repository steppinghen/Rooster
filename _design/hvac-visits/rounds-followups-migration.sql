-- =====================================================================
-- Rounds — follow-ups migration (v2)
--
-- Adds "next step / follow-up" capability to the existing model WITHOUT a
-- new table. A follow-up is just a NOTE that's been flagged with a due date
-- — matching the product decision "mark a note as a follow-up." This keeps
-- the account timeline unified (visits + notes + follow-ups are one stream)
-- and inherits the existing RLS on `updates` for free.
--
-- REVIEW BEFORE RUNNING. Additive only — no data is dropped or altered.
-- Safe to run once against the personal Supabase project.
-- =====================================================================

-- 1. Add the three follow-up fields to the existing notes table (`updates`).
--    - is_followup : this note is a tracked next-step, not just a record
--    - due_date    : when it should surface in Today → Needs attention (nullable)
--    - done_at     : when it was checked off; NULL = still open.
--                    Set (not deleted) so completed follow-ups remain in
--                    the account's history as a "Done" entry (the paper trail).
alter table updates
  add column if not exists is_followup boolean not null default false,
  add column if not exists due_date    date,
  add column if not exists done_at      timestamptz;

-- 2. Index the open follow-ups — this is the query Today → Needs attention runs
--    constantly (open = flagged and not yet done), scoped per owner.
create index if not exists updates_open_followups_idx
  on updates (owner_id, due_date)
  where is_followup = true and done_at is null;

-- =====================================================================
-- RLS: nothing new required.
-- `updates` already has row-level security enabled with the owner-scoped
-- "own rows" policy from the original schema. New columns are covered by
-- that same policy automatically — a user still only sees and edits their
-- own rows, follow-up or not.
-- =====================================================================

-- ---------------------------------------------------------------------
-- How the app reads/writes this (for reference; no SQL to run here):
--
--   Add a note (plain):        insert updates (…, is_followup=false)
--   Add a next step:           insert updates (…, is_followup=true, due_date=…)
--   Log a visit + next step:   insert visits (…);  insert updates (is_followup=true, due_date=…)
--   Check off a follow-up:     update updates set done_at = now() where id = …
--
--   Today → Needs attention:   select * from updates
--                              where is_followup = true and done_at is null
--                              order by due_date nulls last;
--                              (overdue = due_date < current_date)
--
--   Account → Next steps:      same filter, scoped to one contractor_id
--   Account → History:         visits + all updates (incl. done follow-ups),
--                              newest first; done follow-ups show as "Done".
-- ---------------------------------------------------------------------
