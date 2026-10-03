# Phase 1 Progress

Session handoff for `PHASE1_PLAN.md`. After each slice, record what was built, decisions made, open questions and the next slice. On a new session or after compaction, read `CLAUDE.md`, then `PHASE1_PLAN.md`, then this file, and continue from the next unfinished slice.

## Standing rules from the parent

- Work on branch `deck/phase-1`. Stage only specific paths inside `deck/` (plus the root port-table row). Never `git add -A` or `git add .`. `../_shared` has unrelated uncommitted changes; leave them alone. The Deck does not use `_shared/auth-overlay`.
- Public sign-ups are off: only emails a parent pre-added (the allowlist) can sign in.
- Hosted "automatically expose new tables" is off. Every migration GRANTs explicitly to `anon` and `authenticated`, and the local setup revokes the same defaults so local behaves like hosted.
- MFA is enforced in the database (`aal2` on parent policies).
- `.claude/settings.json` denies push, link, `db push`, Netlify deploy and link, destructive git commands, and remote Supabase flags.

## Pre-slice setup (2026-10-01)

- Branch `deck/phase-1`. Root port row added: `deck/` uses 8894 / 3997, site `rooster-deck` (created at Gate 2).
- `STATUS.md` added; it points to this file.
- Parent decisions recorded in `REVIEW.md` (D1–D3 and the Gate 2 checklist).

## Slice 0: Scaffold and design foundation (done, waiting on the emoji pick)

Built:
- Vite 8 + React 19 + TS 6 PWA (`vite-plugin-pwa`, autoUpdate). The production build injects a strict CSP meta tag: own origin plus the one Supabase origin from `VITE_SUPABASE_URL`. Checked: no CSP errors, the service worker registers.
- `netlify.toml`: dev port 8894, Vite on 3997 (`0.0.0.0`, `.ts.net` allowed), SPA redirect, security headers.
- Local Supabase in `deck/supabase/` (project id `deck`, not linked). Auth config: anonymous sign-ins on (for pairing), TOTP on, email OTP expires after 600 s, template sends `{{ .Token }}` only (`supabase/templates/otp.html`). `npm run env:local` writes `.env.local` with the Tailscale IP (100.68.253.7). Checked that the API is reachable on that IP.
- Design foundation:
  - `src/styles/tokens.css`: `data-ground` × `data-volume` (+ `data-scene="lastrun"`), expressed as switch variables so nested scopes work.
  - `src/styles/components.css`, components in `src/ui/`, and `src/theme/ThemeScope.tsx` (`RootTheme`, `ThemeScope`, `useTheme`).
  - `src/theme/volume.ts`: `effectiveVolume` (the quieter of the two wins) and the seeded `tiltFor`.
- `/styleguide`: emoji 3D-vs-Flat test (8 images × 4 combos), a toggle-driven preview, the full 4-combo matrix plus Last Run, celebration burst, nav rail and tab bar, token swatches.
- Reference mockups rendered to `design/reference/png/` (gitignored, `npm run render:reference`).
- Vendored: Fluent Emoji test set (both styles) + MIT license, all in `ASSETS.md`. App icons are original (`scripts/make-icons.mjs`).
- Tests: Vitest for the volume and tilt helpers. Playwright (`e2e/styleguide.spec.ts`, ×3 viewports) covers same-origin only, fonts self-hosted, volume rules per combo, Last Run night, no yellow text on day, reduced motion.

Decisions:
- `ART_STYLE` in `src/art/art.ts` is `null` until the parent picks; feature screens must not use art before then.
- Wave Check faces: Pumping = grinning face with big eyes, Rolling = relieved, Flat = pensive, Choppy = angry. Routine test icons: toothbrush, t-shirt.
- Screenshots (`review/screenshots/`) and rendered reference PNGs are gitignored (regenerable).

kid-ux-tester (slice 0): 2 blocking findings, both fixed. Avatar chips now grow to `--tap` (64 reader / 80 pre-reader). Focus dots are capped at 32 px through the `--dot-max` switch. Also fixed:
- Last Run forces night in CSS alone, not only through ThemeScope.
- `celebrationVolume(effective, reducedMotion)` now follows the brief: normal unless reduced motion is on.
- The day sun scales with the viewport.
- Nav labels no longer wrap.
- Tiles and wide panels are no longer tilted.
- The styleguide has a pre-reader set and `data-audience="kid"`.

Suite: 114 passed, 3 skipped (`e2e/styleguide.spec.ts`, `e2e/slice0-ux.spec.ts`, `e2e/slice0-compare.spec.ts`).

Carried forward (non-blocking, for the slices that build real screens):
- The ink "I did it!" button has no visible edge on the night ground (about 1:1 boundary contrast). In slice 7, put the primary action on the cream card the way the mockups do, or add a night-only lighter outline.
- Phone kid home (slice 5): two tiles across, as in `GromZone.png`, a smaller headline, and no wrapping of the avatar row.
- Hit areas are only as big as the visuals; enlarge them on small controls when real screens land.
- Yellow (not the kid accent) stays full strength in focus. That's allowed, but watch it.
- Celebration (slice 10): match `Shred.png` (ray background, word inside the burst).

Open:
- **Emoji style pick (blocking stop).**
- **Verified:** turning off `enable_signup` blocks anonymous sign-ins too (`422 signup_disabled`). Asked the parent (REVIEW.md Q2); the recommended fix is a `before_user_created` hook allowlist with sign-ups left on.

Emoji pick: **3D** (parent). Flat deleted. The Phase 1 art set (39 files) is vendored as WebP at the largest size each is shown (about 170 KiB) through `npm run art` and `src/art/manifest.json`. Wave Check faces always show their plain word.

## Slice 1: Schema and RLS (done)

Built:
- `supabase/migrations/20261001000000_foundation.sql`:
  - Revokes the CLI's default grants (tables, sequences, functions; EXECUTE to PUBLIC globally), so local matches hosted "auto-expose off".
  - Adds the `private` schema and the session helpers.
- `supabase/migrations/20261001000100_core_schema.sql`:
  - The 13 Phase 1 tables, plus `parent_allowlist`, `pairing_attempts`, `pin_attempts` and `module_catalog`.
  - Composite `(x_id, family_id)` foreign keys everywhere.
  - Membership helpers: `private.is_parent_of` (aal2 and not anonymous), `is_device_of` (anonymous and unrevoked), `is_member_of`, `is_any_member`.
  - RLS on every table, and explicit table and column grants (`anon`: nothing).
- `supabase/seed.sql` (local only): the `tests` helpers and the `make_two_families()` fixture.
- `supabase/checks/grants.sql`: a grant snapshot query. It is also the Gate 2 G2 check against the hosted project.
- Tests: `001_grants.sql` (golden snapshot), `002_rls_core.sql`, and the rls-auditor's `audit_*.sql` (catalog-driven sweeps). **1,485 assertions pass.**

rls-auditor (slice 1): 2 blocking findings, both fixed and covered by its own tests.
- `module_catalog` was readable by any signed-in session. It's now members only, and the unlisted-user sweep covers every table.
- An allowlist email-existence oracle across families. `parent_allowlist` is now keyed `(family_id, email)` with `NULLS NOT DISTINCT`.

Hardening taken at the same time:
- A device sees its own row only while anonymous.
- `pairing_codes.used_by_device` FK includes `family_id`.
- `code_hash` must look like bcrypt, and a trigger owns `created_at` and `expires_at`.
- The `kid_focus` and `reset_plans` primary keys and the completions unique key lead with `family_id`, so there are no existence leaks.
- `short_ids` limits device-writable arrays.
- `check_completion_kid` is now security definer.
- `kid_focus` has no client delete (Realtime doesn't apply RLS to DELETE).
- The `tests` definer helpers are revoked from the API roles.

Auditor items carried forward, still visible as `todo` tests:
- **Slice 2:** require `email_confirmed_at` on join and create. An anonymous user can attach an email without the hook running; that user still has zero access. Joining needs explicit acceptance.
- **Slice 3:** a global failure cap on pairing, fail closed if more than one code matches, and an atomic used-at update.
- **Slice 6:** delete-family must also remove `pairing_attempts` rows and the family's auth users.
- **Slice 10:** don't publish tables to Realtime `postgres_changes`. Use private Broadcast topics with RLS on `realtime.messages`.
- **Known limit:** on a shared iPad the database can't tell which kid is holding it, so the PIN is a UI keep-out (CLAUDE.md req. 4).

## Slice 2: Parent auth, family setup, add kids (built; review pending with 3 and 4)

- Migration `20261001000200_parent_auth.sql`:
  - The `before_user_created` hook (`private.hook_before_user_created`) is enabled in config.toml. Verified against GoTrue: anonymous sign-ups pass; an unlisted email gets 403 and no user; a listed one gets a code.
  - `whoami`; `create_family`, which consumes the bootstrap row atomically.
  - `my_invites` and `accept_invite(family_id, name)`. Joining is explicit, and every allowlist decision uses `private.confirmed_email()`.
  - `set_kid_pin` (bcrypt); new kids get a `kid_focus` row from a trigger; nightly `private.cleanup_orphans()` through pg_cron.
- Screens: Welcome, Sign in (email, then a 6-digit code; no links), MFA (enroll: Add to Passwords link, QR, key; or verify), Setup, Join, No access, Back Office (Team Riders, Grown-ups, Family, You), data-driven parent nav.
- Tests: `003_parent_auth.sql`; e2e `parent-auth.spec.ts` (iPhone). The e2e covers the full Parent A flow, Parent B joining, a returning TOTP sign-in, and an unlisted email refused. It also checks the email contains no link.

## Slice 3: Device pairing and revocation (built; review pending)

- Migration `20261001000300_device_pairing.sql`:
  - `create_pairing_code`: 8 digits from the CSPRNG, bcrypt, 10 minutes, at most 3 open per family.
  - `redeem_pairing_code`: returns a status rather than raising, so failed attempts persist. Locks out after 5 tries per user or 100 globally in 10 minutes. Colliding codes fail closed; the claim is atomic.
  - `revoke_device` (one-way), `cancel_pairing_code`, `device_checkin`.
  - Nothing is published to Realtime.
- Screens: Back Office Devices (code with countdown; confirm before unpairing; forget unpaired devices), iPad Pair, and Unpaired. "Pair again" signs out and goes to /pair; signing out clears the device cache.
- Tests: `004_pairing.sql`; e2e `pairing.spec.ts`, two contexts (phone and iPad): wrong code, right code, reload, unpair, then the iPad shows Unpaired with no cache left.

## Slice 4: Kid profile picker and PIN (built; review pending)

- Migration `20261001000400_kid_profiles.sql`:
  - `verify_kid_pin`: server-side compare, 5 wrong per kid per device identity locks for 5 minutes, and attempts persist.
  - `server_now`.
  - `save_routine_progress` and `save_reset_plan`. These are security invoker: kid-device writes that PostgREST upsert can't do with column grants.
- Kid shell (`src/kid/`):
  - `KidStoreProvider`: an offline snapshot plus an outbox, with server time offset.
  - `KidTheme`: volume is the quieter of the kid's default and the mode; Lights out is night; Auto ground from routine times.
  - Picker ("Who's riding?", speaker button, Grown-ups explainer, offline chip), PinPad (80pt+ keys, gentle retry, lock message).
  - `effectiveFocus` and `resolveGround` with unit tests.
- Tests: `005_kid_profiles.sql`; e2e `picker.spec.ts` (tap sizes, no scroll, wrong then right PIN, a sibling can't open a profile by URL, reload keeps the profile).
- Fixed: the ground cross-fade no longer runs on first paint (it caused a grey flash), and the PIN key icons are larger.
- e2e fixtures (`e2e/helpers/fixtures.ts`) build real families through the APIs: email code from Mailpit, then TOTP, then pairing.

Deviation: the reviewer agents run once over slices 2 to 4 together. Running the auditor while those slices' migrations were changing would have meant reviewing a moving target.

## Slice 5: Module registry and kid home (built)

- `KidHome` (Grom Zone):
  - What's next comes first: the routine that started most recently today, its first undone step, art, read-aloud, and "I did it!".
  - Mascot, "N more to go!" bubble and progress dots.
  - Registry-driven tiles (`kidVisibleModules`) with live status lines. The pre-reader sees picture tiles, 2 across, and the label is spoken on tap.
  - A celebration burst when a routine finishes.
  - The avatar takes you back to the picker in one tap.
  - The bedtime routine sets the Last Run scene (night).
- Usage logging: `opened` and `completed` events go through the outbox.
- The outbox retries every 10 s (the browser's `online` event isn't reliable).
- `save_routine_progress` keeps step order.
- Pure logic with tests: `routineNow`, `upcomingCountdowns`, and `sleepsBetween` (safe across DST).
- e2e `kid-home.spec.ts`:
  - day and night ground;
  - no scroll, 80pt targets;
  - progress survives a reload;
  - offline taps sync later;
  - celebration and the completed usage event;
  - reader layout.
- The ground cross-fade starts 2 s after launch, so the first screen appears immediately.

## Slice 6: Family export and delete (built)

- Migration `20261001000500_export_delete.sql`:
  - `export_family()`: every family table plus the catalog. pin_hash and code_hash are left out and listed under "omitted".
  - `delete_family(confirm)`: typed exact name. Removes every family row, the lockout rows, leftover bootstrap rows, and the auth users of the parents and iPads. (`→ REVIEW.md R4`)
- Back Office "Your data":
  - Export builds the zip in the browser (fflate, MIT): `export.json`, events/kids/routines/routine_progress/usage CSVs (formula-safe), and README.
  - "Save or share…" uses the iOS share sheet, plus a download link.
  - The danger zone needs the exact name.
- Tests:
  - `006_export_delete.sql`: the export includes every table that has `family_id`, has no hashes, and is parent-only. Delete leaves family 2 untouched.
  - The `exportZip` unit test.
  - e2e `export-delete.spec.ts`.

## Slice 7: Routines (Dawn Patrol and Last Run) (built)

- Parent:
  - Back Office Routines section with Dawn Patrol, After School and Last Run templates.
  - The editor sets name, slot, start time, and everyone or one kid.
  - Steps: rename, change the picture from the step art, add (stable slug ids), move up, remove, delete with a confirm.
- Device ground: a picker per paired iPad (Auto / Day / Night / Follow iPad). The snapshot reads the device row fresh, so a change applies on the iPad's next refresh.
- Kid:
  - `KidFrame` puts Home and Wave Check (80pt) on every non-home kid screen.
  - `Routines` list and `RoutineRun` (one step per screen: big art, words, read-aloud, "I did it!", celebration, then home).
  - The bedtime routine runs in the Last Run scene.
  - `useStepDone` is shared with home.
- The ink button gets a lilac edge at night (`--ink-btn-edge`) for 3:1 non-text contrast. This was a slice 0 carry-over.
- e2e `routines.spec.ts`: template, edit, add, reorder and save on the phone; the Night ground setting wins over Auto; the iPad runs the steps; Home and Wave Check are present; no scroll.

## Slice 8: Tour Dates (built)

- Kid `TourDates`:
  - The soonest kid-visible countdown, big: art, "N sleeps", "until …", N moons (up to 14, then +N) and read-aloud.
  - The next four countdowns below it.
  - Kid birthdays (month and day) are included.
  - Parents-only events never reach the iPad (RLS).
- Parent `/parent/dates`:
  - Month grid (Monday first) with today highlighted.
  - A list for the month with sleeps and visibility.
  - Add or edit events: what, when, picture, kind, who sees it, every year. Delete with a confirm.
  - Tapping a day starts a new event on it.
- Surfaces forward extra attributes. The kid screen is named `TourDates.tsx` (macOS file names are case-insensitive).
- e2e `tour-dates.spec.ts`.

## Reviews of slices 2–4 (done)

- **rls-auditor:** 2 blocking findings (invitation takeover; lockout bypass through GET), fixed in place. See REVIEW.md R1b. It added `audit_hook_and_onboarding`, `audit_lockouts`, `audit_cleanup_orphans` and `audit_rpcs_and_revocation`. All its `todo`s are fixed and promoted. **1,870 assertions pass.**
- **kid-ux-tester:** 5 blocking findings, fixed:
  - Pair and Sign in have Back links, and Welcome and Sign in are open to an unpaired session.
  - The PIN pad has read-aloud.
  - The PIN Delete and Clear keys are no longer squeezed.
  - Parent checkboxes are 48pt (`Check`).
- Non-blocking fixes from the same pass:
  - `aria-describedby` links errors and hints to their fields.
  - An expired pairing code says so on the phone.
  - The PIN pad uses night for a Lights-out kid.
  - The PIN pad warns at 2 tries left and shows the nickname.
  - The "pre-reader" label no longer wraps.
  - Button-styled links have no underline.
- Its specs (`slice2-4-*.spec.ts`, `helpers/qa.ts`) were updated for the intended changes: the ink button's night edge and the PIN speaker.
- Carried to slice 11:
  - The Today dashboard (the marker overlapping the headline on iPad, and the rail wordmark).
  - The picker and PIN pad leave the lower screen empty.

## Slice 9: Wave Check (built)

- Migration `20261001000600_wave_check.sql`:
  - `current_checkin(kid)`: the kid's latest check-in from today, in the family time zone. Devices still can't read the table.
  - `private.purge_old_checkins()` with the 30-day `deck-purge-checkins` job.
  - `usage_monthly` table plus `private.rollup_old_usage()` with the 90-day `deck-rollup-usage` job.
  - `export_family` includes `usage_monthly`.
- Kid:
  - `WaveCheck`: pick a feeling (surf word, plain word, 3D face, color), then how big (5 sizes), then thanks with no score. It offers breathing, plus the reset plan for Flat or Choppy.
  - The moment comes from the current routine; at bedtime it asks "How was your day?" on night.
  - `Breathe`: balloon breathing with the turtle, 3 breaths at 4 s in and 5 s out. Reduced motion keeps the balloon still.
  - `ResetPlan`: body signs, then tools (the turtle's shell first), then the plan.
  - Feeling colors come from volume switches: bold fills at normal, faces only at focus.
- The snapshot is v2 (adds reset plans and current check-ins).
- Tests: `007_wave_check.sql`; e2e `wave-check.spec.ts`.

## Reviews of slices 5–9 (done)

- **rls-auditor:** 1 blocking finding (`delete_family` left `auth.audit_log_entries`), fixed. Non-blocking fixes: the family row lock, trimmed names, the hourly purge, the family-scoped routine lookup, and repeatable read in 007. **2,055 assertions pass.**
- **kid-ux-tester:** 5 blocking findings, all fixed:
  - Last Run now always uses focus styling (and night).
  - Reduced motion removes the burst entirely; a still sparkle sticker shows instead.
  - Every Reset plan question has read-aloud, and the plan has Back, Done, and a hint when Save is off.
  - The routine editor's step buttons are 48pt, and Move down was added.
  - The Session dead end was already fixed by slice 10's routes.
- Also fixed from that report:
  - "Oops, not yet" undoes an accidental "I did it!" (80pt, floating, for 8 s).
  - Breathe has read-aloud before Start, and so does the home's waiting state.
  - The Routines list has a "Which one?" prompt with read-aloud.
  - The SHRED! word stays inside the burst.
- Lights out versus "feelings never locked out" is decided by default (REVIEW Q8), and the tester's spec follows it.

## Slice 10: Focus modes (built)

- Migration `20261001000700_focus_modes.sql`:
  - `set_focus` (invoker, parents-only through RLS, server time, heads-up or now, durations) and `cancel_focus_switch`.
  - Payload-free private Broadcast topics, plus the RLS policy on `realtime.messages`. See REVIEW.md R6.
- Kid:
  - `KidScope` gates screens by module visibility, so hidden screens can't be reached by URL.
  - `FocusLayer`: the heads-up banner (rooster with a sand timer, "Two more minutes, then it's … time.", a draining bar, read-aloud), a time-left chip, and the end-of-session celebration (normal volume unless reduced motion; once per ending).
  - `LightsOut`: night, stars, the turtle tucked in, and only "I need to breathe"; Wave Check comes after breathing.
  - The Session home card, plus the `Session` placeholder screen (learning content is Phase 2).
  - The store subscribes to `family:<id>` and `device:<uid>`. It refetches on resubscribe and has a 60 s fallback.
- e2e `focus-modes.spec.ts` (stable over repeated runs after the Today effect fix).

## Slice 11: Parent dashboard (built)

- `Today`:
  - A header with the marker (current routine and time), the weekday headline, "Hi, …" with the count of things on the board, and kid avatars.
  - "On the board": today's routines and events, with NOW on the current routine. Countdowns below it.
  - Per-kid cards (accent block):
    - routine progress and next step, plus the other routines today;
    - the latest Wave Check (parent-only) and a 30-day history toggle;
    - the current mode with time left;
    - a session summary after a timed mode ends;
    - a collapsed mode switcher (mode, duration, switch now or heads-up; Switch now or Cancel while pending).
  - An "Everyone" switcher.
  - Live through the family topic, with a 30 s and foreground refresh.
- iPad landscape is two columns (board | cards), like iPadHub, and the rail carries the "THE DECK" wordmark.
- Fixed a real bug: effects that depended on `useAsync`'s whole object re-ran every render. Today re-subscribed to Realtime every second, which made updates flaky, and the Devices timer was affected too.
- e2e `today.spec.ts` (iPhone and iPad landscape).

## Reviews of slices 10–11 (done)

- **rls-auditor:** 1 blocking finding (`delete_family` left `realtime.messages` rows), fixed. Its non-blocking items led to a stricter design (REVIEW.md R6):
  - `kid_focus` has no write grants, so `set_focus` and `cancel_focus_switch` (definer, parent check per kid) are the only writers;
  - CHECKs allow only real states;
  - a `pending_return_mode` column;
  - a canonical-UUID topic regex;
  - a `parents:` topic for parents-only events.
- **kid-ux-tester:** 10 blocking findings, all fixed:
  - The heads-up and time-left chip reserve space at the bottom, so tiles (Wave Check included) are never covered, and the hero steps aside during a heads-up.
  - Mode changes show within a second (1 s clocks in home and theme).
  - "Switch now" keeps a pending switch's duration.
  - Cancelling a heads-up keeps a running Session's timer (SQL).
  - A timed Lights out ends quietly: no SHRED!, and no chip at bedtime.
  - The celebration never interrupts Wave Check, Breathe or the reset plan.
  - The celebration button is 88pt, and the celebration dismisses itself after 6 s and goes home.
  - Overlay text follows the kid rules (no selection).
  - The reset plan is reachable in Lights out.
  - The Session home headline says "Session".
- Also fixed from that report:
  - the heads-up bar uses each kid's own accent;
  - the Session card has the rooster and read-aloud;
  - Lights out is dimmer, with a quiet button;
  - the session summary counts only that session;
  - NOW is limited to 3 hours;
  - the Everyone switcher sits after the kid cards;
  - on iPad landscape the kid cards fill the right column from the top, like iPadHub;
  - the pending countdown is not re-announced by VoiceOver;
  - the avatar list semantics are fixed;
  - time left never shows more than the mode's length.
- The reviewer specs were updated where the intended behaviour changed: definer functions, refusals instead of no-ops, Q8, and the reset path.

## Slice 12: Review packet (done; stopped at Gate 1)

- SETUP.md: iPad setup, Guided Access and Screen Time.
- phase-reviewer finished REVIEW.md:
  - an acceptance-check map;
  - review items R1–R11;
  - deviations D1–D14;
  - gaps X1–X13;
  - Q1–Q18;
  - a device test list (Part A over http, Part B over HTTPS through `tailscale serve`);
  - the Gate 2 checklist (G0–G11, C1–C8).
- It found two defects, both fixed by the builder:
  - **X1:** kid taps broke on non-secure origins because `crypto.randomUUID` was missing. Fixed with `src/lib/id.ts` and logging that can never throw.
  - **X2:** a stale refresh could win after a reconnect. Fixed with the `refreshSeq` guard.
- Also fixed: X3 (a Modules switch in Back Office), X4 (a Wave Check prompt after a routine), X6 (an About section), X12 (these docs), and X13 (anti-framing headers).
- Tests for those fixes: e2e `gate1-fixes.spec.ts` (runs on the Tailscale http origin).
- **Stop: Gate 1.** Next is the parent's review and device tests; then Gate 2 (G0–G11 by the parent, C1–C8 after approval).

## Gate 1 device-test fixes

- **P1 (iPhone):** TOTP enrollment re-enrolled every time the app came back from Passwords. It now reuses the pending factor (`src/lib/mfaPending.ts`, kept up to 30 minutes, same user, cleared on verify or sign-out) and cleans up stale unverified factors. Covered by e2e `mfa-resume.spec.ts`. REVIEW.md R1d.

## Where things stand (end of session)

- **Gate 1:** Phase 1 is built and reviewed locally. REVIEW.md is complete. Last full run: pgTAP 2,283, e2e 204, unit 32, build clean.
- **Device testing in progress.** P1 (TOTP enrollment re-enrolling after switching to Passwords) is fixed in `ec004db`; waiting for the parent to retest on the phone. The other Part A steps haven't been reported yet.
- **To resume:**
  1. Run `npm run dev` yourself; netlify dev is on 8894, bound to all interfaces.
  2. Read REVIEW.md section 6 and continue from the next untested step.
  3. Fix device bugs the same way: a fix, plus an e2e that reproduces it, plus a REVIEW.md note.
- **Nothing pushed, linked or deployed.** Gate 2 waits on the parent's G0–G11.

## Gate 1 answers (2026-10-02)

The parent answered Gate 1; REVIEW.md "Gate 1 answers" has the table.
- Q3, Q4, Q8, Q10, Q13 accepted. D4 and D7 confirmed. X5 and X10 are Phase 2.
- Q9 superseded by Phase 1.5 (calendar kid defaults and the kid layer). Q18/X9 and X11 moved into Phase 1.5.
- Q12, Q14 and Q17 contradicted X3, X13 and X4 (built at Gate 1); reconciled in REVIEW.md.
- Netlify team: `rooster-nc` (the only team on the steppinghen.nc account, display name "Rooster"). The site isn't created.
- The TOTP fix (`ec004db`) stays; the parent retests it with the Phase 1.5 device tests.
- **No Phase 1 Gate 2.** Phase 1 and 1.5 go live together after the Phase 1.5 Gate 2. The parent runs `supabase link`, `supabase db push` and the Netlify deploy.
- Phase 1 is closed on `deck/phase-1`. Work continues on `deck/phase-1.5` per `PHASE15_PLAN.md`.

---

# Phase 1.5 Progress

Session handoff for `PHASE15_PLAN.md`. On a new session or after compaction, read `CLAUDE.md`, the `docs/` files the slice touches, `PHASE15_PLAN.md`, `LESSONS.md`, then this file, and continue from the next unfinished slice. Branch `deck/phase-1.5`.

## Standing rules (carried from Phase 1, plus the plan's lessons)

- Stage only specific paths inside `deck/`. Never `git add -A` or `git add .`, never `../_shared/auth-overlay.*`.
- Every test and agent runs on its own stack and on the Tailscale origin over plain http (SETUP.md "Agent stacks"). The dev stack (`deck`, :8894) is the parent's.
- Reviewer agents run at the end of every slice they cover; no batching.
- Rows in tests come only from `supabase/seed.sql` helpers (pgTAP) and `e2e/helpers/fixtures.ts` (e2e).
- No PostgREST upserts on tables with column grants.
- Every multi-step flow survives a reload mid-flow.
- Delete family covers every new table, job, stored secret and Realtime channel.

## Slice 0: Setup (done; waiting on the audit answers)

- Branch `deck/phase-1.5` from `deck/phase-1` (`aedc6d9`, the Gate 1 answers).
- Committed as handed over: `CLAUDE.md`, `docs/`, `design/canvas/` (76 `.dc.html` frames), `PHASE15_PLAN.md`, `.claude/agents/parent-ux-tester.md` (`8b4d48d`).
- `design/reference/README.md` is marked superseded by `design/canvas/`.
- Agents: rls-auditor, kid-ux-tester and phase-reviewer have their 1.5 additions. parent-ux-tester's "Where to run" now names its own stack and origin.
- Per-agent stacks: `scripts/agent-stack.mjs`, `.agents/` (gitignored), `npm run agent`. GoTrue and PostgREST serve one database each, so a cloned database (`createdb -T`) works for pgTAP but not for Playwright. Each agent therefore gets its own small stack built from the same migrations and seed.
- Tailscale origin: `e2e/helpers/agent.ts` drives `playwright.config.ts`, `db.ts`, `mail.ts` and `fixtures.ts`. The config refuses a loopback origin. The origin checks in `styleguide` and `slice0-ux` allow our own hosts instead of `127.0.0.1`.
- Baseline on the new setup: pgTAP on `deck-rls` PASS (2,283), unit 32, lint clean.
- e2e baseline on `deck-build` at `http://100.68.253.7:4010`: 205 passed, 1 failed (`focus-modes.spec.ts:9`, the first real test of the run), 169 skipped by project.
- Parent review of the agent diffs: approved. Agent stacks recorded as decided (REVIEW.md A1); parent-ux-tester gets `Write` and `Edit` (A2).
- Realtime warm-up: `e2e/global-setup.ts` drives one private broadcast end to end before any test.
- The `focus-modes` failure recurred with the warm-up, so it wasn't Realtime. **Real bug (Phase 1):** a failed `whoami` at launch dropped any session to "Not set up". The first test reloads a paired iPad while the app server is still cold. Fixed in `src/lib/session.tsx`: a paired iPad opens from its snapshot, and anything else keeps loading; both retry with backoff. e2e `session-offline.spec.ts`. REVIEW.md A62.
- `.claude/settings.json` re-checked (step 2): it still denies `git push`, `supabase link`, `supabase db push` and every `netlify deploy` spelling, plus `netlify link`, `--linked`, `--db-url` and `--project-ref`. No user-level or root settings file allows them.
- Clean full run on `deck-build` after the fix: e2e 208 passed, 0 failed (173 skipped by project); pgTAP 2,283 on `deck-build`, unit 32, lint clean.
- Brief audit (step 3): REVIEW.md "1.5-0", items A1–A63. Three reader agents compared the frames with the brief; the builder checked the art labels for the export. **Stopped for the parent's answers before slice 1.**
- **Audit answered (parent, 2026-10-02):** every default taken except A4 (Coop TV is a `/tv` view inside the Deck), A59 (Mara and Costa shown and spoken, names in `families.settings`), A14 (display mode decides; hidden-from-kids is Busy on a locked display), A48 (Mara rider for both until Costa's is drawn). Schema A36, A37, A39, A40, A41, A43 and the dog-names key are approved. `supabase functions deploy` and `supabase secrets set` are in the deny list. REVIEW.md "Parent's answers" and "Coop TV view".
- New open question **A64** (default taken, ask at the smoke check): Coop TV's page loads third-party scripts that would run on the Deck's origin. Coop TV view is built in slice 14; the device test list (slice 16) gets "open Coop TV from the dock under Guided Access and come back".

## Slice 1: Schema 1.5 (done)

- Migrations `20261002000000`–`000500` (enums; core; calendar; food and weather; stickers and unlock; export and signals). Every 1.5 table from the data model has RLS, with policies in the same migration. REVIEW.md P1 has the details.
- Kid lists are join tables (`routine_kids`, `device_kids`, `event_kids`; A40). `routines.kid_id` was migrated and dropped. Phase 1 events moved into "Added in The Deck" (A43), and `visible_to_kids` became `kid_visibility` + `countdown`.
- No client write path yet on decks, sticker awards, unlocks, weather, calendars (insert) or feed URLs. Their RPCs come in slices 8, 15, 11 and 10.
- `save_routine` RPC (invoker): routine plus kids in one call. The Phase 1 routine editor and the e2e `addRoutine` fixture use it.
- Fixtures: `tests.make_two_families()` now ends with `tests.add_phase15_rows()` (1.5 rows in both families). `tests.make_phase15()` adds Kid C to family 1.
- App: `src/lib/routines.ts` (`kid_ids`, `servesKid`) and `src/lib/events.ts` (`kids_see`, mirroring `private.event_kid_visible`, with a unit test). Countdowns come from kid-visible events marked `countdown`, with the kid title and icon. The offline snapshot is now `deck.snapshot.v3`; the v2 key is removed on load and on unpair.
- Gotchas met:
  - The CLI's statement splitter cut a plpgsql function at an inline `case … end then`.
  - PL/pgSQL resolves `new.<col>` for every table a shared trigger runs on, so the signal function reads through `to_jsonb(new)`.
  - A CTE's or function's writes aren't visible to the rest of the same statement (for test probes).
  - `agent-stack reset` was deleting the templates folder that Kong bind-mounts, so no sign-in mail was sent. Now it overwrites in place.
- pgTAP on `deck-build`: 25 files PASS (Phase 1 suites updated where behaviour changed on purpose; see REVIEW.md P1).
- **rls-auditor:** 1 blocking finding, fixed. A locked display could read titles from calendars it shows as Busy or Not here; display reads now need Title (`private.my_display_mode`). Hardening taken: display-only `device_calendars`, a fixed-code `last_error`, sticker week and distinct offer, unlock rules (display only, Lock final), parents-only signals for unlistable calendars, notes of a departed author. REVIEW.md P1b. Its 7 `audit_phase15_*` files were added; their fixed todos were promoted to plain assertions. One `todo` remains for slice 8 (award source).
- New questions for the smoke check: **A65** (schema: a table for the look RPC's rate limit, needed by slice 13) and **A66** (home location readable by iPads).
- pgTAP on `deck-build`: 32 files, **4,659 assertions PASS** (1 expected todo). e2e: the full run after the schema passed (207 + export-delete fixed and rerun 3/3).

## Slice 2: Theme and core components (done)

- Tokens (`src/styles/tokens.css`):
  - 1.5 switch variables for the dock's active item, the header avatar, the corner and the trim.
  - The kid's color resolves on each component through `var(--kid, var(--accent))` and the "initial" fallback, so a kid scope can set either.
  - The headline shadow is now cyan right and magenta left, as in the B2 frames.
  - A parent token set for Night and Day under `data-look="parent"` (docs "Parent light mode"). Parent screens adopt it in slice 14.
- `DieCut` + `sizeClass`:
  - One die-cut for every sticker, with `lg`/`md`/`sm` chosen by rendered size and volume; focus never uses `lg`.
  - The rim is thinner at `sm`, and tilt applies at normal volume only. Phase 1's `Sticker` now renders through it.
- `KidHeader`: the sky band layers (the trim, and the 400 px corner at the sun's spot, both hidden in focus), the marker greeting, the offset headline, and an avatar button (82 px for pre-readers).
- `InkDock`:
  - Full, and slim (Home and Wave Check, centred, 230 × 84).
  - One active item: filled with the kid's color at normal volume, ringed in focus.
  - Cyan "Check in" and yellow to-do tags: tilted and popping once at normal volume, still and straight in focus or with Reduce Motion. Text on them is ink.
- `.dk-kidscreen`: the frame every 1.5 kid screen uses (sky band, content, dock flush at the bottom, no scroll).
- Styleguide: "Phase 1.5 kit" (every ground × volume × age) and "Parent look". e2e `slice15-2-kit.spec.ts`. The Phase 1 overflow check exempts the corner overhang, as it does the day sun.
- **kid-ux-tester:** no blocking findings. Its spec `slice15-2-ux.spec.ts` (and `e2e/helpers/frames.ts`, which renders a canvas frame from its `renderVals()` defaults for side-by-side comparison) passes. Fixes taken from its non-blocking list:
  - The dock never shrinks, and `.dk-kidscreen__body` takes what's left.
  - Dock icons are 34 px (46 px for pre-readers), with the frames' glyphs: a side-view skateboard, a wave curl, a closed book, a TV.
  - The `.dk-kidscreen--task` variant has a 34 px sky band, with the sun higher.
  - The check-in tag is hidden on an active Wave Check item, and only one tag pops at a time.
  - Dev warnings fire when Wave Check is missing or the active key isn't on the dock.
  - Inactive dock labels are paper.
- Left for later slices:
  - The reader-landscape dock size (the frame gives readers 96 px items in landscape): slice 5.
  - What "pops once" means across remounts: slice 4.
  - A shared check that the dock's bottom stays on screen: slice 5, with the first real screen.
  - The slim dock's active item on routines is **Home**. The RoutineDay frame shows none; the brief says exactly one. Recorded as deviation V4.
- e2e on `deck-build`: 215 passed, 0 failed before the fixes; the slice 2, styleguide and kid-home specs (152) pass after them.

## Slice 3: Art pipeline (done)

- `scripts/export-art.mjs` (`npm run art:export`, `art:check`):
  - **385 files** from 146 assets plus the holiday trims, written to `src/assets/art/<group>/<key>.<class>.svg` (SVGO, ids prefixed per file, `xmlns` added, dimensions dropped).
  - **The source map (A47):** each asset comes from one source frame, by aria-label (or by a clip id for the unlabelled holiday art). The class comes from the drawn size: ≥100 lg, 48–99 md, <48 sm.
  - Classes the canvas doesn't draw (most mascot md/sm, some sticker md, wave pictures md/sm, badges) are derived by removing the halftone.
  - Trims the canvas draws for one ground only are reused for the other, all flagged. Stickers drop their built-in cut (DieCut supplies it).
  - **Checks:** every mapped label found; duplicate copies compared; both dogs complete; both riders present (A48 cleared); no halftone in md/sm; no template holes left.
  - It writes the contact sheet `design/export-preview.html`, and the `ASSETS.md` section between its markers.
- `scripts/build-sprite.py` (`npm run art:sprite`, Pillow in `.venv`): the 39 Fluent files → `public/art/fluent/sprite.webp` + `src/styles/sprite.css` (`.fx-<key>`) + `src/art/sprite.json`.
- `src/art/original.ts`: `artUrl` / `artFor` / `wholeArt`. A file picked by class falls back to the nearest class drawn, and focus never uses lg.
- `src/art/mascots.ts`: `seasonDog` (Mara Jan–Mar and Jul–Sep, Costa Apr–Jun and Oct–Dec, or the pin), `isWinter` (family dates, "02-29" = end of Feb), `seasonalPose` (board → winter-board, hello → winter), `mascotFolder`, `dogName`.
- `src/lib/familySettings.ts`: the settings shape and defaults (dog names Mara and Costa, winter 12-01–02-29, tips 35/45/65/75/85, °F).
- Tests: unit 50 (resolver; the export's check passes; Mara and Costa have the same files; no halftone in md/sm). Lint clean, build clean. Nothing imports the art index yet, so the SVGs enter the bundle in slice 5.
- No reviewer agent covers this slice (no UI, no schema). The contact sheet is for the parent at the smoke check (A67).

## Slice 4: Scene system and motion (done)

- **Engine** (`src/scenes/`):
  - `timeline.ts`: `beatAt`; the celebration bag (`drawFromBag` / `nextCelebration`: shuffled, all seven before a repeat, never back-to-back across bags, kept per kid on the device); `firstTimeToday`.
  - `useTimeline.ts`: stepped beats; Reduce Motion gives the still at once; ends after its length plus a hold; `skip()` for tap-to-skip.
  - `MascotArt` resolves the season's dog, winter poses and the size class; `FamilySettingsContext` carries the family settings from the iPad snapshot (now `families.settings`).
- **Scenes**, at the art spec's times:
  - `Celebration`: POP, confetti, rooster cheer, shell spin, kickflip, stoked, squad. The burst, confetti, stars and snow are the canvas's own CSS, ported.
  - `PawSlap`: 3.2 s; enters from the right, facing left, when the spot is on the left half; gentle (no slap) in focus volume.
  - `QuietReveal`: tap or 8 s peels in five steps, name, "Good night" dims.
  - `HeadsUp`: pop-up, wave, then timer and line; eight 15 s chunks; the last one pulses from 1:45.
  - `LightsOutScene`: calm, yawn, tucked and roosting, stars and dim, very dim; snow in winter.
  - `BreathingWave` (4 in, 4 out), `IdleMascot` / `useIdleTurn`, `TrimEntrance` (once a day), and `SceneStill` (Morning, Session starts and Last Run, as stills plus their lines).
- **New art from the export** (by position in the frame): idle pairs for the rooster, both dogs and the turtle; Lights-out frames (turtle calm, yawn and tucked; rooster calm and roost); props (sparkle, spin lines, wave strip, impact lines). 415 files.
- **Integrated:**
  - The heads-up in `FocusLayer`, auto-spoken for pre-readers once a tap in this page load has unlocked speech (X9; `speechUnlocked()` in `speech.ts`).
  - The end-of-Session celebration from the bag (D7 replaced).
  - `LightsOut`: plays once per Lights out (keyed by when it began), so a reload shows the still. "I need to breathe" is there from the start.
  - Routine celebrations (`RoutineCelebration`): from the bag, or the quiet Last Run ending ("All done.", focus, no burst; the sticker reveal is slice 8).
- **Styleguide:** a playable "Scenes" section. e2e `slice15-4-scenes.spec.ts` (13 tests, pinned clock).
- **Phase 1 kid specs updated where 1.5 changed the behaviour:**
  - Reduce Motion now shows each still, keeping the settled burst (art spec), with nothing moving and no halftone at focus volume.
  - The heads-up timer is 8 chunks.
  - A tap skips a celebration; there's no "Back to Grom Zone" button.
  - The end of Last Run is always the quiet, focus version.
- **Fixed on the way:**
  - Scene images inside a zero-size anchor were shrunk to 0 by the global `img { max-width: 100% }`.
  - Long shout words overflowed the star.
  - The burst kept its halftone in focus volume.
- **Environment:** the repo is in iCloud-synced `~/Documents`. Re-running the export (rm then rewrite) left ~900 "name 2.svg" conflict copies (untracked, removed), and there is a `.git/index 2`. The export now writes in place and deletes only stale files. Reported to the parent.
- **Left for slice 8:** the paw's exact landing on the sticker (tuned against the real deck), and the quiet reveal's sticker in the Last Run ending.
- **kid-ux-tester (slice 4):** 5 blocking findings.
  - **Fixed:**
    1. Lights out: the pair was hidden behind the control and the headline. Now it sits low and large (R3LightsOut), the scene and its dim cover the whole screen in both orientations, and only "I need to breathe" stays at 4.5 s.
    2. The quiet end of Last Run had no feelings controls and no tap. Now a tap skips it, and Wave Check and Breathe are right there.
    3. Celebrations were always night. They now follow the device's ground; only Last Run and Lights out stay night.
    5. React StrictMode in dev spent two bag draws per celebration. Each draw is now tied to its occasion (`routine@<id>@<day>`, `session@<ended at>`), so asking twice, or reloading, returns the same pick. `firstTimeToday` gives the same answer within a page load.
  - **Carried to slice 5 (4):** in landscape the heads-up covers home tiles, and the quiet ending's page scrolls. Both come from the Phase 1 home, which scrolls in landscape on its own. The heads-up is compact in landscape now; slice 5's B2 layout must keep the banner's height inside the viewport. The reviewer's tests stay failing until then.
  - **Non-blocking fixes taken:**
    - The heads-up isn't spoken twice (the button counts as heard).
    - iOS speech is primed inside the first real gesture (pointerup/touchend, an empty utterance).
    - Bursts sit beside the mascot, in the frames' colors (lilac WHEEE!, lime SHRED!, magenta YEAH!).
    - The art is 240 px. Stoked rides the wave, confetti lands low, and POP holds only 0.8 s after shrinking out.
    - Idle replays when the same mascot gets two turns in a row.
    - The quiet ending draws nothing from the bag.
    - The routine run's Fluent rooster stand-in is the real rooster now.
  - **Noted for later:** idle, the breathing wave, trim entrances and the stills go onto kid screens in slices 5 (idle and stills on The Point), 7 (breathing) and 9 (trims).

### Crash recovery and test timeouts (2026-10-02, during slice 4)

- The Mac restarted mid-run. Checked afterwards:
  - **No work lost.** The committed slices 0–3 match their commits (the "changed on disk" notices were iCloud touching timestamps), and every uncommitted slice 4 edit is present. `git fsck` is clean.
  - One iCloud conflict copy remains: `.git/index 2`. Git ignores it; left for the parent to decide.
  - Docker brought all five stacks back. Each answers at `http://100.68.253.7` (dev 54321, build 55321, kidux 56321, parentux 57321; the rls database on 58322).
  - The app servers were restarted: builder :4010, kid-ux :4011, parent-ux :4012, and the parent's `netlify dev` :8894. Each points at its own stack.
  - The dev stack and the parent-ux stack are still on the Phase 1 migrations. The dev stack is brought up to date (without a reset) before the smoke check; parent-ux is reset before its first review (slice 6).
- **The hung run:** its log was in `/private/tmp`, which the restart wiped, and Playwright writes `.last-run.json` only at the end, so the stuck test can't be named. Logs now go to `test-results/logs/` (gitignored, survives a restart).
- **Timeouts added to `playwright.config.ts`:**
  - 60 s per test unless the test asks for more;
  - 15 s per action and 20 s per page load, so a stuck click fails fast with its locator;
  - 10 s per expect;
  - **40 minutes for the whole run** (`DECK_E2E_RUN_MIN` to change it).
  - The reviewer's longest test is capped at 10 minutes (it was 15).
- **The suite runs in halves:** `npm run test:e2e:phase1` (381 tests) and `npm run test:e2e:phase15` (174), each well inside the run limit. `DECK_E2E_PART` selects the half.
- **Parent's answers after the crash (2026-10-02):**
  - **The repo moves out of iCloud at the smoke-check stop,** after slice 5 is committed. `.git/index 2` gets deleted after the slice 4 commit. Nothing in the repo hardcodes `~/Documents` (scripts and configs use relative paths). Four things outside it do; see "Moving the repo" below.
  - **Parent-ux stack:** reset to the current migrations (14). parent-ux-tester hasn't run on any 1.5 slice yet (its first is slice 6), so there are no reviews to rerun.
  - **Dev stack:** `supabase migration up` applied the six 1.5 migrations in place (14 now). Its 236 families got their built-in calendars, and every event has a calendar; no data was wiped. Its `tests.*` seed helpers are still the Phase 1 versions (the seed isn't re-run on migrate); nothing the parent does uses them.
- **Phase 1 half after the crash:** 7 failures, none a regression.
  - **Time of day:** the real-clock focus suites failed at 22:00 because their family's Last Run starts at 19:30 New York time, so home was night and focus. The shared fixture now takes `family(kids, { live: true })`, which gives the family a time zone where it's 09:00–13:59 now (`liveZone()` in `e2e/helpers/kidqa.ts`). The real-clock suites (`slice10-11-kid`, `slice10-11-live`) use it, so they test the same screen at any hour. Suites that pin the clock keep New York time.
  - **Speech priming:** the iOS priming utterance is empty, and the speech fake now treats it as silence.
  - **Lights out:** the Phase 1 check expected "Time for bed" visible; since slice 4 it hides at the 4.5 s "I need to breathe only" frame (art spec), so the check is that it's on the page and the control is visible.
  - **iPhone:** the heads-up wraps on narrow screens (the line under the rooster and the speaker).
- **Flaky pgTAP control (found at the slice 4 gate):** `audit_unlisted_user`'s "parent A insert probe writes" copied an arbitrary family 1 event. Since slice 1 most of those are synced, and copying one into a synced calendar is refused by design, so it failed about 1 run in 3. The control now probes `checkin_moments` (any copy is valid). 5 of 5 runs pass.
- **Slice 4 gate:** lint clean; unit 55; pgTAP 4,659 PASS (5/5); e2e phase15 73 passed, phase1 208 passed, 0 failed.

## Slice 5: The Point, layout B2 (done; stopped for the smoke check)

- **The Point** (`src/kid/ThePoint.tsx`, `point.css`) replaces the Phase 1 home (`KidHome.tsx` and `home.css` are gone).
  - **Reader portrait:** the frame's order. Header, Right now, Today's stickers, My week with the deck, three info cards, ink dock.
  - **Landscape, both bands:** two columns. Right now and the cards on the left; My week on the right, plus Today's stickers for readers.
  - **Pre-reader portrait:** the two landscape columns stacked (V9).
  - Every variant fits with no scrolling: both bands, both orientations, day and night, normal and focus, two and three kids.
- **The logic is pure and unit-tested** (`src/kid/point.ts`, 16 tests): today's routines by weekday, the open check-in moment, the sticker slots, this week's deck, the bus chip, the season.
- **Right now** (in priority order):
  1. Assigned Session (Session mode).
  2. The running routine, with "Next: …", the bus/car chip within 90 minutes, and Keep going, which opens the checklist.
  3. The Wave Check invite (lilac, the calm turtle, Wave Check and Not now).
  4. What's next.
  5. All done, or "Hi".
  - Between an open moment and a running routine, whichever started last leads (V13).
  - "Not now" rests the invite until the next moment, remembered on that iPad only (`useCheckinMoment.ts`).
  - Pre-readers get a speaker button (V10).
- **Today's stickers:** one slot per sticker routine today (at most four), as `earned` / `pick` / `done` / `next` ("?") / `later`. A skipped routine reads like a later one.
  - Readers' slots are buttons that open their routine (V11).
  - Pre-readers get circles under the deck, also buttons, with 80 pt hit areas.
- **My week:** the parametric Sunset Stripes deck (`DeckBoard.tsx`, `src/art/decks.ts`), with stickers at their saved x, y, size and tilt, scaled 0.74 on The Point.
  - Sticker keys resolve to the original art first, then Fluent (`src/art/stickers.ts`).
  - A first-cut My week screen (`MyWeek.tsx`, V16) gives the dock item somewhere to go.
- **Info cards:**
  - Weather and dinner rest until slices 11 and 12 (V12).
  - The countdown opens Tour Dates.
  - A card never leads to a hidden module: in Session mode, or with Tour Dates off, the countdown card isn't there, and in Session mode neither is My week.
- **The dock** (`kidDock.ts`):
  - Home, My week and Wave Check, plus the kid's picks (none are pickable in 1.5 yet). Session mode trims it to Home, Session, Wave Check.
  - The Check in tag shows while a moment is open, popping once per moment per day.
  - Readers in landscape get 96 px items (B2Land). A short dock keeps the frame's item width, centred.
  - The heads-up banner and time-left chip sit just above the dock, and the content gives up the room.
- **Scenes on The Point:**
  - The hero rooster says hello, then settles and idles (one mascot, every 8–15 s; never in focus or with Reduce Motion).
  - Morning, Session starts and Last Run play as their stills inside Right now, once a day, 2.5 s, tap to skip (V14).
- **Snapshot:** now also carries check-in moments, this week's decks and sticker awards (optional fields; older cached snapshots still load).
- **Tests:**
  - `e2e/slice15-5-point.spec.ts`: 12 tests, including every variant, the invite and Not now, the real-clock check-in, sticker slots, My week, cards, Session mode, stills, idle, and the frame side-by-sides in `review/screenshots/phase15-slice5/compare/`.
  - Phase 1 specs moved from the Grom Zone tiles to The Point: `doSteps()` (Keep going, then "I did it!"), dock and card test ids. X4's "Wave Check after a routine" is now a check-in moment anchored to the routine.
  - `kidPage` and `liveKidPage` wait for the once-a-day still.
  - The score-words check no longer trips on "The Point".
  - `DECK_E2E_OUT` lets a one-off run sit beside a long one: each run wipes its output folder, and that broke a gate run once tonight.
- **Phase 1 e2e accounting (the parent asked, 2026-10-03):**
  - **All 381 tests are still collected, 0 removed. 208 run, 173 are skipped, and every skip is a project gate.** Each test is collected once per project (iPad portrait, iPad landscape, iPhone) and skips itself on the projects it doesn't target: kid specs run on the iPad project and set their own viewports, parent specs run on iPhone.

    | Project | Ran | Skipped |
    |---|---|---|
    | iPad portrait | 97 | 30 |
    | iPad landscape | 46 | 81 |
    | iPhone | 65 | 62 |

    No `fixme`, `only` or unconditional skip exists in a Phase 1 spec. The slice 4 gate ran the same 208.
  - **Checks retired with the Grom Zone** (inside tests that still run):
    - **The side-by-sides against the Phase 1 mockups:** `iPadDawnPatrolDay`, `iPadGromZone`, `iPadGromZoneFocus` (home, Session home, focus-default kid's home) and `GromZone` (phone). The B2 frames replace them for The Point (`slice15-5-point` and the tester's specs). Session mode, the focus-default home and the phone have no B2 frame, so for those only the rule checks remain.
    - **The home's step-by-step "I did it!", "Oops, not yet" and "3 more to go!":** steps are done in the routine checklist now (Keep going); the tests go through `doSteps()`.
    - **"Pre-reader tiles have pictures":** replaced by "pre-reader cards speak on tap".
    - **The offline test's "Routines list shows 3 routines":** it checks that My week opens offline instead.
    - **X4's "Wave Check prompt after any routine":** it now needs a check-in moment anchored to the routine (`gate1-fixes`).
  - **What that leaves unreachable:** the Phase 1 Routines list (`/routines`) has no way in from The Point any more. It still works by address, and the heads-up tests use it. A kid reaches the running routine through Keep going and any sticker routine through its slot. A routine that earns no sticker and isn't running can't be started early. Asked as A69.
- **`npm run smoke:seed`** (`scripts/smoke-seed.mjs`): fills in what the phone can't make yet, on a local stack only, for the family of the most recently seen iPad.
  - Routines earn stickers, each kid gets this week's deck with up to six stickers on earlier days, and an "After school" 3:00 moment.
  - `-- --undo` removes it (routines stay sticker routines).
- **kid-ux-tester (kidux):**
  - **Blocking, all fixed:**
    1. The landscape heads-up banner covered 12–19 px (the room is 136 px now).
    2. Hidden modules showed as resting cards.
    3. The My week card was a dead tap in Session mode.
    4. Phase 1's rider picker scrolled with three kids in landscape (one row of three now).
  - **Non-blocking, fixed:** the tag popped on every visit; pre-readers couldn't start a later routine; the pre-reader's invite buttons wrapped; the "?" was 50 px in pre-reader landscape; a finished slot looked empty.
  - **Non-blocking, left:**
    - Slot times say "3:30 pm" (the frame says "3:30").
    - The pre-reader countdown shows the title's first word.
    - The dock icons differ slightly from the frame's.
  - The tester's specs (`slice15-5-kidux-fit`, `slice15-5-kidux-flows`, `helpers/pointqa.ts`) stay in the suite.
- **rls-auditor:** not run. Slice 5 changes no tables, policies, RPCs or write paths: the iPad only reads `checkin_moments`, `kid_decks` and `sticker_awards`, which slice 1's RLS tests cover.
- **Slice 5 gate (2026-10-03):**
  - Lint and typecheck clean; unit 71; pgTAP 4,659 PASS.
  - e2e Phase 1 half: 208 passed (173 project-gated skips, 381 collected).
  - e2e Phase 1.5 half: 105 passed (165 project-gated skips), including the tester's two specs.
  - 0 failed.
  - `slice15-4-ux` asserts in landscape again (`LANDSCAPE_HOME_FIXED = true`), and its "baseline" test now asserts that The Point never scrolls in landscape instead of reporting it.

### Smoke check (🟡 stop here)

About 10 minutes, on the real iPad and phone over Tailscale. App: `http://100.68.253.7:8894` (your `netlify dev`, your dev stack).

0. **Optional, so the sticker slots, deck and invite have something to show:** `npm run smoke:seed` in `deck/`. It touches only the local dev stack, for the family of the iPad you used most recently. Undo: `npm run smoke:seed -- dev --undo`.
1. **Both kids' The Point, on the iPad, in both orientations.**
   - Nothing scrolls.
   - Right now shows what's next.
   - The dock shows Home, My week and Wave Check, with Home lit.
   - The countdown card opens Tour Dates; Home comes back.
   - Tap My week, then Home.
2. **A routine through to the celebration.**
   - Keep going → "I did it!" for each step → the celebration from the bag → back on The Point, with the routine done.
   - With smoke:seed: the slot shows "All done" (stickers are picked in slice 8).
3. **Day and night.**
   - On the phone: Back Office → Devices → the iPad's ground → Day, then Night. The iPad restyles live.
   - After Last Run starts, The Point is night and focus whatever the setting.
4. **A focus mode from the phone.**
   - Phone, Today: the kid's card → Change mode… → Session → Switch in 2 minutes. On the iPad:
     - the heads-up banner sits above the dock and covers nothing;
     - then Session: the "Session time!" still, Right now = Start Session, and a dock of Home, Session, Wave Check.
   - Switch them back to Everything.
5. **The check-in invite (with smoke:seed, after 3:00 pm).**
   - The lilac "How's your wave?" card and the blue Check in tag on the dock.
   - Not now hides both until the next moment.
6. **Reduce Motion on the iPad** (Settings → Accessibility → Motion): the rooster stays still and the morning still has no motion.

Reply with notes, or "continue".

### Smoke check results (2026-10-03)

The parent ran the list on the real iPad and phone: the flows work and nothing broke. Their notes:
1. **A frame-vs-build sheet** for The Point. Built by `e2e/slice15-5-sheet.spec.ts`:
   - 16 built variants beside their nearest B2 frame, with measured sizes.
   - Images and `sheet.json` in `review/screenshots/phase15-slice5-sheet/`.
   - Published as a private page: https://claude.ai/artifact/FKLUgCJws8DNiWdMYUuND6
2. **Landscape doesn't fill the height; the deck floats in My week.** Held for the parent's review of the sheet. Measured: the frames have the same proportions (reader landscape gap 86 px in the frame, 79 built; My week 330 px around a 120 px deck in both).
3. **Pre-reader info cards are large picture cards with one word**, the whole line spoken on tap (`aria-label` too). **Fixed.**
   - "Weather" and "Dinner".
   - The countdown shows its count as a badge on the picture and its kind as the word.
4. **A birthday's word read "Kid".** The countdown word is now the event's kind: Birthday, Trip, Holiday, School; other events use the first word of the title (`countdownWord()`, unit-tested). **Fixed**, plus an e2e test.
5. **Today's stickers didn't show.** Not a bug in The Point: the family's three routines don't earn stickers, and it has no decks, awards or check-in moments, so the seed never ran. The sticker pick doesn't exist before slice 8.
   - The seed couldn't have found the family anyway: no device on any stack had a "last seen" time. **Bug (Phase 1), fixed:** `store.tsx` called `supabase.rpc('device_checkin')` without awaiting it, and supabase-js sends a query only when it's awaited or then'd, so the check-in never left the iPad.
   - New e2e: opening The Point sets "last seen".
   - `smoke:seed` now picks the iPad by the later of "last seen" and "paired".
6. **The dock feels too big.** Held for the sheet. Measured: the frame's dock is taller (133–135 px bar, 94–102 px pill) than the build's (127–129, 88–96); its pills are narrower only because it has six items.

### Resume here after the repo move (2026-10-03)

**Prepared before the move.**
- Everything is committed on `deck/phase-1.5`, apart from the parent's `_shared/auth-overlay.*` (never staged). Nothing is pushed.
- `requirements.txt` exists for `.venv`.
- The 100 iCloud conflict copies are deleted, `.git/index 2` among them.
- The dev, build, kid-ux and parent-ux stacks are stopped, with their data kept. The rls stack has no bind mounts and keeps running.

**After the move, in this order:**
1. **Git identity:** in `~/.gitconfig`, point `[includeIf "gitdir:…/rooster/"]` at the new path. Check that `git config user.email` prints the steppinghen noreply address.
2. **Stacks:** run `supabase start` in `deck/`, then `npm run env:local`, then `npm run agent -- up build` (and `kidux`, `parentux` when their agents run). They come back with their data and mount the new path.
3. **Python:** rebuild the venv, whose scripts hold absolute paths: `rm -rf .venv && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
4. **Claude Code memory:** copy it to the new path (the commands are in the move message).
5. **Check:** `npm run test:unit`, `npm run test:db`, and one e2e spec (`slice15-5-point`) on the build stack.

**Then the approved work, before slice 6:**
1. **The dock (smoke-check note 6, approved as a design change; the frames will be updated to match).** Record it as deviation V17.
   - The bar is about 100 pt for readers and about 116 pt for pre-readers, the same in both orientations.
   - Pills are drawn about 64 pt tall (reader) and 80 pt (pre-reader), with hit areas filling the bar.
   - Pills have a fixed width and don't stretch with fewer items.
   - Keep the slim task dock's own sizes consistent with this.
   - Update `--dock-h` (the heads-up room) and the dock checks in the specs.
   - Rebuild the frame-vs-build sheet (`slice15-5-sheet.spec.ts`) and republish it to the same page.
2. **A68 (full answer, for slice 13):**
   - My look gets "Not you? Switch rider".
   - A kid iPad goes back to the rider picker after 10 minutes with no taps, **on browsing screens only**.
   - It never fires during Lights out, a focus mode (Session included), a celebration, or a routine in progress.
   - It doesn't apply on a single-kid iPad.
3. **Smoke-check note 2 is dropped:** at iPad size with real data the build matches the frames.
4. **Then wait for the parent's go before starting slice 6.**

### Slice 5 must-do (before the smoke check)

- [x] **The landscape checks assert again.** `LANDSCAPE_HOME_FIXED = true` in `e2e/slice15-4-ux.spec.ts`: landscape heads-up never covers controls, the celebration and quiet-ending screens never scroll, kidRules (no scroll) on the heads-up test. The banner sits just above the dock and the screen's content gives up the room (`modes.css`).
- [x] A shared check that the dock's bottom stays on screen (`dockRules` in `e2e/slice15-5-point.spec.ts`, every variant).
- [x] The reader-landscape dock: 96 px items, padded 60 px in from the edges (B2Land).
- [x] Idle and the scene stills on The Point (the hero rooster; stills in the Right now slot).

### Moving the repo out of iCloud (at the smoke-check stop)

Paths that depend on where the repo lives:
1. **`~/.gitconfig`:** `[includeIf "gitdir:~/Documents/GitHub/rooster/"]` points at `~/.gitconfig-rooster` (the steppinghen commit identity). Update it to the new path, or commits use the default identity.
2. **Docker bind mounts:** every stack's Kong mounts `…/supabase/templates/otp.html` (`deck/supabase/` and `deck/.agents/*/supabase/`), and the dev stack's Studio mounts `deck/supabase/snippets`. After the move: `supabase stop` from the old path (or `docker rm` the containers; the volumes keep the data), then `supabase start` and `npm run agent -- up <agent>` from the new path.
3. **Claude Code project memory** is keyed by path: `~/.claude/projects/-Users-steveayers-Documents-GitHub-rooster/` (and `…-rooster-deck`). Copy `memory/` into the new path's project folder.
4. **Inside the repo:** only a sentence in PROGRESS.md. No script or config hardcodes the path.
