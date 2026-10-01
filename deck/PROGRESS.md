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

Next: slice 8 (Tour Dates). The reviewers for 2–4 are still running.
