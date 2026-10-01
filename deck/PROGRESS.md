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

Next: after the pick, delete the unused style, set `ART_STYLE`, then slice 1 (schema and RLS).
