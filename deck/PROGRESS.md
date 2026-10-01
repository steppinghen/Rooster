# Phase 1 Progress

Session handoff for `PHASE1_PLAN.md`. After each slice: what was built, decisions made, open questions, next slice. On a new session or after compaction, read `CLAUDE.md`, `PHASE1_PLAN.md`, then this file, and continue from the next unfinished slice.

## Pre-slice setup (2026-10-01)

- Branch `deck/phase-1` created; all Phase 1 work happens there.
- Added the `deck/` row to the root `CLAUDE.md` port table: dev 8894, static 3997, site `rooster-deck` (site not created until Gate 2).
- Added `STATUS.md` (short current state, points here).
- Staging rule: only stage specific paths inside `deck/` (plus the root port-table row). Never `git add -A` / `git add .` from the root. `../_shared` has unrelated uncommitted changes; leave them alone.
- The Deck does not use `_shared/auth-overlay`; it has its own auth (slice 2).

## Next

Slice 0: Scaffold (stops afterwards for the flat vs. 3D emoji pick).
