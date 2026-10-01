# deck — status

Short summary only. The detailed slice-by-slice handoff is [`PROGRESS.md`](PROGRESS.md); the plan is [`PHASE1_PLAN.md`](PHASE1_PLAN.md); the parent's review packet is [`REVIEW.md`](REVIEW.md).

## Currently working on

Phase 1 is built and reviewed locally on branch `deck/phase-1`. **Stopped at Gate 1**: the parent reviews REVIEW.md (sections 2–5) and runs the device test list (section 6).

## Blockers / open questions

- REVIEW.md open questions Q2–Q18 (each has a default).
- Gate 2 needs the parent's manual steps G0–G11 before anything is linked, pushed or deployed.

## Setup checklist

- [x] Branch `deck/phase-1`
- [x] Root port-table row (8894 / 3997)
- [x] Scaffold, local Supabase stack, styleguide (slice 0)
- [x] Slices 1–11, plus reviews (rls-auditor and kid-ux-tester per slice group; phase-reviewer at the end)
- [ ] Gate 1: parent review and device tests
- [ ] Gate 2: hosted Supabase settings, Netlify site `rooster-deck`, then link, push and deploy

## Backlog

REVIEW.md section 4 lists the open gaps (X5 mascot names, X7 cold-launch offline test, X8 a third kid in the UI, X9 spoken heads-up, X10 session detail, X11 per-device sound off).
