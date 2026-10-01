# Phase 1 Execution Plan

Companion to `CLAUDE.md` (the build brief). The brief says *what*; this file says *in what order, and how much to do without asking*. Scope is the brief's **Phase 1: Foundation + first modules** and nothing else.

## How this round runs

Build all of Phase 1 **locally**, start to finish, without stopping between slices. Everything runs against the local Supabase stack on the Mac, with fake data, so nothing real can be harmed. Security comes from automated adversarial tests and independent reviewer agents on every slice, plus one full parent review at the end, instead of approval at each step.

The parent is needed at exactly two gates:

- **🛑 Gate 1 — Review (end of slice 12).** Everything is built and tested locally. Stop and hand over `REVIEW.md` and the device test list. The parent reviews migrations, policies, and RPCs in one pass and tests on the phone and iPad over Tailscale.
- **🛑 Gate 2 — Go live.** After the parent approves Gate 1 and has created the hosted Supabase project, set its auth settings, and added env vars in Netlify, link the project, push migrations, and deploy.

Also stop immediately, outside the gates, if:

- a locked decision below looks wrong or a requirement in `CLAUDE.md` can't be met as written;
- the work would touch anything outside `rooster/deck/` (other apps, the shared rooster Supabase project, root config beyond adding this app's port);
- anything would leave the Mac: a remote Supabase project, a deploy, a push to `main`, a third-party service;
- a reviewer agent reports a blocking issue the builder can't fix in two attempts.
- slice 0 is done: stop for the emoji style pick (see slice 0).

## Working rules for Claude Code

- Work slice by slice, top to bottom. Each slice ends with: all tests passing, both reviewer agents run with no open blocking findings, `SETUP.md` updated, a commit on branch `deck/phase-1`, and an entry in `PROGRESS.md`. Then continue to the next slice.
- Anything marked **→ REVIEW.md** is security-sensitive: build it, test it, and add it to `REVIEW.md` (what it does, the exact SQL or code, how it's tested, and any trade-off) so the parent reviews it at Gate 1.
- The parent handles all credentials. Local development uses only the keys the Supabase CLI generates. Never ask for hosted keys in chat; at Gate 2, list which env vars to set and where.
- Seed and test data use **Kid A / Kid B / Parent A / Parent B** only.
- `PROGRESS.md` is the session handoff: after each slice, record what was built, decisions made, open questions, and the next slice. If a session ends or context compacts, start by reading `CLAUDE.md`, this file, and `PROGRESS.md`, then continue from the next unfinished slice.
- Open questions that aren't blocking go into `REVIEW.md` with the default chosen, not into a stop.

## Agents

Three project subagents live in `.claude/agents/`. The builder (main session) writes the code; the agents check it independently. They report findings and write tests; they don't change app code.

| Agent | When | What it does |
|---|---|---|
| `rls-auditor` | After any slice that adds or changes tables, policies, RPCs, or scheduled jobs | Reads the migrations cold and writes adversarial pgTAP tests acting as a device, a kid, a parent from another family, and an anonymous user. Reports blocking and non-blocking findings |
| `kid-ux-tester` | After any slice with screens | Runs Playwright in WebKit with iPad and iPhone viewports through the slice's flows. Checks the brief's Kid UX rules (tap target sizes, no scrolling on kid home, one task per screen, Home one tap away, Wave Check reachable in every mode, reduced motion, light and dark) and saves screenshots to `review/screenshots/` |
| `phase-reviewer` | Once, in slice 12 | Compares what was built against `CLAUDE.md` Phase 1 and this plan, and finishes `REVIEW.md`: gaps, deviations, everything marked → REVIEW.md, open questions, and the device test list |

Playwright can't cover everything real devices do (installed-PWA storage, Realtime on a sleeping iPad, Guided Access). Those go on the device test list for Gate 1.

## Locked decisions (push back before slice 0 if any look wrong)

| Decision | Default |
|---|---|
| Location | `rooster/deck/` in the rooster monorepo |
| Hosting | Netlify, site `rooster-deck`; dev port **8894** bound to `0.0.0.0` (add to `netlify.toml`, same pattern as the other rooster apps) |
| Frontend | Vite + React + TypeScript PWA, per the brief |
| Database | Its own Supabase project, **not** the shared rooster project. Display name is a placeholder ("household") until the naming decision lands; the display name can change later |
| Local dev | Supabase CLI local stack. All migrations and RLS tests run locally first; the remote project is touched only at the go-live gate |
| RLS tests | pgTAP via `supabase test db` |
| Parent auth (Phase 1) | Email **one-time code**, not a magic link: links open in Safari instead of the installed PWA, which has separate storage on iOS, so the session lands in the wrong place. Use `signInWithOtp` + `verifyOtp` (type `email`), with the email template sending `{{ .Token }}` and no link. Plus TOTP MFA for both parents. Google and Sign in with Apple are deferred (Apple needs a paid developer account) |
| Fonts and art | Self-hosted only, no Google Fonts links: Archivo Black, Archivo, Permanent Marker, and Lexend for reading text. Record each license in `ASSETS.md`. Vendor only the Fluent Emoji 3D files actually used (MIT, keep the license file) |
| Look and feel | The Comic Shop direction in `CLAUDE.md`, with the mockups in `design/reference/` as the visual target. `CLAUDE.md` wins where they disagree |
| Tenancy | Every family-owned row carries `family_id`; policies key off it |

## Slices

### 0. Scaffold
Vite + React + TS app in `rooster/deck/`, PWA manifest and service worker shell, `netlify.toml` dev block, `.env.example`, `SETUP.md`, `PROGRESS.md`, lint and typecheck scripts, Playwright with WebKit installed, the Supabase CLI local stack running (if Docker isn't installed, stop and tell the parent; that's the one install that may need hands).
Also build the design foundation here, before any feature screens: render every file in `design/reference/` to PNG, then create the token set from `CLAUDE.md`, self-hosted fonts, the `data-volume="normal|focus"` root theme, and base components (ink panel, pressable button, sticker, cream task card, burst, avatar chip, nav rail and tab bar). Add a `/styleguide` page that shows every component at both volume levels, in light and dark, on iPhone and iPad sizes. Include the **flat vs. 3D emoji test** from `CLAUDE.md` on the styleguide page (rooster, turtle, the four Wave Check faces, two routine icons, both styles, both volume levels). This is the one mid-build stop: after slice 0, pause and ask the parent to pick a style before any feature screen uses art. Build both grounds from `CLAUDE.md` ("Day and night grounds"): a `data-ground="day|night"` root attribute alongside `data-volume`, with the day tokens, and the styleguide showing every component on both grounds at both volumes. The day mockups in `design/reference/` are the target.
Ground switching (Auto, Day, Night, Follow device; Auto follows the family's routine times; Last Run and Lights out always night) is built in slice 7 with routines, since Auto depends on routine times. Until then, the styleguide has a manual toggle. Configure the local Supabase API URL to use the Mac's Tailscale IP so the iPad can reach it, not just the Mac.

### 1. Schema and RLS
Migrations for the Phase 1 tables only: `families`, `parents`, `kids`, `devices`, `pairing_codes`, `routines`, `routine_completions`, `events`, `feelings_checkins`, `reset_plans`, `family_modules`, `kid_focus`, `usage_events`. RLS on every table. A `role` helper distinguishes parent sessions from device sessions.
pgTAP tests must prove, at minimum: a device cannot write parent-only tables or change focus modes; a device cannot read another family's rows; a parent cannot read another family's rows; kids' PIN hashes are never readable from a device session; feelings rows are not readable by a device other than for the kid's own current check-in.

### 2. Parent auth, family setup, add kids
Email code sign-in (locally, codes arrive in the Supabase CLI's local mail viewer, so no real email is needed; enter email, then type the 6-digit code inside the app; no links anywhere in the flow), TOTP enrollment, create a family, invite the second parent (no invite link: Parent A adds Parent B's email, and Parent B joins the family the first time they sign in with an email code), add kids (nickname, avatar, age band, default volume, birthday month and day, optional PIN).
→ **REVIEW.md:** list the auth settings the parent must apply in the hosted Supabase dashboard at go-live (email OTP template using `{{ .Token }}` with the link removed, OTP length and expiry, MFA, rate limits). List them; don't guess them.

### 3. Device pairing and revocation
Parent generates a 10-minute, single-use code; the iPad signs in anonymously and redeems it through a security-definer RPC that links the device to the family with the device role. Parent can revoke from the phone; a revoked device loses access on its next request.
→ **REVIEW.md:** the pairing RPC (new write path).

### 4. Kid profile picker and PIN
Avatar picker on the iPad. PIN check happens in an RPC (hash compare server-side), never by reading the hash.
→ **REVIEW.md:** the PIN RPC.

### 5. Module registry and kid home
`family_modules` drives navigation; nothing is hardcoded. The kid home answers "what's next for me right now" before showing tiles. Age-band layouts (pre-reader: huge picture tiles and audio; reader: text-forward). Match `design/reference/iPadGromZone.html` and `GromZone.html`; the "up next" slot shows the next routine step. Offline cache of the last-known state. Minimal `usage_events` logger (module opened, activity completed), no summaries yet.

### 6. Family export and delete
Export everything as a zip (full JSON dump, CSVs for human-readable tables); "Delete family" full wipe with typed confirmation. Built now because the brief says it's cheap now and miserable later.
→ **REVIEW.md:** the deletion path and its test (destructive).

### 7. Routines (Dawn Patrol and Last Run)
Morning, after-school, and bedtime routines with picture steps and read-aloud via the Web Speech API. Completions recorded per kid per day. Wire the device ground setting (`devices.ground`) and the Auto rule here, with a ground picker in Back Office.

### 8. Tour Dates: countdowns and month view
"How many sleeps until…" for events marked kid-visible, plus a simple month calendar on the parent side.

### 9. Wave Check
Check-ins at routine moments using the surf-word scale in `CLAUDE.md` (Pumping, Rolling, Flat, Choppy, each with a face and the plain feeling word, spoken aloud), the reset plan builder, and balloon breathing. Match `iPadWaveCheck.html` and, inside Last Run, `iPadLastRun.html`. Always reachable regardless of focus mode. Auto-delete check-ins older than 30 days.
→ **REVIEW.md:** the scheduled job (pg_cron) and its SQL.

### 10. Focus modes
Everything, Session (learning), and Lights out, per kid or whole family, with optional duration, a 2-minute heads-up with a visual timer, and "switch now." Pushed via Supabase Realtime, re-read on launch, fail closed when offline. The mode and the kid's default volume together drive `data-volume` (the quieter of the two wins; celebrations always use normal styling unless reduced motion is on): focus modes switch the whole app to focus styling (see `iPadGromZoneFocus.html`, without its dimmed "Later" row). When a timed session ends, show the celebration burst (`Shred.html`). Phase 1 Session mode shows a placeholder learning tile; real content is Phase 2.
→ **REVIEW.md:** the write policy on `kid_focus` (parents only).

### 11. Parent dashboard
Today at a glance per kid: routine progress, upcoming countdowns, latest check-in (parent-only), current focus mode, and a mode switcher. Phone layout from `Main.html`; on iPad landscape, use `iPadHub.html` as the layout reference.

### 12. Review packet
Write the Guided Access and Screen Time section of `SETUP.md`. Run `phase-reviewer`, finish `REVIEW.md`, then stop at **Gate 1**.

### 13. Go live (after Gate 2 approval only)
Link the hosted Supabase project, `supabase db push`, deploy `rooster-deck` to Netlify, and rerun the acceptance checklist against production.

## Phase 1 acceptance checklist

- Both parents can sign in from the home-screen PWA using an email code, without ever leaving the app, and see the same family with MFA on.
- An iPad pairs with a code, survives a reboot without re-pairing, and stops working within one request after revocation.
- A kid with a PIN can't be opened by the sibling.
- From the phone, switching a kid to Lights out changes that iPad within a few seconds, after a 2-minute heads-up unless "switch now" was used. Reloading the iPad doesn't escape the mode. Airplane mode keeps the last mode.
- Wave Check is reachable in every mode.
- The export zip opens and contains every table.
- All pgTAP tests pass; no secrets in git history.

## Out of scope for this round

Session learning content (Phase 2), including school curriculum alignment; chores, Sticker Wall, and the shared jar (Phase 3); calendar aggregation; Coop TV tile; usage snapshot summaries; anything under "Parked ideas" in the brief.
