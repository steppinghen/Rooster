# deck — status

Short summary only. The detailed slice-by-slice handoff is [`PROGRESS.md`](PROGRESS.md); the plan is [`PHASE1_PLAN.md`](PHASE1_PLAN.md); the parent's review packet is [`REVIEW.md`](REVIEW.md).

## Currently working on

Phase 1 is built and reviewed locally on branch `deck/phase-1`. **Gate 1, device testing in progress**: the parent is running REVIEW.md section 6. P1 (TOTP enrollment re-enrolling after app switches) is fixed in `ec004db` and awaits a retest. Start the dev server with `npm run dev` (port 8894).

## Blockers / open questions

- REVIEW.md open questions Q2–Q18 (each has a default).
- Gate 2 needs the parent's manual steps G0–G11 before anything is linked, pushed or deployed.

## Setup checklist

- [x] Branch `deck/phase-1`
- [x] Root port-table row (8894 / 3997)
- [x] Scaffold, local Supabase stack, styleguide (slice 0)
- [x] Slices 1–11, plus reviews (rls-auditor and kid-ux-tester per slice group; phase-reviewer at the end)
- [ ] Gate 1: parent review and device tests (in progress; P1 fixed in ec004db)
- [ ] Gate 2: hosted Supabase settings, Netlify site `rooster-deck`, then link, push and deploy

## Backlog

REVIEW.md section 4 lists the open gaps (X5 mascot names, X7 cold-launch offline test, X8 a third kid in the UI, X9 spoken heads-up, X10 session detail, X11 per-device sound off).
