# deck — status

Short summary only. The detailed slice-by-slice handoff is [`PROGRESS.md`](PROGRESS.md); the plans are [`PHASE1_PLAN.md`](PHASE1_PLAN.md) and [`PHASE15_PLAN.md`](PHASE15_PLAN.md); the parent's review packet is [`REVIEW.md`](REVIEW.md).

## Currently working on

Phase 1 is built, reviewed locally and its Gate 1 is answered (`deck/phase-1`). Phase 1.5 starts on `deck/phase-1.5`. Phase 1 and 1.5 go live together after the Phase 1.5 Gate 2. Start the dev server with `npm run dev` (port 8894).

## Blockers / open questions

- Phase 1.5 slice 0 brief audit: waiting on the parent's answers.
- Gate 2 (both phases): the parent's manual steps G0–G11, then the parent runs link, push and deploy.

## Setup checklist

- [x] Branch `deck/phase-1`
- [x] Root port-table row (8894 / 3997)
- [x] Scaffold, local Supabase stack, styleguide (slice 0)
- [x] Slices 1–11, plus reviews (rls-auditor and kid-ux-tester per slice group; phase-reviewer at the end)
- [x] Phase 1 Gate 1: answers recorded in REVIEW.md (TOTP fix `ec004db` retested with the 1.5 device tests)
- [ ] Phase 1.5 (slices 0–16), then its Gate 1
- [ ] Gate 2 (both phases): hosted Supabase settings, Netlify site `rooster-deck` in team `rooster-nc`, then link, push and deploy (run by the parent)

## Backlog

Phase 2: X5 mascot names, X10 session detail. Still open: X7 cold-launch offline test, X8 a third kid in the UI (covered by Phase 1.5's Kid C).
