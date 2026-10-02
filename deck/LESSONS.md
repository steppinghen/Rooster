# Lessons from the Phase 1 build

A candid retro: what cost time, and what to change in the kit next time.

## What cost time

### Bugs that kept coming back

- **PostgREST upserts and column grants.** An upsert sets every payload column on conflict, so with tight column grants it fails. This hit routine progress and module switches. The fix each time was an invoker RPC, or update-then-insert.
- **Fixture and test drift after schema hardening.** Each security fix (renamed keys, `NULLS NOT DISTINCT`, CHECKs, removed grants) broke reviewer tests and helpers that wrote rows directly. Roughly a third of fix time went into updating tests that encoded the old behaviour.
- **Global counts in pgTAP.** Assertions like "4 rows" or "removed 3" broke once live e2e data sat in the same database. Scope every assertion to fixture ids, or run under `repeatable read`.
- **React effect dependencies.** Depending on the whole `useAsync` result object, which is new every render, re-ran effects every second. That made Realtime flaky, and the cause wasn't obvious.

### Gaps in the brief and plan

- **Turning off public sign-ups also blocks anonymous sign-ins**, which iPad pairing needs. The plan assumed both could be true. A `before_user_created` hook was the fix.
- **"Confirm email" off made the allowlist bypassable** (GoTrue auto-confirms). The plan didn't mention it; the auditor caught it.
- **Contradictions in the brief:** Lights out "only I need to breathe" against "feelings never locked out"; Last Run styling; whether reduced motion means no burst. These became open questions late, after tests had baked one answer in.
- **Hosted "auto-expose off"** had to be reproduced locally by hand, and `ALTER DEFAULT PRIVILEGES` can't revoke the global EXECUTE-to-PUBLIC per schema.

### Issues caught late

- **Secure-context APIs** (`crypto.randomUUID`) broke kid taps over plain http. Every e2e ran on 127.0.0.1 (a secure context), and only the phase reviewer tried the Tailscale origin.
- **iOS Home Screen apps reload on app switch.** That broke TOTP enrollment on the first real-device step. No browser test models it.
- **Supabase leaves family traces outside our tables:** `auth.audit_log_entries` and `realtime.messages` survived "delete family" until the second and third audits.
- **The focus-mode design** (timers, heads-up, cancel) needed a rewrite after review. A pure state machine plus property tests up front would have caught it.

### Tooling surprises

- **Background runs stop after 2 hours,** which kept killing the long-running dev server. The parent should run it.
- **Reviewer agents and the builder shared one local database.** A `db reset` mid-review wiped another agent's fixtures; it needed an explicit "don't reset" rule.
- **The full e2e suite grew to about 15 minutes** once reviewer specs were added, and flaky timing showed up under load (GoTrue rate limits, Realtime reconnect backoff).
- **`git add` from the monorepo needed care** to keep `_shared` changes out. The rule paid off.

## What I'd change in the kit

- **Brief:** resolve the known contradictions before slice 0 (Lights out controls, Last Run volume, reduced motion and bursts), and list the hosted auth settings (confirm email, sign-ups and anonymous, auth hooks, Realtime private-only) as locked decisions.
- **Plan:** add a slice-0 check that runs the app on the non-loopback http origin. Add "delete family must also clear auth audit logs and Realtime messages" to slice 6.
- **Agents:**
  - Give each agent its own database, or a "never reset" rule from the start.
  - Ask reviewers to scope every assertion to fixture ids.
  - Run the kid-ux-tester on the Tailscale origin as well as 127.0.0.1.
- **Tests:** a shared fixture library for valid states (focus, routines). It saves the rewrite every time a CHECK lands.
- **Process:** run the reviewers per slice as planned; batching slices 2–4 and 5–9 made the fix waves bigger. Do an early real-device smoke test (install the PWA, enroll TOTP, pair an iPad) right after slice 3, not at Gate 1.
- **Code:** a lint rule, or a `useAsync` that returns a stable object. Never put whole hook results in effect dependencies.
