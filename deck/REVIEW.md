# Phase 1 review packet

For the parent's single review at Gate 1. Branch `deck/phase-1` at `a14fb80`. The builder filled this in slice by slice; `phase-reviewer` finished it on 2026-10-01 after rerunning every suite.

## Gate 1 answers (parent, 2026-10-02)

| Item | Answer |
|---|---|
| Q3, Q4, Q8, Q10, Q13 | **Defaults accepted.** |
| Q9 / D10 | **Superseded by Phase 1.5.** Kid visibility comes from each calendar's kid default and the event's kid layer (Phase 1.5 slice 10). Phase 1 stays as built. |
| Q18 / X9, X11 | **Moved into Phase 1.5:** the auto-spoken heads-up for pre-readers (slice 4) and the Device page's Sound setting (slice 14). No change in Phase 1. |
| D4, D7 | **Confirmed.** D7's stills are replaced by the Phase 1.5 scene system (slice 4). D4 is not repeated: Phase 1.5 reviews every slice. |
| X5, X10 | **Phase 2.** |
| Q12, Q14, Q17 | Reconciled: they contradicted X3, X13 and X4, which were built at Gate 1. Marked superseded below. |
| TOTP fix `ec004db` (R1d) | Stays in place. The parent retests it with the Phase 1.5 device tests (slice 16). |
| Netlify team | **`rooster-nc`.** It is the only team on the steppinghen.nc@gmail.com account (display name "Rooster"), and `rooster-portfolio` lives in it. The root `CLAUDE.md`'s "the steppinghen team (`rooster-nc`)" means the same team. The site is not created yet. |
| Gate 2 | **No separate Phase 1 Gate 2.** Phase 1 and Phase 1.5 go live together after the Phase 1.5 Gate 2. The parent runs `supabase link`, `supabase db push` and the Netlify deploy; Claude Code gives the exact commands and verifies (see G9, C2, C4). |

## 1. Summary

**Built:** the whole Phase 1 list from `CLAUDE.md`, as slices 0–12 of `PHASE1_PLAN.md`:
- **Parents:** email-code sign-in with TOTP, enforced as `aal2` in the database. Family setup, a second parent through the allowlist, and kids (nickname, avatar, accent, age band, default volume, birthday month and day, optional PIN).
- **iPads:** pairing with a 10-minute single-use code, and revocation.
- **Kid side:** profile picker with a server-checked PIN, and Grom Zone home ("what's next" first, tiles from the registry).
- **Kid modules:** Dawn Patrol, After School and Last Run routines with read-aloud; Tour Dates countdowns; Wave Check with reset plan and balloon breathing.
- **Focus modes:** Everything, Session and Lights out, per kid or everyone, with durations, the 2-minute heads-up and Switch now. They reach the iPads over private Realtime.
- **Parent side:** Today dashboard; Back Office (Team Riders, Grown-ups, Devices with a ground picker, Routines, Family, Your data).
- **Your data:** export zip and typed-confirmation delete.
- **Platform:** offline snapshot plus outbox; day and night grounds × normal and focus volume; a self-hosted PWA with a strict CSP.

**Suites, rerun by phase-reviewer on 2026-10-01**

| Suite | Result |
|---|---|
| `supabase test db` | **PASS**: 2,283 assertions, 23 files |
| `npm run test:unit` | **PASS**: 32 tests, 7 files |
| `npm run lint` | clean |
| `npx playwright test` | **201 passed, 1 failed, 161 skipped** (the skips are by project). The failure is `focus-modes.spec.ts:9`. Rerun alone 3 times, it failed 2 of 3, so it isn't a one-off: see **X2** |
| Build | not rerun here (the builder reports it clean) |

**Not cleanly.**
- Six checks pass outright.
- **Update after the phase review:** the builder fixed X1 (kid taps over plain http) and X2 (a stale refetch after reconnecting), plus X3, X4, X6, X12 and X13. `focus-modes.spec.ts` now passes reliably, and `gate1-fixes.spec.ts` covers the http origin. See the gaps table for what is still open (X5, X7–X11).

| # | Acceptance check (`PHASE1_PLAN.md`) | Proved by | Locally |
|---|---|---|---|
| A1 | Both parents sign in from the home-screen PWA with an email code, never leave the app, see the same family, MFA on | `parent-auth.spec.ts` (A: code → TOTP → family → invite; B joins and sees the same family; a returning sign-in asks for TOTP, not enrollment; the email holds no link; an unlisted email is refused). Also `slice2-4-parent.spec.ts`, `003_parent_auth.sql`, `audit_hook_and_onboarding.sql`, and the aal1 rows in `002_rls_core.sql` | **Pass** in WebKit. The installed-PWA part needs a device: steps P1–P3 |
| A2 | iPad pairs with a code, survives a reboot, stops within one request after revocation | `pairing.spec.ts` (wrong code, right code, reload, unpair → Unpaired on the next load, cache cleared), `slice2-4-kid.spec.ts` Pair, `004_pairing.sql`, `audit_rpcs_and_revocation.sql`, `audit_lockouts.sql` | **Pass** (a reload stands in for the reboot). Reboot: K2 |
| A3 | A kid with a PIN can't be opened by the sibling | `picker.spec.ts` (wrong then right PIN; can't open by URL), `slice2-4-kid.spec.ts` lockout, `005_kid_profiles.sql`, `audit_lockouts.sql` | **Pass**, as a UI keep-out (Q3) |
| A4 | Lights out from the phone lands within seconds, after a 2-minute heads-up unless Switch now. A reload doesn't escape it; airplane mode keeps the last mode | `slice10-11-live.spec.ts` (phone → two iPads, per kid, Everyone, Cancel, Switch now, about 0.8 s), `slice10-11-kid.spec.ts` (heads-up runs out with no reload; fail closed offline), `focus-modes.spec.ts`, `008_focus.sql`, `audit_focus_realtime.sql` | **Pass.** Offline keeps the last mode (asserted). The reconnect defect (X2) is fixed. Real Realtime, sleep and airplane mode: K9–K12 |
| A5 | Wave Check reachable in every mode | `slice5-9-kid.spec.ts` "Wave Check survives every mode", the Lights out Q8 path in `slice10-11-kid.spec.ts`, `module_catalog.visible_in`, and the trigger that stops Wave Check being switched off (`002_rls_core.sql`) | **Pass**, including over the plain-http Tailscale origin (X1 fixed, `gate1-fixes.spec.ts`). In Lights out, Wave Check is reached through breathing (Q8, D6) |
| A6 | Export zip opens and contains every table | `export-delete.spec.ts` (unzips; `export.json` tables equal every `family_id` table in `information_schema`; no bcrypt), `006_export_delete.sql`, `audit_export.sql`, `exportZip.test.ts` | **Pass**. The iOS share sheet needs a device over HTTPS: F1 |
| A7 | All pgTAP tests pass; no secrets in git history | `supabase test db` 2,283 / 2,283. Secrets scan: `git log -p --all -- deck/` has no JWTs, `sb_secret_`/`sb_publishable_` keys or tokens; `.env.local` is untracked; `.gitignore` covers `.env.*` and `*.local` | **Pass** |

## 2. Review these first

Every item the plan marks → REVIEW.md (R1–R7), then the security-sensitive pieces it doesn't mark but that a reviewer should see (R8–R11). Migration files are abbreviated `…000N00_name.sql` under `supabase/migrations/`.

### R1. Parent auth and the hosted auth settings (slice 2)

- **Code:**
  - `src/routes/parent/SignIn.tsx:35` calls `signInWithOtp({ email, options: { shouldCreateUser: true } })`, and `:54` calls `verifyOtp({ type: 'email' })`. No redirect URL; `detectSessionInUrl: false` (`src/lib/supabase.ts`).
  - `src/routes/parent/Mfa.tsx:36` enrolls TOTP and `:48` runs `challengeAndVerify`.
  - `src/lib/session.tsx:50` routes any non-aal2 real user to MFA.
  - The real gate is in the database: `private.is_aal2_user()` (`…000000_foundation.sql:29`) sits inside `is_parent_of`, so an aal1 session gets nothing (`002_rls_core.sql`, aal1 block).
- **Settings:** these are the local values in `supabase/config.toml`. Apply the same by hand at Gate 2 (G4).

| Setting | config.toml | Why |
|---|---|---|
| Confirm email | `enable_confirmations = true` (:228) | **Required.** With it off, an invitation can be claimed without the mailbox (R1b) |
| Templates "Magic Link" and "Confirm signup" | :250–256 → `supabase/templates/otp.html` | A first sign-in sends *Confirm signup*; later ones send *Magic Link*. Both must show `{{ .Token }}` with no `{{ .ConfirmationURL }}` |
| Email OTP length and expiry | `otp_length = 6`, `otp_expiry = 600` (:234–236) | 6 digits, 10 minutes |
| Resend interval | `max_frequency = "1s"` (:232) | Local only, for tests. **Hosted: keep the default (60 s)** |
| Anonymous sign-ins | on (:178) | iPads pair as anonymous users |
| Allow new users to sign up | on (:176, :221) | Off also blocks anonymous sign-ins (Q2). The hook does the gating |
| Before User Created hook | :287–289 → `private.hook_before_user_created` | The allowlist (R8) |
| Manual linking | off (:180) | An anonymous iPad must never link an identity |
| MFA TOTP | enroll and verify on (:310–312); phone MFA off | 2FA for parents |
| JWT expiry | 3600 (:165) | This bounds R6's "revoked while connected" window (Q13) |
| Refresh token rotation | on, reuse interval 10 s (:171–174) | Default |
| Rate limits | `sign_in_sign_ups = 30`, `anonymous_users = 30`, `token_verifications = 30` (:197–209). `email_sent = 2` is local only | Hosted: the defaults. The email limit depends on the sender (G3) |
| Site URL | `http://127.0.0.1:8894` (:158) | Hosted: the production URL. No redirect URLs |

- **Tests:**
  - `parent-auth.spec.ts`: the e2e reads the real email from Mailpit and asserts it has no link.
  - `slice2-4-parent.spec.ts`: wrong code, wrong TOTP, unlisted email.
  - `003_parent_auth.sql` and `audit_hook_and_onboarding.sql`.
- **Trade-offs:**
  - There is no MFA recovery path (Q10).
  - Hosted session limits (time-box, inactivity) must stay off, or iPads get signed out and need re-pairing (G4).

### R1d. Device-test fix: TOTP enrollment survives leaving the app (P1)

- **Bug:** switching to Passwords and back reloaded the MFA screen on iPhone, and each load deleted the pending factor and enrolled a new one, so the code from Passwords never matched.
- **Fix:** `src/routes/parent/Mfa.tsx` and `src/lib/mfaPending.ts`.
  - Enrollment runs once per signed-in user, never on focus, visibility or token refresh.
  - Supabase only reveals a factor's secret at enroll time, so the pending enrollment (factor id, secret, QR) is kept in the app's `localStorage`.
  - It's reused only for the same user, for at most 30 minutes, and only while that factor is still unverified on the server.
  - Unverified factors whose secret isn't held on this device are removed, then one new factor is enrolled.
  - The stored copy is erased once verified and on sign-out.
- **Trade-off:** the not-yet-active TOTP secret sits in this phone's app storage for up to 30 minutes during setup. It's the same secret the QR code shows on screen.
- **Tests:** e2e `mfa-resume.spec.ts`:
  - background and foreground, a reload, and leaving and returning all keep the same secret and the same single factor, and the original secret verifies, after which nothing is stored;
  - a stale factor is cleaned up and enrolled once.

### R1b. Hardening from the slice 2–4 security review (rls-auditor)

The rls-auditor found two blocking problems; both are fixed and covered by its tests.

1. **Invitation takeover without the mailbox.**
   - **How:** with "Confirm email" off, GoTrue confirms any address at once. Separately, an anonymous iPad session can attach an email with `updateUser`, and the hook never sees that.
   - **Fixes:**
     - `enable_confirmations = true`; hosted "Confirm email" must be ON (G4).
     - A `BEFORE UPDATE` trigger on `auth.users`, `private.anonymous_stays_anonymous` (`…000200_parent_auth.sql:318–335`), refuses any email, phone, or pending change on an anonymous row.
     - Every allowlist decision uses `private.confirmed_email()` (`:47`): confirmed, not anonymous, ASCII, lowercase.
   - **Tests:** `audit_hook_and_onboarding.sql`, `audit_auth_triggers.sql`.
2. **Lockouts bypassed with GET.**
   - **How:** PostgREST runs `GET /rpc/...` read-only, so the different write each branch attempted gave the answer away, and nothing was recorded.
   - **Fixes:**
     - `redeem_pairing_code` and `verify_kid_pin` refuse in a read-only transaction.
     - They record the attempt *before* comparing and delete it on success.
     - A per-caller advisory lock closes the parallel-request race.
   - **Tests:** `audit_lockouts.sql`.

Also hardened in the same pass:
- **Allowlist emails:** stored lowercase ASCII (check plus trigger, `…000100_core_schema.sql:55–79`), so `citext` operators on the empty search_path don't matter and look-alikes like the Kelvin sign can't match.
- **Hook:** passes anonymous sign-ups only when they carry no email or phone.
- **Revoked iPads:** can no longer read even their own devices row (`devices_select`, `…000100:551`). `whoami` still says "revoked" and reveals no family data.
- **Forgetting a device:** also deletes its anonymous identity and lockout rows (`private.device_forgotten`, `…000100:333`), so it can't re-pair.
- **Routine completions:** `completed_at` is server-computed (`check_completion_kid`, `…000100:290`, no longer in the grants), and `on_date` must fall within the last week or tomorrow.
- **Time zones:** validated on every families update (`…000100:318`).
- **`cleanup_orphans` guard:** refuses to run if `public` holds tables The Deck doesn't own (`…000200:282`). That protects the shared rooster project if a push were ever pointed at it.

### R1c. From the second security review (slices 6 and 9)

**Blocking, fixed:** `delete_family` now also deletes the family's rows from GoTrue's `auth.audit_log_entries` (emails, ids, IPs), at `…000500_export_delete.sql:95`. The nightly cleanup keeps that log to 90 days (`…000200:306`).

Also fixed in the same pass:
- `delete_family` locks the family row first (`…000500:71`), so nobody can join or pair mid-delete.
- Family names are stored trimmed (a check at `…000100:37`), so the exact-name confirmation is always typeable.
- The Wave Check purge runs hourly.
- `check_completion_kid` looks up the routine within the row's own family only.

The auditor's new tests: `audit_export`, `audit_delete_edges`, `audit_checkin_retention`, `audit_auth_triggers`.

### R2. Pairing RPCs (slice 3): `…000300_device_pairing.sql`

- **`create_pairing_code(label)`** (`:10`)
  - Parent (aal2) of their own family only.
  - 8 digits from `gen_random_bytes`.
  - Stores a bcrypt hash; the plain code is returned once.
  - Lives 10 minutes; the `pairing_code_clock` trigger (`…000100:111`) clamps `created_at`/`expires_at`.
  - At most 3 open codes per family.
- **`redeem_pairing_code(code)`** (`:41`)
  - The caller must be an anonymous session that isn't paired yet.
  - Locks out after 5 wrong tries per caller, or 100 wrong tries across all callers, in 10 minutes.
  - If more than one live code matches, it refuses rather than guessing.
  - Claims the code atomically with `update … where used_at is null and expires_at > now()`.
  - Returns a status object instead of raising, so the failed attempt it records is kept.
- **`revoke_device`** (`:111`)
  - One-way: there is no path back from revoked.
  - A revoked identity can never re-pair; the iPad signs out and gets a new anonymous identity.
  - Also: `cancel_pairing_code` (`:128`) and `device_checkin` (`:145`, last seen).
- **Tests:** `004_pairing.sql`, the rls-auditor's `audit_*`, and e2e `pairing.spec.ts`.
- **Trade-offs:**
  - The 100-wrong-tries cap lets an attacker pause pairing for 10 minutes for everyone. That's acceptable because pairing is rare.
  - Odds of guessing: 10⁸ codes, at most 3 live per family, and 100 tries per 10 minutes, so about 3×10⁻⁶ per 10-minute window.

### R3. PIN RPC (slice 4): `verify_kid_pin` in `…000400_kid_profiles.sql:10`

- **Compare:** the bcrypt check happens in the database; `pin_hash` is granted to no API role (`…000100:686`; `002_rls_core.sql` asserts that `select *` on kids is refused for a device).
- **Lockout:** 5 wrong tries per kid per caller identity lock that kid for 5 minutes. Attempts persist because the function returns a status instead of raising. It is refused under GET, like pairing.
- **Reset:** a parent setting a new PIN clears the lock (`set_kid_pin`, `…000200:213`, bcrypt cost 8).
- **Tests:** `005_kid_profiles.sql`, `audit_lockouts.sql`, and e2e `picker.spec.ts`.
- **Limits (Q3, Q6, Q7):**
  - The PIN is a UI keep-out between siblings on a shared iPad, not a database boundary.
  - A 4-digit bcrypt hash can be brute-forced offline by anyone holding it, which is why it's left out of the export (Q5).

### R4. Delete family (slice 6): `delete_family` in `…000500_export_delete.sql:55`

- **Who and how:** a parent at aal2 types the exact family name; the comparison is case-sensitive.
- **What it removes:**
  - every family row, by cascade from `families`;
  - the family's `pairing_attempts` and `pin_attempts`;
  - any leftover bootstrap allowlist rows for those parents;
  - the family's `realtime.messages`;
  - its `auth.audit_log_entries`;
  - the **auth users of both parents and every paired iPad**.
- **Tests:** `006_export_delete.sql` (every row of family 1 gone, family 2 byte-identical, lockout rows), the rls-auditor's `audit_delete_family.sql` and `audit_delete_edges.sql`, and e2e `export-delete.spec.ts`.
- **Trade-offs:**
  - Either parent can delete the other parent's account (Q4).
  - To start over, the parent runs the bootstrap insert again (G8).
- **Hosted risk:** it deletes from `auth.users` and `auth.audit_log_entries` as the function owner (`postgres`). This works on the local stack; confirm on hosted at C3, because Supabase restricts the `auth` schema.

### R5. Scheduled jobs (pg_cron)

All three are `security definer` in `private`, not callable through the API, and tested in `003_parent_auth.sql`, `007_wave_check.sql`, `audit_checkin_retention.sql` and `audit_cleanup_orphans.sql`. Checked live: `cron.job` holds exactly these three.

| Job | Schedule | SQL | What it deletes |
|---|---|---|---|
| `deck-purge-checkins` | **hourly at :07** (`'7 * * * *'`, `…000600_wave_check.sql:38`) | `private.purge_old_checkins()` (`:24`) | `feelings_checkins` older than 30 days. Nothing else. |
| `deck-rollup-usage` | 03:27 daily (`:82`) | `private.rollup_old_usage()` (`:58`) | `usage_events` older than 90 days, after adding them into `usage_monthly` (counts and durations only) |
| `deck-cleanup-orphans` | 03:17 daily (`…000200:338`) | `private.cleanup_orphans()` (`…000200:272`) | Never-paired anonymous users and unlisted email users older than 24 hours; attempt rows and expired codes older than a day; auth audit log entries older than 90 days. Guarded so it refuses to run in a project with tables The Deck doesn't own. |

- **Trade-off:** pg_cron runs in UTC, so 03:17 and 03:27 are UTC.
- **Free-tier pause:** a paused project runs no jobs. The 30-day purge catches up on the first run after it resumes.

### R6. Focus modes: parents-only writes, live push (slice 10): `…000700_focus_modes.sql`

- **Write path:** `kid_focus` has **no write grants at all**. The only writers are `set_focus(kids, mode, minutes, now)` (`:16`) and `cancel_focus_switch(kids)` (`:104`). Both are SECURITY DEFINER, check `private.is_parent_of(family)` (aal2) for **every** kid, and fail the whole call if any kid isn't the caller's.
  - Duplicate kids are de-duplicated, and nulls are refused.
  - CHECKs (`…000100:465–472`) make only real states possible:
    - Everything is never timed.
    - A return needs an end time.
    - A pending end belongs to a pending switch and comes after it.
    - `pinned` holds short id strings only.
- **Timing (all on server time):** `set_focus` first works out the kid's current mode. Then it switches now, or after a 2-minute heads-up.
  - A heads-up leaves a running timed mode's timer alone, and cancelling it changes only the pending switch.
  - Where a timed switch returns to is stored per switch: `return_mode` for the current one, `pending_return_mode` for the pending one.
  - Re-timing the same mode keeps its own return.
  - Clients use `server_now()` (`…000400:51`) for the offset, so a wrong iPad clock can't stretch or skip a mode.
- **Realtime:** nothing uses `postgres_changes`.
  - Triggers (`:136–187`) call `realtime.send()` with a payload-free `{table}` on private topics:
    - `family:<id>`: what the iPads may know about;
    - `parents:<id>`: parents-only events, so iPads don't even learn those changed;
    - `device:<auth uid>`: `revoked`.
  - The RLS policy `deck_private_topics` on `realtime.messages` (`:191`) is select-only. It admits members to their family topic (canonical UUID spelling only), parents to their parents topic, and an anonymous iPad to its own device topic. There's no insert policy, so clients can't broadcast.
  - `delete_family` removes the family's message rows.
  - Not signalled: `routine_completions`, `feelings_checkins`, `reset_plans`, `usage_events`. The parent's Today picks those up on its 30 s or foreground refresh.
- **Clients:** they refetch through RLS on every message, on every (re)subscribe, when they come back to the foreground, and on a fallback timer (iPad 60 s, phone 30 s). The effective mode is computed from the row's timestamps, so a reload can't escape a mode and offline keeps the last one. Refreshes apply in start order, so a stale one can never land last (X2, fixed).
- **Tests:**
  - `008_focus.sql`.
  - rls-auditor `audit_focus_realtime.sql`: a 7-role refusal matrix, no partial updates, edge inputs, the real-policy topic matrix with about 30 malformed topics, signal coverage and content, delete cleanup, and the state checks.
  - e2e: `focus-modes.spec.ts`, plus kid-ux-tester's `slice10-11-*.spec.ts` (live push in about 0.8 s, heads-up, timed ends, Lights out, fail closed).
- **Accepted (non-blocking):** an iPad revoked *while connected* keeps hearing payload-free "changed" signals until its access token expires (at most `jwt_expiry` = 1 hour). A fresh join is refused, and every data read is refused at once. JWT expiry is project-wide in Supabase (not per anonymous user), so tightening this shortens parent tokens too (Q13).

### R7. The write policy on `kid_focus`: parents only (slice 10)

- **What the plan asked for:** devices are read-only for mode settings; only parents change them.
- **Enforced three ways:**
  1. **Grants:** `kid_focus` gets `select` only (`…000100_core_schema.sql:722`). No `insert`, `update` or `delete` for any API role, so any direct write fails with `42501`, parent or device.
  2. **Writers:** `set_focus` and `cancel_focus_switch` (R6) check `is_parent_of` (aal2, not anonymous) for every kid id. Devices, aal1 parents, other families' parents, revoked iPads and unlisted users are refused.
  3. **No delete policy:** rows are created by the `kids_created` trigger (`…000200:251`) and go only with their kid.
- **Policies still present:** the RLS policies `kid_focus_insert` and `kid_focus_update` (`…000100:638–641`, parents only) remain. They are inert without grants; they matter only if someone later adds a grant. The server stamps `updated_by` and `updated_at` (`kid_focus_stamp`, `:475`).
- **Tests:**
  - `002_rls_core.sql:114–117`: a device can't update, insert or `set_focus`. Further rows there cover aal1 and the other family.
  - `008_focus.sql:11–20`: device, aal1 and cross-family callers are refused, and mixing in another family's kid fails the whole call.
  - `audit_focus_realtime.sql`: the 7-role matrix.

### R8. Onboarding: the allowlist hook and membership RPCs (slice 2): `…000200_parent_auth.sql`

Not marked in the plan, but it is the front door. These are new write paths.
- **`private.hook_before_user_created`** (`:14`)
  - Lets an anonymous sign-up through only when it has no email or phone.
  - Otherwise it requires an exact ASCII-lowercase allowlist match and returns 403 for anything else.
  - It is callable only by `supabase_auth_admin`.
- **`whoami`** (`:61`): reveals only the caller's own role. Before aal2 it says nothing about families.
- **`create_family`** (`:126`): consumes a bootstrap row (`family_id is null`) atomically, then seeds `family_modules` from the catalog. Bootstrap rows can't be created through the API (`002_rls_core.sql`).
- **`my_invites` and `accept_invite`** (`:167`, `:181`): joining is explicit, needs aal2 and a confirmed email, and allows one family per person (`parents.user_id unique`).
- **`allowlist_insert`** (`…000100:544`): any parent can list any email for their own family. A listed email passes the hook and gets an auth user, but has zero access until it joins.
- **Tests:** `003_parent_auth.sql`, `audit_hook_and_onboarding.sql`, `audit_unlisted_user.sql` (zero access on every table).

### R9. What a paired iPad can read and write

Not marked in the plan; the brief says to pause on new write paths.
- **Reads (RLS, own family only):**
  - `families` (name, time zone);
  - `kids` without `pin_hash`;
  - `routines`, `routine_completions`, `reset_plans`, `family_modules`, `kid_focus`, `module_catalog`;
  - kid-visible `events`;
  - its own `devices` row while unrevoked;
  - `current_checkin(kid)` (`…000600:5`): today's latest check-in for one kid.
- **Can't read:** `parents`, the allowlist, pairing codes, `feelings_checkins`, `usage_events`, `usage_monthly`.
- **Writes:**
  - `save_routine_progress` and `save_reset_plan` (`…000400:59`, `:87`): security invoker, so RLS and column grants apply.
  - Inserts into `feelings_checkins` and `usage_events`.
  - `device_checkin`.
  - Composite `(kid_id, family_id)` foreign keys stop any row pointing at another family's kid or routine.
- **Trade-offs (Q3):**
  - The database can't tell which kid is holding the iPad. A device can therefore write a check-in or routine progress for any kid in its family, and `current_checkin` returns a sibling's same-day feeling to a determined sibling with dev tools.
  - The iPad's offline cache (`localStorage` key `deck.snapshot.v2`) holds every kid's current check-in. Unpairing clears it (`pairing.spec.ts`).
  - Inserts aren't rate-limited, so a device could flood `usage_events` or `feelings_checkins` for its own family. Accepted: there's no cross-family effect.
- **Tests:** `002_rls_core.sql` (device block), `audit_device_capabilities.sql`, `audit_cross_family.sql`, `audit_pairing_feelings_schema.sql`.

### R10. Grants baseline: "auto-expose" off, everywhere

- **Local matches hosted:**
  - `…000000_foundation.sql:10–14` revokes the CLI's default table, sequence and function privileges, plus EXECUTE to PUBLIC.
  - Every table and column grant is explicit (`…000100:670–725`). `anon` gets nothing.
  - Every RPC revokes from `public, anon` and grants to `authenticated` only.
- **Tests:** `001_grants.sql` is a golden snapshot of every grant. `supabase/checks/grants.sql` is the same query, for G2 against hosted. `audit_definer_and_surface.sql` lists every definer function and the whole API surface.

### R11. Browser surface

- **CSP:** a strict CSP meta tag is added at build (`vite.config.ts:9–33`): own origin plus the one Supabase origin.
  - Dev (`netlify dev`, Vite) has no CSP and no service worker, so neither is exercised by Playwright or by the device URL on 8894.
  - `netlify.toml` sends Referrer-Policy, nosniff and Permissions-Policy, and (since Gate 1, X13) `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. A meta CSP can't set `frame-ancestors`, so these headers are what stop the parent screens (including Delete family) being framed.
- **Secrets:** only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the browser (`src/lib/supabase.ts`).

## 3. Deviations

| # | Deviation | From | Why | Agreed |
|---|---|---|---|---|
| D1 | Parent sign-in is an **email one-time code plus TOTP MFA**, not Apple/Google or email + passkey | `CLAUDE.md` security req. 1 | Magic links open in Safari instead of the installed PWA (separate storage on iOS). Apple sign-in needs a paid developer account. Email code + TOTP gives 2FA without leaving the app. | Parent, before slice 0 |
| D2 | Hosted parent sign-in emails may need a **transactional email provider** (a third party), limited to parent email addresses and sign-in codes | `CLAUDE.md` security req. 7 | Supabase's built-in sender may deliver only to members of the Supabase org and is heavily rate-limited. Parent B must never be added to the org to get around this. No kid data goes to the provider. See Gate 2 step G3. | Parent, before slice 0 |
| D3 | The Deck's tables are **unprefixed** (`families`, `kids`, …) | Root `CLAUDE.md` "Database" rules (prefix per project, shared project) | The Deck has its own Supabase project (brief, "Architecture decisions"), so prefixes add nothing. The root `CLAUDE.md` gets a Deck exception at Gate 2. | Parent, before slice 0 |
| D4 | Reviewer agents were run **once per group of slices** (2–4, 5–9, 10–11), not after every slice | Plan, "Working rules" | Auditing migrations that were still changing would have meant reviewing a moving target. Every group's blocking findings were fixed before moving on (PROGRESS.md). Slices 5–8 had UI and some SQL for several slices before review | **Confirm** |
| D5 | **Extra tables:** `parent_allowlist` (sign-in gate), `pairing_attempts` and `pin_attempts` (lockouts; RLS on, no grants), `module_catalog` (global registry), `usage_monthly` (90-day rollup) | `CLAUDE.md` data model and plan slice 1 list | Each backs a requirement the model doesn't cover: the allowlist, lockouts, data-driven navigation, usage retention. All have RLS and are in the export or listed under "omitted" | **Confirm** |
| D5b | **Columns differ from the starting model:**<br>• `kids.accent`, `sort_order`, generated `has_pin`<br>• `devices.last_seen_at`<br>• `pairing_codes.label`, `created_by`, `used_by_device`<br>• `routines.slot` + `starts_at` (instead of `time_of_day`); steps are `{id,text,icon}` with stable ids<br>• `events.on_date` and `repeats_yearly`<br>• `feelings_checkins.family_id` and `moment`<br>• `kid_focus`: `since`, `ends_at`, `return_mode`, `pending_*`, `pinned`, `updated_by`<br>• `families.timezone` | `CLAUDE.md` data model ("starting point") | Needed for the features as built. Every family-owned row carries `family_id` directly | Builder |
| D6 | **Lights out shows only "I need to breathe"**; Wave Check is offered after the breaths, and `/wave` stays reachable | `CLAUDE.md` "Feelings is never locked out" versus "the only control is I need to breathe" | The brief contradicts itself; this keeps both true (Q8) | **Confirm (Q8)** |
| D7 | **Mascot transitions are stills, not a Rive scene system.**<br>• The heads-up is a rooster sticker, a timer icon and a draining bar.<br>• Lights out is a tucked-in turtle sticker under stars.<br>• There is no Session paddle-out, no Last Run roll-in, no yawn, no morning crow or curtains, and no animated Fluent burst (the celebration is a CSS burst). | `CLAUDE.md` "Mascot transitions" | No licensed Rive or Lottie files were vetted, and the mascots aren't commissioned yet. Triggers already come from the focus state, so a scene system can drop in later | **Confirm** |
| D8 | **Pinned focus is schema-only:** `kid_focus.pinned` exists, is checked, and has no writer or UI | `CLAUDE.md` Focus modes | Session content is Phase 2; there's nothing to pin yet | Builder |
| D9 | **Mode schedules** (for example, school days 4:00–4:30 Learning) are not built | `CLAUDE.md` Focus modes | The plan defers Routine, Wind-down and schedules to Phase 2 | Plan |
| D10 | **New events default to "kids see it"** (`events.visible_to_kids default true`, `…000100:357`; editor `Dates.tsx:158`) | Brief is silent | It matches the main use (countdowns). The safer default is parents-only (Q9) | **Confirm (Q9)** |
| D11 | The dimmed "Later" row from `iPadGromZoneFocus.html` is **not built** | Mockup | `CLAUDE.md` says not to build it. Listed for completeness | Brief |
| D12 | **The parent phone's ground follows iOS Light/Dark** (`usePreferredGround`), with no in-app picker | `CLAUDE.md` "parents' phones keep their own choice locally" | The iOS setting *is* the phone's own choice; an in-app override is a small add if wanted | Builder |
| D13 | **The iPad setup guide** (Guided Access, Screen Time) is in `SETUP.md` §"Setting up a kid's iPad", not in the app | `CLAUDE.md` "the setup guide must walk the parent through…" | It's a one-off parent task. Could be mirrored in Back Office → Devices (Q16) | **Confirm** |
| D14 | **The export's CSVs** are `events`, `kids`, `routines`, `routine_progress` and `usage`. Chores, money ledger and learning progress don't exist yet; there are no uploaded files | `CLAUDE.md` req. 9 | Phase 1 tables only. JSON has everything; feelings are in JSON only | Builder |

## 4. Gaps

Defects first, then Phase 1 items that are missing or only partly done.

| # | Gap | Where | Impact | Suggested fix |
|---|---|---|---|---|
| X1 | **Fixed (Gate 1).** Kid taps over plain HTTP: `crypto.randomUUID` is missing in non-secure Safari contexts. | `src/lib/id.ts` (`newId`, a `getRandomValues` fallback); `src/kid/usage.ts` (logging can never throw) | Was blocking the device test | e2e `gate1-fixes.spec.ts` runs on the Tailscale http origin (`isSecureContext` false): the Wave Check tile opens, with no page errors |
| X2 | **Fixed (Gate 1).** A stale refetch could overwrite a newer mode after a network drop. | `src/kid/store.tsx`: `refreshSeq`. Only the most recently *started* refresh may apply; older ones are dropped | Was: wrong mode for up to 60 s after Wi-Fi blips | `focus-modes.spec.ts` passed 5 of 5 runs after the fix (it was failing 3 of 4) |
| X3 | **Fixed (Gate 1).** Back Office → **Modules**: a switch per kid-facing module, with Wave Check shown as "Always on" (the trigger refuses to switch it off anyway) | `src/routes/parent/office/ModulesSection.tsx` | — | e2e `gate1-fixes.spec.ts`: Tour Dates off, so the tile is gone and `/dates` bounces home |
| X4 | **Fixed (Gate 1).** After a routine finishes, the kid home shows a "How's your wave?" card ("How was your day?" at bedtime) until a check-in that day | `src/kid/KidHome.tsx` (`wave-prompt`) | — | e2e `gate1-fixes.spec.ts` |
| X5 | **The mascots can't be named.** "The rooster" and "the turtle" are hardcoded in copy and speech | `src/kid/**` | The brief says the kids name both and every line uses the names. Not on the Phase 1 bullet list, but the Phase 1 screens already speak about them | A `families.settings`/`family_modules` field and a "name our friends" moment (Q11) |
| X6 | **Fixed (Gate 1).** Back Office → **About**: credits for Fluent Emoji (MIT), the fonts, Kenney (when used), and our own icons | `src/routes/parent/office/AboutSection.tsx` | — | e2e `gate1-fixes.spec.ts` |
| X7 | **No automated test of cold-launch offline.** The service worker only registers in `PROD`; Playwright and the device URL run Vite dev | `src/main.tsx:22` | "Kid screens never show a blank screen offline" is proven only for an already-open app (`slice5-9-kid` offline) | Device step B1. Later, a Playwright project against `vite preview` |
| X8 | **A third kid is untested in the UI.** pgTAP covers more than two kids (`002_rls_core.sql` adds Kid D); no e2e has three on the picker, Today or the Everyone switcher | e2e | The brief's "a third profile with no code change" is unproven visually | Device step P4 adds Kid C |
| X9 | **The heads-up isn't spoken automatically**, only by the speaker button. For the pre-reader, the brief says the rooster "says" it | `FocusLayer.tsx:126` | A non-reader may miss a silent banner | Auto-speak once per heads-up if a voice has been unlocked (Q18) |
| X10 | **The session summary counts opens and finishes only** ("anything they missed" needs Phase 2 items) | `Today.tsx:288` | Fine for Phase 1 placeholders | Phase 2 |
| X11 | **No per-device sound or read-aloud off switch**, and no bedtime quiet mode. Automatic speech plays after each routine step | `useStepDone.ts`, `speech.ts` | The brief's "parent can turn sounds off per device" | A device setting next to the ground picker (Phase 2 unless you want it now) |
| X12 | **Fixed (Gate 1).** STATUS.md and PROGRESS.md updated | `STATUS.md`, `PROGRESS.md` | — | — |
| X13 | **Fixed (Gate 1).** `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` headers | `netlify.toml` | — | Check on production at C5 (Netlify serves them; netlify dev too) |

## 5. Open questions

| # | Question | Default taken |
|---|---|---|
| Q1 | Emoji style: 3D or Flat | **Decided (parent): 3D.** Flat deleted; 39 WebP files vendored |
| Q2 | How to close public sign-ups when "Allow new users to sign up" off also blocks anonymous (iPad) sign-ins | **Decided (parent):** the switch stays on; a `before_user_created` hook enforces the allowlist; a nightly job removes unpaired anonymous users and unlisted users. Fallback (no hook): an unlisted user has zero access to every table (`audit_unlisted_user.sql`) and is removed by the job. |
| Q3 | Kid PIN on a shared iPad | Both kids share one device identity, so the database can't tell them apart. The PIN keeps a sibling out of the other's profile in the UI only, which is what CLAUDE.md req. 4 asks for. A determined sibling with dev tools could still read the other kid's routine data and **today's check-in** (`current_checkin`), and write for them (R9). Accepted. |
| Q4 | Delete family also deletes both parents' accounts | Default: yes, a full wipe, and either parent can do it without the other's confirmation. To start over, run the bootstrap allowlist insert again (G8). |
| Q5 | Export: PIN hashes left out | Default: left out. A 4-digit bcrypt hash is effectively the PIN, and the export lives on a phone. After a rebuild, PINs are set again. |
| Q6 | A PIN-protected profile can't be opened while the iPad is offline (the PIN is checked on the server) | Default: keep it (fail closed). The open profile stays open offline, and kids without a PIN work offline. |
| Q7 | A sibling's wrong guesses lock the PIN owner out of their profile on that iPad for 5 minutes | Default: accepted, because the lock is short. The message warns at 2 tries left, and a parent resetting the PIN clears the lock. |
| Q8 | Lights out: the brief says "only control is I need to breathe" and also "a kid can always reach check-in and breathing" | Default: the bedtime screen shows only "I need to breathe". After the breaths it offers "Back to bed" or "Tell how I feel" (Wave Check). `/wave`, `/breathe` and the reset plan stay reachable in Lights out; everything else returns to the bedtime screen. |
| Q9 | Default visibility for a new event | Default: **kids see it**. The alternative is parents-only by default, so a kid never sees an event by accident (D10). **Gate 1: superseded by Phase 1.5** (calendar kid defaults and the kid layer). |
| Q10 | MFA recovery if a parent loses their authenticator | Default: none in the app. The other parent can't reset it. Recovery: delete the factor in the hosted dashboard (Authentication → Users → the user → MFA). Optionally allow enrolling a second TOTP factor (`max_enrolled_factors = 10` already). |
| Q11 | Mascot names (X5) | Default: deferred to Phase 2, stored per family, with the kids' "name our friends" moment on first launch. |
| Q12 | A Back Office module on/off screen (X3) | **Superseded: built at Gate 1** (X3, Back Office → Modules). The "deferred" default no longer applies. |
| Q13 | JWT expiry (project-wide) | Default: 3600 s. Shorter (for example 900 s) narrows the revoked-while-connected window (R6) at the cost of more refreshes. |
| Q14 | Anti-framing headers (X13) | **Superseded: added at Gate 1** (X13, `netlify.toml`). Checked on production at C5. |
| Q15 | Device testing over HTTP | Default: fix X1 first, then run Part A of the device list over `http://100.68.253.7:8894`. Part B (installed PWA offline, share sheet, CSP) needs HTTPS through `tailscale serve` (section 6). |
| Q16 | Mirror the iPad setup guide (Guided Access, Screen Time) in Back Office → Devices | Default: SETUP.md only (D13). |
| Q17 | A Wave Check prompt at the end of routines (X4) | **Superseded: built at Gate 1** (X4, the "How's your wave?" card on the kid home). Phase 1.5 replaces it with check-in moments and the Wave Check routine step. |
| Q18 | Auto-speak the heads-up (X9) | Default: tap to hear. Suggested: auto-speak for pre-readers. **Gate 1: moved into Phase 1.5** (slice 4). |

## 6. Device test list

**Setup (Mac).** The stack is running. Then `npm run env:local` and `npm run dev`.
- **App:** `http://100.68.253.7:8894`. **Mailpit** (email codes): `http://100.68.253.7:54324`.
- **Sign-in:** `parent-a@example.test` is bootstrap-allowlisted by `seed.sql` and not used yet (checked). Use placeholder names only: Family A, Parent A, Kid A, Kid B, Kid C.
- **To start over after F2:**
  ```bash
  docker exec -i supabase_db_deck psql -U postgres -c "insert into public.parent_allowlist (email, family_id) values ('parent-a@example.test', null)"
  ```

**About plain HTTP.** On `http://100.68.253.7`, Safari treats the page as insecure, so there is no service worker, no `navigator.share` and no `crypto.randomUUID`.
- X1 is fixed, so Part A works over plain http.
- Part B needs HTTPS.

### Part A: over `http://100.68.253.7:8894`

**iPhone: parent**
1. **P1. Sign in from the installed app.**
   1. Safari → the app URL → Share → **Add to Home Screen**. Open it from the icon.
   2. I'm a grown-up → `parent-a@example.test`. Read the code in Mailpit (Safari or the Mac) and type it, or use the keyboard's one-time-code suggestion.
   3. Enroll TOTP with **Add to Passwords**, type the 6-digit code, then create **Family A** / **Parent A**.
   4. Check: no link opened Safari; the email has no link; you land on Today inside the installed app.
2. **P2. Session storage.** Swipe the app away and reopen it: still signed in. Sign out, then sign in again: it asks for the TOTP code, not enrollment. Safari (not the installed app) is still signed out.
3. **P3. Second parent.**
   1. Back Office → Grown-ups: add `parent-b@example.test`.
   2. On the iPad's **Safari** (not the installed app; its storage is separate), sign in as Parent B, enroll TOTP, then Join.
   3. Check: both see the same kids and Today.
4. **P4. Kids.** Add Kid A (reader, PIN 1234), Kid B (pre-reader, no PIN), and **Kid C** (X8). Check the picker, the Today cards and Everyone with three kids.
5. **P5. Content.**
   - Routines → the Dawn Patrol template, with the start time set a few minutes ago.
   - Tour Dates → Beach trip in 12 days (kids see it), plus one parents-only event.

**iPad: kids**
1. **K1. Install and pair.** Safari → app URL → Add to Home Screen → open from the icon → Set up this iPad. On the phone: Devices → "Kitchen iPad" → Get a code. Type it on the iPad (numeric keypad) → Who's riding?
2. **K2. Reboot.** Power the iPad off and on, then open from the icon: Who's riding? appears with no re-pairing. Devices on the phone shows "last seen".
3. **K3. PIN.**
   - Tap Kid A, then enter wrong PINs: a gentle retry, and a warning at 2 tries left. The right PIN opens the profile.
   - Kid B opens with no PIN.
   - From Kid B there is no way into Kid A.
4. **K4. Real touch.**
   - Every tile reacts on the first tap with an instant lift or ring.
   - No double-tap zoom, no long-press callout or text selection on kid screens.
   - Tap near the edges of the 80pt targets (pre-reader).
   - Rotate the iPad: nothing scrolls on home.
5. **K5. Speech.**
   - The first speaker tap after launch speaks (iOS needs a gesture).
   - Wave Check says "Choppy. Upset or mad?". Pre-reader tile labels speak on tap. Routine steps say "Nice! Next: …".
   - Try it with the ring/silent switch on and off.
   - Optional: download an Enhanced voice (SETUP.md).
6. **K6. Routine.** Kid B runs Dawn Patrol: one step per screen, I did it!, Oops not yet (undo), then the celebration. The phone's Today shows the progress within about 30 s.
7. **K7. Tour Dates.** "12 sleeps · Beach trip". The parents-only event is absent.
8. **K8. Wave Check.**
   - Open it from the home tile and from the frame button.
   - Choppy → size → thanks → breathe → reset plan.
   - The phone's Today shows the check-in and its history; the iPad shows no history.

**Focus modes: both devices.** These are the parts automation can't prove on real radios.
1. **K9. Heads-up.**
   - Phone: Kid A → Change mode… → Lights out, Switch now *off*.
   - Within a few seconds the iPad shows the rooster and "Two more minutes, then it's lights out time." with a draining bar. At 0:00 it goes to Lights out with no tap.
   - Kid B stays in Everything.
2. **K10. No escape.** Swipe-close and reopen the app: still Lights out. Try `/kid/<id>/routines` through any route: it falls back to bed.
3. **K11. Airplane mode.**
   1. Turn airplane mode on (Control Center).
   2. On the phone, switch Kid A to Everything (Switch now): the iPad stays on Lights out.
   3. Turn airplane mode off: the iPad should change within about 60 s.
   4. It should land in the newest mode and stay there (X2 is fixed). If it shows an older mode, even briefly, note it.
4. **K12. Sleep.**
   1. Lock the iPad for 5 or more minutes (once overnight, too).
   2. Switch modes on the phone while it sleeps.
   3. Wake it and reopen: the right mode within a few seconds (foreground refetch).
   4. Leave a timed Session running across a sleep: it still ends on time.
5. **K13. Session.**
   1. Session, 10 min, Switch now: the time-left chip appears, tiles outside Session are hidden (not greyed), and Wave Check is still there.
   2. Start Session → the placeholder.
   3. Let it run out, or shorten it in SQL as the e2e does: SHRED! at normal volume, then back to Grom Zone by itself.
6. **K14. Lights out on a real screen.**
   - Only "I need to breathe" shows. After the breaths: Back to bed / Tell how I feel (Q8).
   - In a dark room at night: brightness is comfortable and nothing sounds after breathing.
   - The heads-up banner and the time-left chip clear the home indicator in both orientations.
7. **K15. Reduce Motion** (Settings → Accessibility → Motion):
   - the ground change is instant;
   - there's no burst (a still sparkle instead);
   - the balloon stays still;
   - the heads-up bar doesn't animate.
8. **K16. Grounds.** On the phone, Devices → Kitchen iPad → Auto / Day / Night / Follow iPad.
   - With Follow iPad, toggle Dark Mode in Control Center.
   - Last Run and Lights out stay night under every setting.
   - Under Auto, day starts at Dawn Patrol.
9. **K17. Unpair.** Phone: Devices → Unpair. The iPad shows Unpaired at once, or on the next tap. Reopen: no kid data left. Pair again works.
10. **K18. Guided Access** (SETUP.md §2).
    - Start it on The Deck.
    - The Home gesture, app switcher and Control Center are blocked.
    - Wave Check and breathing still work.
    - Lights out still applies when the phone switches the mode during Guided Access.
    - End it with the passcode.
11. **K19. Screen Time** (SETUP.md §3). The Deck is Always Allowed. During Downtime, The Deck still opens and Lights out still works.

**iPhone: data**
1. **F1. Export.**
   1. Back Office → Your data → Export all family data.
   2. Over HTTP, only the download link appears: Safari downloads the file. Open the zip in Files: `export.json`, five CSVs, `README.txt`.
   3. Open `events.csv` in Numbers.
   4. Over HTTPS (Part B), **Save or share…** opens the iOS share sheet → Save to Files.
2. **F2. Delete** (do this last). Delete family…:
   - a lower-case name stays disabled;
   - the exact name deletes;
   - both phones land on Welcome;
   - the iPad shows Unpaired.

### Part B: HTTPS and the production build

Covers what dev mode can't: the service worker, the CSP and the share sheet.
1. **Setup.**
   1. In the Tailscale admin, turn on MagicDNS and HTTPS certificates.
   2. Run `tailscale serve --bg --https=443 http://127.0.0.1:3997` and `tailscale serve --bg --https=8443 http://127.0.0.1:54321`.
   3. In `.env.local`, set `VITE_SUPABASE_URL=https://<mac>.<tailnet>.ts.net:8443`. An `http` API would be blocked as mixed content.
   4. Stop `npm run dev` (it holds port 3997), then run `npm run build && npx vite preview`.
   5. Open `https://<mac>.<tailnet>.ts.net`, add it to the Home Screen and pair again (it's a new origin).
   6. **Afterwards:** `tailscale serve reset`, then `npm run env:local`.
2. **B1. Cold launch offline.**
   1. Open the app online once, so the service worker installs.
   2. Turn airplane mode on, force-quit, relaunch.
   3. Expect the shell, the last routine and the countdowns: no spinner, no blank screen.
   4. Tick a step, turn airplane mode off: the phone's Today shows the step.
3. **B2. Share sheet.** Repeat F1 with **Save or share…**.
4. **B3. CSP.** Connect Safari Web Inspector (Mac → Develop → the iPad): no CSP violations, and requests go only to the app origin and `:8443`.
5. **B4. Update.** Rebuild after any visible change: the installed app picks it up on the next launch.

## 7. Go-live checklist (Gate 2)

The parent does G1–G11 by hand. Claude Code does C1–C8 only after approval. X1, X2 and X13 are already fixed.

**Updated at Gate 1:** this checklist now runs once, for Phase 1 and Phase 1.5 together, after the Phase 1.5 Gate 2. The parent runs the link, push and deploy commands in C2 and C4; Claude Code prints each command and verifies the result.

**Parent: create the project**

- **G0. Create the hosted project.**
  - Same Supabase account and organization; the free tier's second project.
  - Name it for the household (for example "household"; the display name can change later).
  - Pick the closest region.
  - Save the DB password in your password manager; `supabase link` will ask for it. Never paste it into chat.

**Parent: in the hosted Supabase dashboard and Netlify**

- **G1. Sign-ups closed to the public through the allowlist hook.**
  1. Leave **"Allow new users to sign up" ON**. Turning it off also blocks anonymous sign-ins, which iPads need (tested: `422 signup_disabled`).
  2. Leave **"Allow anonymous sign-ins" ON**.
  3. Under Auth → Hooks, enable **Before User Created** → Postgres function `private.hook_before_user_created`. This is possible only after C2, because the function arrives with the migrations.
  4. **Check that the hook works on the free plan:** with the hook on, request a code for an unlisted email. Expect a 403 ("not on the list") and no new row in Authentication → Users.
  5. If the hook isn't available on the free plan, the fallback still holds. An unlisted user has zero access (`audit_unlisted_user.sql`), and the nightly job removes them after 24 hours.
- **G2. "Automatically expose new tables" stays off.** Every migration GRANTs explicitly, and the local stack revokes the same default privileges, so nothing works locally that would break when hosted. **Verified item:** after `db push`, run `supabase/checks/grants.sql` in the hosted SQL editor and compare with `001_grants.sql`.
- **G3. Email delivery for sign-in codes.**
  1. Check whether the built-in sender works for a non-org address: add a test address to the allowlist, request a code, and see whether it arrives. Also note the hourly rate limit shown under Auth → Rate Limits.
  2. If it doesn't, pick a transactional provider that can send from `steppinghen.com` (SPF/DKIM on the domain). Options to compare: Resend, Postmark, Amazon SES, Mailgun. Enter SMTP settings under Auth → SMTP. The provider sees parent email addresses and codes only.
- **G4. Auth settings** (to match `supabase/config.toml`; see R1 for line numbers):
  - **Confirm email: ON.** Required: with it off, an invitation could be claimed without the mailbox (R1b).
  - Email templates **Magic Link** and **Confirm signup**: subject "Your code for The Deck", with the body from `supabase/templates/otp.html`. It shows `{{ .Token }}` only, with **no link** (remove `{{ .ConfirmationURL }}`).
  - Email OTP length **6**; OTP expiry **600 s** (10 minutes). Keep the hosted minimum interval between sends (60 s); the local 1 s is for tests.
  - Site URL: the production app URL. No redirect URLs are needed, because nothing in the flow uses links.
  - MFA: **TOTP enroll and verify on**. Phone MFA stays off.
  - Anonymous sign-ins: **on**. **Manual linking: off.**
  - JWT expiry: 3600 s unless Q13 says otherwise. **Don't enable** session time-box or inactivity timeouts; iPads would be signed out and need re-pairing.
  - Rate limits: leave the defaults (30 sign-ins per 5 minutes per IP, 30 anonymous per hour per IP). The email send limit depends on G3.
  - Refresh token rotation on (the default).
- **G4b. Realtime:** in Project Settings → Realtime, turn **off "Allow public access"** (private channels only). The app only uses private channels, authorized by `deck_private_topics`.
- **G4c. Auth audit logs:** these record emails and IPs. Leave them in the database (then `delete_family` and the 90-day cleanup cover them), or turn off "Write auth audit logs to the database" if the setting is offered. Either way, no third party is involved.
- **G5. Free tier: pick one.**
  - **Scheduled keep-alive ping:** free projects pause after about 7 days with no API activity, for example during a family trip. A paused project also runs no pg_cron jobs.
  - **Supabase Pro:** no pausing, plus daily backups.
  - On the free tier, **the family export is the only backup**. Download one regularly.
- **G6. Netlify env vars** on `rooster-deck` (Site configuration → Environment variables, scope Builds): `VITE_SUPABASE_URL` = `https://<ref>.supabase.co` and `VITE_SUPABASE_ANON_KEY` = the anon or publishable key. Nothing else ships to the browser. Set them **before the first build**: the CSP bakes in the URL at build time.
- **G7. Root `CLAUDE.md`:** approve the Deck exception: own Supabase project ref, unprefixed tables, and account checks run from `deck/` against `deck/supabase/.temp/project-ref`. Fill in the `rooster-deck` site ID after C4.
- **G8. Bootstrap Parent A** (one-off SQL, run by the parent in the hosted SQL editor after `db push`):
  ```sql
  insert into public.parent_allowlist (email, family_id) values ('<your email>', null);
  ```
  Then sign in on the phone with that email. The row is consumed when the family is created. No real email ever goes into code or migrations.
- **G9. Permissions for Claude Code.** `.claude/settings.json` denies `supabase link`, `db push`, `--linked`, and `netlify deploy`/`link`. **Decided at Gate 1: you run C2 and C4 yourself;** the deny list stays as it is. Claude Code won't change it.
- **G10. Pre-deploy fixes:** X1, X2 and X13 are done (Gate 1). Confirm the remaining open gaps in section 4 can wait.
- **G11. After C5:** pair the real iPad, enter the real family data in the live app only, and start Guided Access and Screen Time (SETUP.md).

**Claude Code, after approval**

- **C1. Account checks.** Run the root `CLAUDE.md` account checks, with the Deck's own project ref as the expected value (G7). Stop on any mismatch.
- **C2. Link and push.**
  1. From `deck/` only: `supabase link --project-ref <deck ref>`; the parent types the DB password.
  2. Show the SQL, then `supabase db push`.
  3. **Never use `--include-seed`.** `seed.sql` holds the `tests` helpers and the `parent-a@example.test` bootstrap row.
  4. Never touch the repo-root link (the shared rooster project).
- **C3. Post-push checks (read-only SQL in the hosted editor):**
  - `supabase/checks/grants.sql` matches `001_grants.sql`.
  - `select jobname, schedule from cron.job` lists exactly the 3 jobs.
  - The trigger `deck_anonymous_stays_anonymous` exists on `auth.users`, and `deck_private_topics` exists on `realtime.messages`.
  - One `delete_family` dry run on a throwaway family proves the `auth` deletes work hosted (R4).
  - The pgTAP suite **can't** run against hosted: it depends on seed-only helpers, and `--linked` is denied.
- **C4. Deploy.**
  - Confirm the Netlify team is `rooster-nc` (settled at Gate 1: it is the steppinghen.nc account's only team, display name "Rooster"; `rooster-portfolio` is in it).
  - Create `rooster-deck` and link `deck/` only.
  - Deploy from `deck/` (never the repo root).
  - Record the site ID in the root table.
- **C5. Production acceptance.**
  - The URL loads publicly (no 401).
  - The page source has a CSP meta tag with the hosted origin.
  - Rerun the Phase 1 acceptance checks A1–A6 on the real phone and iPad (G1 step 4 included).
- **C6.** Turn on the hook (G1 step 3) if the parent hasn't yet, then repeat G1 step 4.
- **C7.** Download a first family export (G5).
- **C8.** Update `STATUS.md` and `PROGRESS.md` (X12).

---

# Phase 1.5 review packet

Added on top of Phase 1's. Branch `deck/phase-1.5`.

## 1.5-0. Slice 0 brief audit (answer before slice 1)

`CLAUDE.md` and `docs/` read against `PHASE15_PLAN.md` and the 76 frames in `design/canvas/`. Each item has the default I'll take if you don't change it. **Items marked (schema) need a data-model change the brief doesn't list**, which the plan says is a stop; I need a yes or no on each before slice 1.

### Parent's answers (2026-10-02)

Every default above is taken, except:

| # | Answer |
|---|---|
| A4 | **Coop TV is a module screen inside the Deck, never a link out.** A full-screen view of the Coop TV app served from the Deck's own origin (`/tv`, through a Netlify rewrite, so Safari doesn't partition its storage), with the Deck's dock underneath and Coop TV active. Focus modes and access holds close the view after the heads-up and hide the dock item. In 1.5 the view shows Coop TV's own profile picker. Anything that changes the Coop TV app itself is outside `rooster/deck`: planned in "Coop TV view" below, not built. Device test added: open Coop TV from the dock under Guided Access and come back. **Direction (not 1.5):** Coop TV becomes a full Deck module in the Deck's look, skips its profile picker because the Deck knows the kid, and its settings move into Back Office. |
| A59 | **Show and speak Mara and Costa in 1.5.** Dog names are stored in `families.settings` (defaults Mara and Costa), editable by a parent later. The rooster and turtle stay unnamed until Phase 2 (X5). |
| A36, A37, A39, A40, A41, A43 | **Approved**, plus the dog-names key in `families.settings` (A59). |
| A14 | **The display's per-calendar mode decides** (Title, Busy or Not here). **Any event hidden from kids shows as Busy** on a locked display, even when its calendar is Title. Filtered in the database. (A15 follows: hidden is Busy, not "Private".) |
| A48 | ~~Costa's rider sticker will be drawn on the canvas and sent as an updated frame.~~ **Resolved:** `design/canvas/R6DogRider.dc.html` has both riders, "Sticker — Dog rider" (Mara) and "Sticker — Dog rider (Costa)". The export (slice 3) maps both labels, so the missing-art flag is cleared. |
| Gate 2 | `supabase functions deploy` and `supabase secrets set` are **added to the deny list now**; the parent runs them at Gate 2. |

### Coop TV view (A4): plan and what blocks the later move

Built in slice 14 with the dock picker (Deck side only):
- `/tv/*` is a Netlify proxy rewrite (`status = 200`) to the Coop TV site; locally, Vite proxies `/tv` to Coop TV's `netlify dev` on 8893. The kid screen `/kid/:id/tv` shows it full screen in an iframe at `/tv/`, with the full dock underneath, Coop TV active.
- Focus modes and access holds: the module leaves the dock, and an open view closes when the heads-up ends (it stays open, with the heads-up over it, during the 2 minutes).
- The Deck's service worker must not answer `/tv` (`navigateFallbackDenylist`), and the anti-framing headers become `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` so the Deck can frame its own `/tv` while no one else can frame the Deck.

Needs changes to the Coop TV app (outside `rooster/deck`, not built):
1. **Its function calls are absolute** (`/.netlify/functions/parent-write`, `kid-update`, `sync-now`). Under `/tv` they'd hit the Deck's functions. Coop TV needs a configurable function base (for example `/tv/api/…`, which the Deck proxies to Coop TV's functions).
2. **Third-party scripts on the Deck's origin.** Coop TV's page loads supabase-js from jsDelivr, Google Fonts, and the YouTube IFrame API script into the page itself. Served from the Deck's origin, those scripts run with full access to the Deck's `localStorage`, which holds the iPad's device session. That breaks the brief's "no third parties beyond what's self-hosted" (req. 7) for the Deck. Coop TV would need to self-host supabase-js and its fonts, and play videos in a cross-origin YouTube iframe without loading `iframe_api` into its own page (or load the player inside a nested `/tv/player` frame that holds nothing).
3. **Being told which kid is watching** (for skipping its picker later): a `postMessage` handshake from the Deck to the `/tv` frame with the kid's Coop profile id, with no Deck token shared. Coop TV's profiles need a mapping to Deck kids (stored on the Coop side).
4. **Settings into Back Office** (later): Coop TV's parent writes go through its own PIN-checked function on the shared rooster project. Moving them into the Deck's Back Office means either the Deck calling those functions server-side, or migrating Coop TV's tables into the Deck's project. The second conflicts with A1's separate-project decision; decide when that phase comes.

| # | Question | Default |
|---|---|---|
| A64 | Item 2: until Coop TV drops its third-party scripts, any script it loads can read the Deck's device session on a kid iPad | **Ask.** Default: build the view in slice 14 as decided, but **Coop TV stays unpickable** ("Coming soon" in Kid settings) until Coop TV is self-hosted and no third-party script runs on its page. The alternative is to accept the risk for 1.5 |

### Decided

| # | Item | Decision |
|---|---|---|
| A1 | Per-agent databases | **Decided (parent, 2026-10-02):** each agent gets its own small Supabase stack built from the same migrations and seed (`scripts/agent-stack.mjs`, SETUP.md "Agent stacks"), instead of a `createdb -T` clone. GoTrue and PostgREST serve one database each, so a clone works for pgTAP but not for Playwright. |
| A2 | parent-ux-tester tools | **Decided (parent):** `Write` and `Edit` added, so it can write REVIEW.md findings and its tests. |

### Contradictions inside the brief

| # | Where | Contradiction | Default |
|---|---|---|---|
| A3 | parent-screens "Kid settings" vs "Reachability rule" | Dock picks are "Session, Coop TV, Tune Shop, Sticker Wall and Tour Dates", but also "Sticker Wall and Tour Dates are no longer dock items" | Picks are **Session, Coop TV, Tune Shop**, shown with their reach labels; only **Coop TV** can be picked in 1.5 (Session "Comes in Phase 2", Tune Shop "Phase 3"), as BackOfficeKid draws it |
| A4 | Coop TV | It's the only real pick, but it's a separate rooster app (`coop/`), not a module in The Deck. Nothing says what the dock item opens. | **Answered: see Parent's answers.** Was: a `coop_tv` module whose dock item opens the Coop TV site in the same window, from a URL a parent enters in Back Office. Kids leave The Deck for it (Guided Access permitting), and nothing calls out from the server |
| A5 | Accent colors | design-system names magenta, cyan, yellow, lime, lilac, orange; kid-screens and My look say Pink, Blue, Yellow, Green, Purple, Orange; data-model says "accent hexes" | Keep Phase 1's `accent` enum keys (magenta…orange). Show the friendly names (Pink…Orange) to kids and parents |
| A6 | Sticker cap | "At most 4 sticker routines a day" (an editor cap) vs acceptance item 4, "a fifth sticker routine in a day earns no sticker" | The editor shows the count against 4 per kid but doesn't block. The **database caps awards at 4 per kid per family-local day**, and a fifth finished sticker routine plays only the celebration. Last Run's quiet reveal counts toward the 4 |
| A7 | Birthday window | "Accents show from 14 days before" vs "the birthday kid gets the trim and Party Bunting deck in their birthday week" | Birthday trim and circle in the same 14-day window as holidays; Party Bunting deck in the Mon–Sun birthday week; birthday kid only |
| A8 | Winter end | The setting has an end date, but the art spec says winter poses run "to the end of February" | One setting drives everything (poses, Snow Report, winter trim). The end is stored as month and day, with "end of February" meaning Feb 28 or 29 |
| A9 | Trip weather | Surf Report says the trip card is Phase 2; the roadmap says Phase 3 | Not built in 1.5 either way. The trip card and Tour Dates trip weather are left out |
| A10 | Who pickers | "Everyone + avatars" everywhere vs Parent Today's "All kids + avatars" | "All kids" on Parent Today's filter (it filters, it doesn't assign); "Everyone" in pickers that assign |
| A11 | Auth (req. 1) | `CLAUDE.md` still says Apple/Google or passkey | D1 stands (email code + TOTP). No change |
| A12 | Session in 1.5 | Session is Phase 2, but the Session focus mode and its placeholder screen exist from Phase 1, and the B2 frames dock it | In Session mode, The Point docks Home · Session · Wave Check and Session opens Phase 1's placeholder. In Everything mode, Session isn't in the dock unless it's pickable (it isn't in 1.5). No "1 mission" tag: nothing assigns work until Phase 2 |

### Frames vs brief (brief wins on behavior; these need a call or are worth knowing)

| # | Frame | Conflict | Default |
|---|---|---|---|
| A13 | KitchenMenu (locked) | Shows an Undecided night's options ("Leftovers or out to eat"), which the brief says kids never see | **Brief wins.** Locked hub shows "Something easy" only; options appear after the parent unlock. Devices can't read `dinner_plan.options` at all (column grant); the unlocked display gets them through the parent path |
| A14 | KitchenHub, KitchenCalendar (locked) | Grandma's (hidden-from-kids) titles show ("Choir rehearsal"), and the work Busy block is missing; work chip off by default | **Brief wins.** Locked: hidden events are a dashed "Private" block; work shows per the display's mode for that calendar, default **Busy**. Redaction happens in the database (a definer RPC returns titles only where the display's mode is Title and the event isn't hidden), never in the UI |
| A15 | CalendarEvent | Grandma's event: "Kitchen display: Title, shows full titles there" | Display mode Title applies to events kids can see; a hidden event stays Private on the display until unlock. Same rule as A14 |
| A16 | EventEditor | A native create flow ("New event", Add, whose birthday, which holiday), but the brief says no "+" and nothing needs a native create flow | **Ask.** Default: don't build the create flow. Use the frame only for its **kid layer** sheet (kid title, sticker, which kids, Countdown on Tour Dates, kind, preview). Also A22 |
| A17 | EventEditor | "Kids see a countdown, not your title" vs "kids see the raw title unless the kid layer gives a kid title" | Brief wins: raw title unless a kid title is set |
| A18 | CalendarEvent | Kid layer has no Kind field; preview says "15 sleeps" under "starts 14 days out" | Add Kind to the sheet (trip, birthday, holiday, school, other). The countdown tile appears 14 days out; the preview shows today's count |
| A19 | SnackShack | Nothing planned: "kids just won't see a dinner line" | Brief wins: kids see "Dinner later" with a dashed plate |
| A20 | RoutineEditor | No way to add a Wave Check step; Type read-only; one sticker count for a two-kid routine; "See it as Kid A / Kid B" hard-coded | Add a "Wave Check" step type; Type editable; the sticker count is shown **per kid** ("Kid A 3 of 4 · Kid B 4 of 4, full"); the preview lists every kid on the routine |
| A21 | KitchenParent | Missing the device's Unpair (Phone), Parent unlock, Lock-again, job and Read-aloud rows; not "the same content as the phone" | Unlocked hub panes reuse the phone's components, so the content matches; phone-only rows appear tagged Phone with the QR |
| A22 | Phone-only list in frames | DeviceKitchen and KitchenCalendar notes leave out parent accounts | Use the brief's full list: kid and parent PINs, pairing and unpairing, parent accounts, export, delete family |
| A23 | B2, Routine, WaveCheck, Celebrate frames | Routine frames have no active dock item; header avatar links to My look from task and info screens | Brief wins: exactly one active item (Home on routines, Wave Check on Wave Check and breathing); My look opens from The Point's avatar only |
| A24 | Focus-volume frames | RoutineNight, WaveCheckNight, BreatheNight and CelebrateNight use halftone and large or `lg` art in focus | Brief wins: no halftone, `md` art, small calm poses in focus |
| A25 | Pre-reader B2 | Right now is text-only; holiday greetings drop the name; the My look avatar is 78 px | Picture-first Right now with the line spoken on tap (text kept small); the name stays in the greeting; the avatar is at least 80 pt |
| A26 | Wave Check | Frame has 3 size levels (none for Rolling) and no "Not now"; `feelings_checkins.size` is 0–4 | Keep Phase 1's 5 sizes (0–4) unless you prefer the frame's 3. "Not now" shows only when Wave Check is a routine step |
| A27 | Breathe | A `pace` choice (3/4/5 counts) | Fixed at 4 in, 4 out (brief); no setting |
| A28 | MyWeek, OldDecks | Past empty slots drawn dashed (reads as missed); a reroll stays in the Surf world; decks and worlds repeat inside 12 weeks | Brief wins: past days show only what was earned (no empty slots before today); the rotation rules as written |
| A29 | Collection | Pre-readers lose the Boards filter; no paging (tiles cut off) | Same sets for both bands (icon-only for pre-readers); the grid pages with big Back and Next buttons, never scrolling (no kid screen scrolls) |
| A30 | Surf Report, GetDressed | No Snow condition or Snow Report state in these frames; no credit on GetDressed; "No jacket needed" shows no pictures; feel words and day-part times undefined | The Snow art and words come from R5; the credit shows on every weather screen; "No jacket needed" shows no clothing picture (there's no art for it, and "one to three" applies when there's something to wear). Feel words: Hot ≥ 85, Warm ≥ 75, Mild ≥ 65, Cool ≥ 45, Cold below, from the same five steppers. Day parts: morning 7–9, after school 15–17, evening 18–20 local |
| A31 | KitchenHub weather | Tip from the high or the low? | The tip uses the day's **low during waking hours** (7:00–20:00), so "68°/52°" says "Bring a jacket" |
| A32 | StickerMix | Sizes 82–96 px | Brief wins: 86–96 px |
| A33 | Holiday frames | The holiday sticker isn't shown on the deck, the "?" slot or the countdown in the Halloween and Christmas B2 frames | Brief wins: it shows in all three |
| A34 | Avatar pool | My look offers `cat_face` and `unicorn` (animal faces) | **Ask.** Default: allowed; the rule is about feeling faces |
| A35 | Frames vs each other | Dates, step counts, deck names and routine times differ between frames (prototype data) | Ignored; layout only |

### Data the model doesn't cover (schema)

| # | Needed by | Missing | Default |
|---|---|---|---|
| A36 | Surf Report, the weather job | **Home location** and temperature unit. The server must round it to about 1 km before calling Open-Meteo | (schema) Keys in the existing `families.settings` json: `home_lat`, `home_lon` (stored already rounded to 2 decimals) and `units` (`f`); a "Home for the weather" row on Back Office → Surf Report tips. No new column |
| A37 | Parent Today | **Wave Check notes** with an author ("Add a note", "· Parent B") | (schema) `feelings_notes` (kid check-in id, parent, text, created_at), parent-only, same 30-day purge, in export and Delete family |
| A38 | Kitchen hub unlock | Setting the **6-digit parent PIN**; no frame draws it | A "Kitchen PIN" row under Parents and data → Parents (phone only); no schema change (`parents.unlock_pin_hash` is in the model) |
| A39 | `parent_id` everywhere | `parents` has no `id` (key is `family_id, user_id`) | Use `parents.user_id` as `parent_id` in `calendars`, `parent_calendar_prefs`, `display_unlocks`, notes |
| A40 | `kid_ids` on routines, devices, events, and step `who` | Arrays can't carry foreign keys, so "one family can never point at another's kid" and delete cascades would rest on triggers | (schema) Join tables `routine_kids`, `device_kids` and `event_kids` with composite `(kid_id, family_id)` foreign keys; step `who` stays in the steps json, validated by trigger. Phase 1's `routines.kid_id` migrates into `routine_kids` |
| A41 | Routine columns | The model renames Phase 1's `slot`/`starts_at` to `type`/`start_time` | Keep `slot` and `starts_at`; add the new columns (`days`, `finish_by`, `finish_label`, `earns_sticker`, step `kind`/`who`) |
| A42 | Sticker and deck catalogs | Names, sets (Sea, Dinos, Space, Boards, Holidays, School), source, season, rarity; 36 deck names, world and look; the NEW tag needs "seen" | Catalogs are **code data** (`src/stickers/catalog.ts`, `src/decks/designs.ts`), not tables; `sticker_awards` keys into them. NEW means awarded since the kid last opened My stickers, remembered on the device (no schema change) |
| A43 | Events from Phase 1 | Phase 1 events were typed in the app; 1.5 events come only from feeds | (schema-ish) Phase 1 rows move to a built-in "Added in The Deck" calendar so nothing is lost; the Phase 1 editor goes away (no "+"). Countdowns then need a synced event plus a kid layer |
| A44 | Finish-by stages | "Pick up the pace" at 9 min, "LAST CALL" at 4 min | Fixed in code, not settings |
| A45 | Food words | Pre-reader one-word dinner labels ("Burgers") | Derived from the meal's icon key in code (hamburger → "Burgers"); falls back to the meal name's first word |
| A46 | Bills | "Bills · Later" on DeviceKitchen | Not built; no field |

### Can't be built as written

| # | Item | Why | Default |
|---|---|---|---|
| A47 | Art export by `aria-label`, "found exactly once" | Labels repeat across and within frames (for example "Rooster mascot — Celebrate" ×11), and trims, corner circles and seasonal suns have **no aria-label** (only clip-path ids like `cp_halloween`); holiday deck labels sit on wrapper elements | The script reads a **source map**: each asset comes from one named source frame (R2–R6, HolidayTrimsFull, HolidayKit) and one selector (aria-label, or an element id for trims, circles and suns). Copies elsewhere must match after normalization, or the export lists them as a warning. The "exactly once" check applies within the source frame |
| A48 | Dog rider sticker | Spec ships it for both Mara and Costa; the canvas has one "Sticker — Dog rider" | Export the one drawn; the Costa rider is listed as **missing art** on the contact sheet until it's drawn. The pool offers the drawn one only |
| A49 | Weather keys | The Surf set has Hot; the Snow set pairs "Warm, Spring snow"; the art spec says "hot or warm"; an extra "PJs" dressing hint exists | Key `hot` in both (Snow Report's hot = "Warm · Spring snow"); PJs exported but unused |
| A50 | Deck templates | The 36 decks are inline SVG with template holes, and the kid tint is a JS string, not `var(--kid)` | Port each design by hand into a parametric template (pattern + 2 colorways + light/dark + `var(--kid)`), checked against a render of the frame on the contact sheet. This is the "reproduced from the Deck designs board" route; it's the slowest part of slice 8 |
| A51 | "Very low brightness" at Lights out | A web app can't set the iPad's brightness | A dark overlay to 35% (the animation's dim); SETUP.md suggests Night Shift and a low brightness in Screen Time Downtime |
| A52 | Heads-up auto-speak "after the first tap" | iOS reloads the app on app switch, and speech needs a fresh tap after every load | Auto-speak once a tap has unlocked speech in this page load; otherwise show the banner and speak on the next tap |
| A53 | Pre-reader portrait | "Stack the two landscape columns" may not fit without scrolling | Stack, then scale the deck and cards down to fit; if it still doesn't fit at 820 × 1180, the deck shrinks first. Recorded as a deviation |
| A54 | Single-kid iPads | "One kid opens straight into their profile" with a PIN set | It still asks the PIN (the PIN is the kid's, not the device's) |
| A55 | `scripts/build-sprite` with PIL | Pillow isn't installed | A local Python venv in `.venv` (gitignored) for the script; nothing ships. SVGO (MIT) as a dev dependency for `export-art` |
| A56 | Display unlock | "A display device gains parent reads and writes while an unexpired row exists" means **every parent policy** accepts an unlocked display, except phone-only ones. Displays are anonymous (aal1) sessions | (→ REVIEW.md, slice 15) One helper `private.is_parent_or_unlocked_display_of(family)` replaces `is_parent_of` in non-phone-only policies; phone-only RPCs keep `is_parent_of` (aal2, not anonymous). Expiry slides with activity through a `touch_display_unlock` RPC (at most once a minute), hard cap 30 minutes. Lockout: 5 wrong PINs per display in 15 minutes → 15-minute lock; 20 per family per hour → 1-hour lock. The unlock's parent faces come from a `display_parents()` RPC returning initial and color only |
| A57 | Calendar feed URLs, server-only | The model lists `calendars.feed_url` | (→ REVIEW.md, slice 10) Stored in `private.calendar_feeds` (no grants), set through a definer RPC that accepts only `https`/`webcal` links on iCloud (`*.icloud.com`) and Google (`calendar.google.com`), which also blocks server-side request forgery. The export lists feed URLs under "omitted"; Delete family removes them |
| A58 | Feed and weather fetches | Brief: "Supabase Edge Function or Netlify function" | Supabase Edge Functions (calendar sync with an ICS and RRULE library bundled in, weather), scheduled by pg_cron through pg_net with a secret in Vault. Edge runtime turned on for `deck-build` only. pg_net keeps responses for 6 hours, so the functions return only a status, and Delete family purges any rows |

### Hosted settings the 1.5 features need (Gate 2)

- **Extensions:** `pg_net` enabled (pg_cron is already in use).
- **Vault:** one secret the cron jobs use to call the Edge Functions.
- **Edge Functions:** `calendar-sync` and `weather` deployed, plus their secrets. `supabase functions deploy` and `supabase secrets set` aren't in the deny list, but they change the hosted project, so **you run them**, like link and push.
- **Schedules:** calendar sync every 15 minutes, weather hourly (pg_cron, UTC).
- **Realtime:** stays private-only (G4b). The display-unlock and lock signals use the same private topics.
- **Free-tier pausing (G5):** a paused project also stops weather and calendar sync; kid screens hide weather after 12 hours.
- **Open-Meteo:** no key; confirm the current terms and the attribution before go-live. Non-commercial use only.
- **Netlify:** no new env vars; the CSP is unchanged, because only the server calls out.
- **Auth:** nothing new. The display unlock is a database row, not a new kind of session.

### Real names and brands

| # | Where | What | Default |
|---|---|---|---|
| A59 | Brief and frames | "Steve's work", "Jess", initials S and J, "Mom", "Grandma", and the dogs Mara and Costa | Code, seed and tests use placeholders only: Parent A / Parent B, initials A and B, "Parent A's work", "Grandma's" (generic). The dogs' names exist only as art keys (`dog-mara`, `dog-costa`, from the brief). Spoken and shown dog names wait for the mascot names (X5, Phase 2), so kid copy says "the dog" until then. **Ask** if you want Mara and Costa shown and spoken in 1.5 (default stored in `families.settings`, editable) |
| A60 | Brief and frames | "Bubba burgers", "Steak-umms", "Costco", "Reminders" | Not used in code or seed; seed meals are generic ("Burgers", "Cheesesteaks"). The Lists placeholder doesn't promise a Reminders sync |
| A61 | Frames | Google Fonts links | Canvas only; the app keeps self-hosted fonts |

### Found during slice 0

| # | Item | Status |
|---|---|---|
| A62 | **Bug (Phase 1): a failed `whoami` at launch showed "Not set up".** A paired iPad that couldn't reach the server at launch (offline, or a network blip during an iOS reload) landed on the No access screen. This is the cold-launch-offline case (X7). | **Fixed** in `src/lib/session.tsx`: a paired iPad opens from its offline snapshot (routing only; RLS still applies), anything else keeps loading, and both retry with backoff until the server answers. e2e `session-offline.spec.ts`. It was the real cause of the `focus-modes.spec.ts` first-test failure |
| A63 | `design/canvas/canvas.json` | It came with the frames (the plan says `.dc.html` only). It's the board index (page and title per frame) and has no personal data | Keep it: it maps each frame to its canvas page |

## 1.5-1. Review these first (Phase 1.5)

### P1. Schema 1.5 (slice 1): `…20261002000000_phase15_enums.sql` to `…000500_phase15_export_signals.sql`

**What it adds.** Everything listed in the data model for 1.5, plus the approved schema items (A36, A37, A39, A40, A41, A43, A59).
- **Families:** a validated `families.settings` (`private.valid_family_settings`). It holds the holidays, winter dates, dog pin and names (default Mara and Costa), tip temperatures, home location (stored already rounded to 2 decimals) and units.
- **Kids:** `can_change_look`, and `dock_picks`. A trigger allows only built dock modules: up to 3 for readers, 1 for pre-readers.
- **Parents:** `initial`, `color` and `unlock_pin_hash`. The hash isn't granted to any API role; `has_unlock_pin` is generated.
- **Devices:** job, start view, unlock, re-lock time, sound, read-aloud and dim at Lights out.
- **Kid lists are join tables** (A40), each with composite `(kid_id, family_id)` foreign keys. No rows means everyone.
  - `routine_kids`: Phase 1's `routines.kid_id` moved into it and the column was dropped.
  - `device_kids`.
  - `event_kids`.
- **Routines:**
  - Days, finish by with Bus or Car, and "Earns a sticker".
  - Up to 8 steps, each with a `kind` (task or Wave Check) and a `who`.
  - `who` can only name the family's own kids (a definer trigger).
  - `save_routine(...)` writes a routine and its kids in one call. It's an invoker RPC, so RLS and the column grants apply.
- **Check-ins:**
  - `checkin_moments`: at most 3 per kid, under an advisory lock.
  - `feelings_notes`: parents only. The server sets the author, the author alone can delete a note, and notes cascade with the 30-day purge.
- **Calendars:**
  - `calendars` gets two built-in calendars per family, Holidays and "Added in The Deck".
  - **Feed URLs live in `private.calendar_feeds`**: RLS on, no grants, outside the exposed schema.
  - `last_error` is checked so it can never hold a link.
  - `device_calendars`, and `parent_calendar_prefs` (each parent's own rows only).
- **Events:** `calendar_id`, the feed fields and the kid layer.
  - Phase 1 events moved into "Added in The Deck" (A43), with `visible_to_kids` mapped to `kid_visibility` and `countdown`.
  - `private.event_guard` keeps synced events read-only apart from their kid layer.
  - API inserts and deletes are allowed only in "Added in The Deck".
  - Nothing moves between calendars.
  - Guards apply to direct writes only (`pg_trigger_depth() = 1`), so cascades from Delete family go through.
- **Who sees an event** (`private.event_kid_visible`): Holidays always; a "never" calendar (work) never, whatever the event says; then the event's override; then the calendar's default. Devices read only events that pass.
- **Snack Shack:** `meals` and `dinner_plan` are **parents only**. Devices, the kitchen hub included, read dinners through an RPC in slice 12 that leaves out the options (A13). `weather_cache` is read-only for members.
- **Stickers:**
  - `kid_decks` and `sticker_awards` have no API writes at all.
  - A trigger enforces **4 a day per kid**, the kid's own deck, a pick from the offered keys only, a fixed offer, and "placed never moves".
  - It also enforces 86–96 px, a tilt of ±5–12°, and weeks starting on Monday.
- **Display unlock:**
  - `display_unlocks` has no API writes, and parents can read it. Its devices row must be in the parent's family, and it's capped at 30 minutes from the unlock.
  - `display_unlock_attempts` has no grants.
- **Export v2** is driven by `private.deck_tables()`, the one list that the cleanup guard and the tests also use.
  - It strips `kids.pin_hash`, `parents.unlock_pin_hash` and `pairing_codes.code_hash`.
  - It lists feed links and lockout rows under "omitted".
- **Delete family:** unchanged. Every 1.5 table cascades from `families`, and the feed URLs cascade from their calendars.
- **Realtime:** payload-free signals for every kid-visible 1.5 table. Feelings notes, parents' calendar toggles and events kids can't see go to the `parents:` topic only.

**Tests.**
- `009_phase15_rls.sql` (222 assertions): every table and rule from each role, with probes that always roll back.
- `010_phase15_export_delete.sql` (85): no feed link or hash anywhere in the export; every 1.5 row of family 1 gone after Delete family; family 2 unchanged.
- The Phase 1 suites were updated where the behaviour changed on purpose:
  - routines.kid_id is now `routine_kids`;
  - `visible_to_kids` is now `kid_visibility`;
  - family 1 has more events and devices;
  - the grants snapshot and the device sweep's allowed reads cover the new tables.
- Each of those edits is called out in the file it touches.

**Trade-offs.**
- **Home location on iPads.** It sits in `families.settings`, as approved (A36). Parents and iPads share the `authenticated` role, so a column grant can't hide one key from the iPads, and they can read the rounded location. The weather is computed on the server, so the iPads don't need it. The alternative is a parents-only column or table. That would be a schema change, so it needs your OK.
- **Dog names** (A59) are data, not code: column default `{"dog":{"names":{"mara":"Mara","costa":"Costa"}}}`.
- **"Everyone" is no rows** in `routine_kids` / `event_kids`, so a kid added later is included automatically, as in Phase 1.
- **The Phase 1 screens** (Tour Dates editor, Back Office routine editor, Today) were adapted minimally and still edit one kid per routine. Slices 6, 10 and 14 replace them.
- **Offline snapshot.** The key went to `deck.snapshot.v3`. The old v2 key is never read, and it's removed on load and on unpair (it holds kid data).

### P1b. Slice 1 security review (rls-auditor)

**Blocking, fixed:** a locked Family display could read the full titles of events whose calendar it shows as **Busy** or **Not here**, which broke A14. `events_select` and `event_kids_select` checked only whether kids may see the event.
- **Fix:** a display now reads event rows only for calendars it shows as **Title**. That's `private.my_display_mode(calendar)`: the device's `device_calendars` mode; built-in calendars default to Title and feeds to Not here.
- Busy blocks and hidden events reach a display only through the redacting RPC in slice 10.
- Kid iPads are unchanged.
- Tests: `audit_phase15_display_calendar.sql`.

**Hardening taken in the same pass** (the auditor's `todo` tests, now plain assertions):
- A display lists only the calendars it shows, never one set to Not here.
- `device_calendars` rows are allowed for Family displays only (`private.check_device_calendar`). Before this, a parent-written row could list the work calendar on a kid iPad, though never its events.
- `calendars.last_error` is a fixed code (`unreachable`, `not_found`, `forbidden`, `not_a_calendar`, `too_large`, `timeout`, `unreadable`). Free text could have quoted a link's secret path.
- Sticker awards: the award date must fall in its deck's week, and the three offered stickers must differ.
- Display unlocks: only for an unrevoked Family display with Parent unlock on, Lock is final (an ended unlock can't be revived or extended), and an unlock can't be moved to another device or parent.
- Changes to a calendar no iPad can list (never for kids, and no display shows it) signal the parents topic only.
- A note whose author has left the family can be deleted by either parent.

**Left for the slices that add the write paths** (from the auditor's list; each slice's REVIEW entry will show it):
- **Slice 8:** the award RPC checks the source is a sticker routine of this family that serves the kid. This is still a `todo` test; chores have no table yet. The server also computes the day, the deck, the offer and the placement.
- **Slice 10:**
  - The feed setter never returns the URL.
  - The sync reads feeds through a service-role-only function.
  - Delete family also purges pg_net responses.
- **Slice 13:** the look RPC is definer and volatile, refuses GET, checks the family through the device, checks `can_change_look`, checks the avatar pool, and writes only `avatar` and `accent`. **Its rate limit needs somewhere to store attempts, which the data model doesn't have: see A65.**
- **Slice 15:**
  - The PIN check refuses GET, records the attempt first, and locks per device then per family.
  - "Unlocked" means an unexpired, unended unlock on the caller's own unrevoked display.
  - Phone-only RPCs keep `is_parent_of`.
  - An unlocked display can update only its own devices row.
  - A note written on the display is authored by the unlocking parent.
  - The display leaves the `parents:` topic on Lock.

**Accepted (non-blocking):**
- A kid iPad can read an event whose kid layer names only a sibling. Same family, shared iPads, and each kid's screen filters it.
- Devices can read `calendars.owner_user_id`, a parent's user id. Parents and devices share the `authenticated` role, so a column grant can't split them.

**The auditor's tests:** `audit_phase15_display_calendar`, `_kid_ipad`, `_unlock_guards`, `_stickers`, `_feeds`, `_delete_family` and `_cross_family`. The suite is now **4,659 assertions**, all passing apart from the one slice 8 `todo`.

| # | Question | Default |
|---|---|---|
| A65 | **(schema) The kid-side look RPC's rate limit (slice 13) needs a table** for attempts, like `pin_attempts`. The data model doesn't list one, so per the plan this is a stop. | **Ask at the smoke check, before slice 13.** Default: `look_attempts (family_id, device_user_id, kid_id, attempted_at)` with RLS on and no grants, purged nightly, covered by Delete family; at most 10 look saves per kid per device per hour |
| A66 | Home location on iPads (P1 trade-off) | Default: keep it in `families.settings` as approved; iPads can read the rounded location. Say if you want it moved to a parents-only place (a schema change) |
