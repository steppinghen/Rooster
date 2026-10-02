# Phase 1.5 Execution Plan

Companion to `CLAUDE.md` and the `docs/` files it points to. The brief says *what*; this file says *in what order, and how much to do without asking*. Scope is everything the brief marks **Phase 1.5**, plus the Phase 1 Gate 1 carry-overs listed below. Nothing from Phase 2 or later: Session (Phase 2) and Tune Shop (Phase 3) are not built, and the dock picker only offers built modules (Coop TV in 1.5).

## Starting point

- Phase 1 is built locally and stopped at its Gate 1 (`deck/phase-1`). It has **not** gone live. Its Gate 1 answers have been applied before this plan starts.
- Work on a new branch, `deck/phase-1.5`, created from the tip of `deck/phase-1`.
- **Phase 1 and Phase 1.5 go live together** at this plan's Gate 2. There is no separate Phase 1 deploy.
- If `LESSONS.md` exists, read it before slice 0 and apply what it says to this run.
- Local only, fake data. Seed and test data use **Kid A / Kid B / Kid C** and **Parent A / Parent B** only. Kid C exists to prove three kids work everywhere.

## Lessons from Phase 1, applied here

From `LESSONS.md`. These are rules for this run, not suggestions.

- **Settle contradictions before building.** Slice 0 includes a brief audit (below). Nothing is built on a contradiction.
- **Test where the parent tests.** From slice 0, every browser test and every agent run uses the Tailscale origin over plain http (`http://100.68.253.7:8894`), not `localhost`. No feature depends on a secure-context-only browser API without a working fallback on that origin; list every such API in `REVIEW.md`.
- **Each agent gets its own database.** The builder, `rls-auditor`, `kid-ux-tester` and `parent-ux-tester` each run against their own local database created from the migrated template (for example `createdb -T`), never the shared dev database.
- **Review every slice.** Agents run at the end of every slice they cover. No batching across slices (Phase 1 deviation D4 is not repeated).
- **One way to seed.** Tests create rows only through the shared seed and fixture helpers, never with ad hoc SQL inserts, so hardening the schema means updating one place.
- **No PostgREST upserts on tables with column grants.** Use explicit insert or update, or an RPC.
- **Survive a reload.** iOS reloads the app when it's switched away. Every multi-step flow (My look, the sticker pick and "pick waiting", Wave Check, the kitchen hub unlock, the routine editor, the event kid layer) resumes correctly after a reload mid-flow, and both UX testers check it.
- **Delete family stays complete.** Every new table, scheduled job, stored secret (calendar feed URLs) and Realtime channel is covered by "Delete family", and `rls-auditor` proves it.
- **Long runs.** Background processes stop after about 2 hours: restart the dev server as needed, and split long suites rather than letting them time out.

## How this round runs

Build all of Phase 1.5 locally, start to finish, without stopping between slices. Security comes from the adversarial tests and the reviewer agents on every slice, plus one parent review at the end.

The parent is needed at two gates, plus one short smoke check:

- **🛑 Gate 1 — Review (end of slice 16).** Everything is built and tested locally. Stop and hand over `REVIEW.md` (Phase 1.5 sections added on top of Phase 1's) and the device test list.
- **🟡 Smoke check (end of slice 5).** Stop once The Point is built on the new theme, art and scenes. The parent spends about 10 minutes on the real iPad and phone over Tailscale, using a short list in `PROGRESS.md`, and replies with notes or "continue". This is the real-device check Phase 1 lacked; it is not a review.
- **🛑 Gate 2 — Go live (both phases).** After the parent approves Gate 1 and has set up the hosted Supabase project, its auth settings and the Netlify env vars. **The parent runs `supabase link`, `supabase db push` and the Netlify deploy himself.** Claude Code gives the exact command for each step and verifies the result. The deny list in `.claude/settings.json` stays as it is.

Also stop immediately, outside the gates, if:

- a locked decision looks wrong, or a requirement in the brief can't be met as written;
- the work needs a schema change that isn't in the brief's data model (everything there is approved);
- the work would touch anything outside `rooster/deck/` (other apps, the shared rooster Supabase project, root config);
- anything would leave the Mac: a remote Supabase project, a deploy, a push to `main`, or a third-party service other than the two this phase uses (Open-Meteo, and fetching the family's own calendar feed URLs);
- a reviewer agent reports a blocking issue the builder can't fix in two attempts.

## Working rules for Claude Code

- Same as Phase 1: work slice by slice; each slice ends with all tests passing, the agents run with no open blocking findings, `SETUP.md` updated, a commit on `deck/phase-1.5`, and an entry in `PROGRESS.md`. Then continue.
- Anything marked **→ REVIEW.md** is security-sensitive: build it, test it, and write it up in `REVIEW.md` (what it does, the exact SQL or code, how it's tested, the trade-off).
- Open questions that aren't blocking go into `REVIEW.md` with the default chosen, not into a stop.
- **Frames are the visual spec, the brief is the behavior spec.** Each slice names its canvas frames in `design/canvas/`. Build the layout the frame shows and the behavior the brief describes. Where they disagree, the brief wins on behavior and the frame wins on layout; record it in `REVIEW.md` as a deviation, not a stop, unless it changes data or security.
- Frames are templated HTML (`{{holes}}`, `data-props` for the variants). Read them as markup; the values in `renderVals()` show each variant's content. The parent reviews them visually on the canvas.
- **Write every screen once.** Ground (`data-ground="day|night"`), volume (`data-volume="normal|focus"`) and parent light mode are root attributes with tokens scoped under them, never per-screen copies.
- **Art comes only from the export script** (`docs/` art spec). No hand-drawn or hand-edited SVG inside components.
- Tests stub `speechSynthesis` and audio with a silent fake that records what would have been spoken, and assert on it.
- The parent handles all credentials. Never ask for hosted keys in chat.

## Agents

The three Phase 1 agents in `.claude/agents/`, with these additions, plus a new fourth agent, `parent-ux-tester` (its file is handed over with this plan):

| Agent | Add for 1.5 |
|---|---|
| `rls-auditor` | Every new table and RPC, with extra attacks on: the kid-side look RPC (can it write anything but avatar and accent, or another family's kid?), the display unlock (PIN guessing, an expired or ended unlock, phone-only actions while unlocked), calendar feed URLs (never readable by any client), and `sticker_awards` (can a device place a sticker it wasn't offered, or exceed four a day?). |
| `kid-ux-tester` | Check, on every kid screen it touches: both grounds; both volumes (focus has no halftone, tilt, marker lettering or offset headline, and the accent appears only as small indicators); reader and pre-reader; portrait and landscape; two and three kids; one active dock item, the right dock (full, slim or none); no red, no counts of anything missed, no sibling comparison; Reduce Motion shows the still and the text; touch targets at least 44 px; **no kid screen scrolls** at iPad portrait or landscape, and no primary action (a routine step, "I did it!", Wave Check, Next) is ever below the fold; holiday accents only on The Point, My week and Tour Dates. |
| `parent-ux-tester` (new) | After any slice with parent screens (6, 10, 12, 14, 15). Runs Playwright in WebKit at iPhone sizes and the kitchen hub's iPad landscape, and reports findings without changing app code. See `.claude/agents/parent-ux-tester.md` for its checklist. |
| `phase-reviewer` | Compare against the Phase 1.5 sections of the brief and this plan's acceptance checklist. |

## Gate 1 carry-overs from Phase 1

- **X9 / Q18:** the heads-up speaks automatically for pre-readers once a voice has been unlocked by a tap (slice 4).
- **X11:** the per-device sound switch is now the Device page's Sound setting (slice 14).
- **Q9:** superseded. Kid visibility now comes from each calendar's kid default and the event's kid layer (slice 10).
- **D7:** mascot transitions are replaced by the scene system (slice 4).
- **X5, X10:** still Phase 2.

## Slices

### 0. Setup
Create `deck/phase-1.5` from `deck/phase-1`. Replace `CLAUDE.md` and add `docs/` from the new brief (as handed over). Copy the canvas frames into `design/canvas/` (the `.dc.html` files only). Add this plan as `PHASE15_PLAN.md` and the new agent as `.claude/agents/parent-ux-tester.md`; give the existing agents their 1.5 additions from the table above. Start the Phase 1.5 section of `PROGRESS.md`. Set up the per-agent databases and point every test and agent at the Tailscale origin.

**Brief audit (part of slice 0).** Read `CLAUDE.md` and all of `docs/` against this plan and the frames. List every contradiction, every hosted Supabase or Netlify setting the 1.5 features depend on, and anything that can't be built as written. Put them in `REVIEW.md` as questions with the default you'd take. Stop and show the list; the parent answers before slice 1.

### 1. Schema 1.5 → REVIEW.md
Migrations for every 1.5 item in the data model: `families.settings`; the new `kids`, `parents`, `devices`, `routines` (step kind and who) and `events` fields (school kind, calendar_id, external_uid, kid_visibility, countdown); `calendars` (migrating any `calendar_sources` rows), `device_calendars`, `parent_calendar_prefs`, `checkin_moments`, `meals`, `dinner_plan`, `weather_cache`, `kid_decks`, `sticker_awards`, `display_unlocks`. RLS on all of them, pgTAP for each policy, and seed data for Kid A, Kid B and Kid C.

### 2. Theme and core components
Tokens for day and night × normal and focus, and the parent tokens with the Night/Day ground. Components: the die-cut sticker (size classes `lg`, `md`, `sm`; tilt only in normal volume), the kid header (marker greeting, offset headline, avatar on the seasonal sun or holiday circle, the permanent sky band), and the ink dock (full, slim and none; the active item filled in normal volume and ringed in focus; the check-in and to-do tags). Update the styleguide page to show all of them in every combination.
Frames: any B2 frame for the header and dock; `Phase15PointB2Focus.dc.html` for focus volume.

### 3. Art pipeline
`scripts/export-art` and its checks (every label found once, both dogs complete, no halftone in `md` or `sm`), the contact sheet at `design/export-preview.html`, `scripts/build-sprite` for the Fluent files in use, `ASSETS.md` entries, and the mascot resolver (Mara or Costa by quarter or the parent's pin; winter poses from the winter dates).

### 4. Scene system and motion
The stepped flipbook engine, then every animation in the art spec: the celebration bag of seven (shuffled, all seven before a repeat, no back-to-back across bags, tap to skip), sticker earned (paw slap, entering from the side that keeps the dog on screen), the quiet reveal at the end of Last Run, the heads-up (eight chunks over the real 2:00, auto-spoken for pre-readers after the first tap), Lights out (stars, or snow in winter), idle, the breathing wave, trim entrances, and dock tag pops. Reduce Motion stills for each. Morning, Session starts and Last Run ship as their stills plus the line.

### 5. The Point (layout B2), then the smoke check
Reader portrait and landscape, pre-reader landscape, and focus volume for both. Right now with its states (routine, Wave Check invite at an open check-in moment, assigned work); Today's stickers; My week with the full-size deck; the three info cards as fixed slots (weather, dinner, countdown); the dock with its markers. Pre-reader portrait is not drawn: stack the two landscape columns, and record it in `REVIEW.md`. Then write the smoke-check list in `PROGRESS.md` (both kids' The Point, a routine to a celebration and sticker, day and night, a focus mode switched from the phone) and stop for the 🟡 smoke check.
Frames: `Phase15PointB2.dc.html`, `Phase15PointB2Land.dc.html`, `Phase15PointB2Focus.dc.html`, `Phase15PointB2Pre.dc.html`, `Phase15PointB2PreFocus.dc.html`.

### 6. Routines 1.5
Routine checklist (per-step who, the Wave Check step, finish-by countdown for bus or car, the four-a-day sticker cap) and the routine editor on the phone.
Frames: `Phase15RoutineDay.dc.html`, `Phase15RoutineNight.dc.html`, `Phase15RoutineEditor.dc.html`.

### 7. Wave Check and breathing
Wave Check with the surf pictures beside the faces, and the breathing wave with the floating turtle.
Frames: `Phase15WaveCheckDay.dc.html`, `Phase15WaveCheckNight.dc.html`, `Phase15BreatheDay.dc.html`, `Phase15BreatheNight.dc.html`.

### 8. Stickers and decks → REVIEW.md
Weekly decks (36 designs as parametric templates; the rotation rules, seasonal lean and three rerolls), Sticker variety and the three-sticker offer, the pick screen and "pick waiting", placement (scored random spot with saved x, y, size and tilt), the celebration flow end to end, My week, My stickers and My old decks. The award write path goes in `REVIEW.md`.
Frames: `Phase15CelebrateDay.dc.html`, `Phase15CelebrateNight.dc.html`, `Phase15MyWeek.dc.html`, `Phase15Collection.dc.html`, `Phase15OldDecks.dc.html`; art on the Stickers & decks page.

### 9. Holidays
Windows (14 days before through the day), trims and circles in the sky band on browsing screens only (never on task screens, celebrations or in focus volume), holiday decks and stickers, the faith lead-ins at Christmas and Easter, birthdays (the birthday kid only, a birthday beats a holiday, the nearer date wins), and the winter trim.
Frames: the Halloween and Christmas B2 frames; Holiday trims v3 and the Holiday kit.

### 10. Calendar → REVIEW.md
A scheduled server function that fetches each feed (whole calendar, read-only; feed URLs are secrets and never reach a client), the kid visibility rules (Family shown, Grandma's hidden, work never on kid iPads, Busy on displays), private and busy blocks on shared screens, the phone Calendar tab, the event detail with the kid layer editor, Manage calendars with the Apple and Google how-to, and Tour Dates (Countdowns, Months, and the kid calendar grid for readers).
Frames: `Phase15Calendar.dc.html`, `Phase15CalendarEvent.dc.html`, `Phase15EventEditor.dc.html`, `Phase15ManageCalendars.dc.html`, `Phase15TourDatesDay.dc.html`, `Phase15TourDatesNight.dc.html`, `Phase15TourDatesGrid.dc.html`.

### 11. Surf Report and Snow Report → REVIEW.md
A scheduled function that writes `weather_cache` from Open-Meteo about hourly; kid screens hide the weather when the cache is more than about 12 hours old. The deterministic tip with the parent-set thresholds, the reader and pre-reader screens, the Snow Report from the winter start date, and the attribution line.
Frames: `Phase15SurfReportDay.dc.html`, `Phase15GetDressed.dc.html`; art on the Weather & art page.

### 12. Snack Shack
Meals and the dinner plan, Snack Shack on the phone, the kitchen hub's Dinners view, the kid "this week's dinners" view, and The Point's dinner card. Kids never see the options being weighed for an undecided night.
Frames: `Phase15SnackShack.dc.html`, `Phase15KitchenMenu.dc.html`, `Phase15DinnersDay.dc.html`, `Phase15DinnersPre.dc.html`.

### 13. My look → REVIEW.md
Reader and pre-reader flows with the slim task dock, the narrow RPC that writes only avatar and accent, and the parent switch and override.
Frames: `Phase15MyLookDay.dc.html`, `Phase15MyLookNight.dc.html`.

### 14. Parent phone
The four tabs (Today, Calendar, Kids, Back Office); Parent Today; the Kids tab; Kid settings (look, dock picker with reach labels, volume, check-in moments, PIN); the Back Office root and its drill-ins (Holiday accents, Seasons and dog, Surf Report tips); the Device page (job, calendars, start view, parent unlock and re-lock time, day and night, sound, read-aloud, dim at Lights out); Parents and data; and parent light mode on every parent screen.
Frames: `Phase15ParentToday.dc.html`, `Phase15Kids.dc.html`, `Phase15BackOffice.dc.html`, `Phase15BackOfficeKid.dc.html`, `Phase15DeviceKitchen.dc.html`, `Phase15BOHolidays.dc.html`, `Phase15BOSeasons.dc.html`, `Phase15BOTips.dc.html`.

### 15. Kitchen hub → REVIEW.md
Today, Calendar and Dinners; the start view and "go back to it" after 5 minutes idle; the parent unlock (pick S or J, 6-digit parent PIN, a server-side unlock with lockout and expiry); parent mode with Kids and Back Office in two panes; phone-only items tagged Phone with the QR handoff; lock on demand or after 2 minutes idle.
Frames: `Phase15KitchenHub.dc.html`, `Phase15KitchenCalendar.dc.html`, `Phase15KitchenMenu.dc.html`, `Phase15KitchenParent.dc.html`.

### 16. Review packet, then Gate 1
Include the Phase 1 TOTP fix (`ec004db`) in the device test list: the parent retests it here. Run `phase-reviewer`, finish the Phase 1.5 sections of `REVIEW.md`, update the device test list (Part A local, Part B on production at go-live with a test family), and update the Gate 2 checklist for both phases. Stop at **Gate 1**.

### 17. Go live (after Gate 2 approval only)
With the parent running the commands: link the hosted project, push migrations, set the scheduled functions (calendar sync, weather), deploy `rooster-deck`, and rerun the acceptance checklist on production with a test family that is deleted before real data goes in.

## Phase 1.5 acceptance checklist

1. Every kid screen renders correctly in day and night, normal and focus, reader and pre-reader, portrait and landscape, with two and three kids, and fits the iPad with no scrolling in both orientations (the Phase 1 device-test bug).
2. Changing a kid's default volume or focus mode on the phone restyles their iPad live, without a reload.
3. A completed sticker routine plays a celebration from the bag, offers three stickers, and the season's dog slaps the chosen one onto the deck at a saved spot; reopening My week shows it in the same place.
4. A fifth sticker routine in a day earns no sticker and shows nothing that reads as missed.
5. The end of Last Run plays the quiet reveal and hands off to Lights out.
6. In a holiday window, the trim and circle show on The Point, My week and Tour Dates only, and never in focus volume.
7. A Grandma's calendar event stays off kid iPads until a parent shows it; a work event never appears on a kid iPad; displays show Busy or Title as set per calendar.
8. A feed URL cannot be read by any client, including a parent session.
9. Weather older than about 12 hours disappears from kid screens; the tip matches the deterministic rules.
10. A kid can change only their own avatar and color, and only when "Can change their look" is on.
11. The kitchen hub's parent unlock locks out after repeated wrong PINs, expires on time, and never allows the phone-only actions.
12. Reduce Motion replaces every animation with its still and text.

## Gate 2 additions for 1.5

- Scheduled functions for calendar sync and weather, with their schedules.
- How feed URLs are stored server-side (never in a client-readable column or env var exposed to the browser).
- Open-Meteo needs no key; confirm its current terms and the attribution before going live.
- The open Netlify team question from Phase 1 (`rooster-nc` or `steppinghen`) is settled before the site is created.
