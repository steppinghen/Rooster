# The Deck: Family Hub Build Brief

Hand this file to Claude Code at the start of the project (save it as `CLAUDE.md` in the repo root). It describes what to build, for whom, and the rules the build must follow.

## Name and sections

The app is called **The Deck**, with a 1990s–2000s surf, skate, and snowboard shop vibe. Sections use board-shop names:

| Section      | What it is                                                                   |
|--------------|------------------------------------------------------------------------------|
| Grom Zone    | The kids' space ("grom" = young surfer or skater)                            |
| Session      | Learning mode and learning activities                                        |
| Dawn Patrol  | Morning routine                                                              |
| Last Run     | Wind-down and bedtime routine                                                |
| Wave Check   | Feelings check-ins                                                           |
| Sticker Wall | Chore rewards: kids earn stickers instead of plain points                    |
| Tune Shop    | Chores                                                                       |
| Snack Shack  | Menus and dinner plans                                                       |
| Supply Run   | Grocery, errand, and packing lists                                           |
| Tour Dates   | Family calendar, events, and kids' countdowns                                |
| Locals Board | Household notes                                                              |
| Back Office  | Parents-only dashboard and settings                                          |
| Team Riders  | Kid profiles; each kid's avatar is their own custom "pro model" deck graphic |

Avoid real brand names and trademarks (e.g., Tony Hawk, Birdhouse, Pro Skater, Woodward). The vibe is fair game; the names are not.

## What we're building

A private family web app, installable on iPhone and iPad from Safari ("Add to Home Screen"), that works as the household's home base. One parent manages everything from a phone. Kids use shared iPads that are set up once and never need configuring again.

The family includes two kids, ages 5 and 7. Their needs are different, so kid-facing screens must be designed per age band, not "for kids" in general:

- **5-year-old (pre-reader):** everything works by picture and audio. Huge targets, one task per screen, spoken instructions.
- **7-year-old (beginning reader):** text-forward with audio as an option. Must not look babyish; kids this age reject content that looks like it's for younger children.

## Who uses it

| Role                                                         | Device             | Can do                                                                                                                                          |
|--------------------------------------------------------------|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Parent (admin, up to two parents, each with their own login) | Phone, any browser | Everything: set up kids, routines, chores, events, learning; approve chores; view feelings history; pair/unpair devices; export and delete data |
| Kid                                                          | Paired iPad        | Pick own profile, follow routines, check off chores, see countdowns, do learning activities, feelings check-ins                                 |
| Paired device                                                | iPad               | Stays signed in; has no parent powers at all                                                                                                    |

## Security and privacy requirements (non-negotiable)

1.  **Parent auth:** Supabase Auth with Sign in with Apple and/or Google, or email + passkey. Require 2FA where the provider supports it.
2.  **Device pairing:** Parent generates a short-lived (10-minute), single-use pairing code on the phone. The iPad enters it and receives its own device identity (Supabase anonymous auth user) linked to the family with a `device` role. Parent can revoke any device from the phone.
3.  **Enforce permissions in the database, not the UI.** Every table uses Postgres Row Level Security. A device session can only read and write its own family's kid-facing data and can never perform parent actions. A "parent lock" screen on the iPad is a convenience, not the protection.
4.  **Kid profiles:** No passwords. Kids tap their avatar. An optional 4-digit PIN (stored hashed) keeps siblings out of each other's profiles.
5.  **Data minimization:** Nicknames only. No last names, school names, exact birth years, or photos of the kids in v1. Birthdays are stored as month and day for countdowns.
6.  **Feelings data:** Visible to parents only (kids see only their own current check-in). Auto-delete check-ins after 30 days via a scheduled job. No scores, points, or rewards attached to feelings.
7.  **No third parties:** No ads, analytics, trackers, or external fonts or scripts beyond what's self-hosted. No data leaves Supabase and the app host.
8.  **Secrets:** Never commit keys. Use environment variables and a `.env.example` with placeholders. Only the Supabase anon key ships to the browser.
9.  **Parent controls:** "Export all family data" and "Delete family" (full wipe) in parent settings. The export is a single zip: a full JSON dump of every table, CSVs for the human-readable tables (chores, calendar, money ledger, learning progress), and any uploaded files alongside. It must be good enough to rebuild the app from. Build it early; it is cheap now and miserable to retrofit.
10. **Placeholders only during development:** Seed data uses fake names ("Kid A", "Kid B"). Real family data is entered by the parent in the live app, never in code, prompts, or commits.

## Tech stack

- **Frontend:** Vite + React + TypeScript, installable PWA (manifest + service worker; the kid-facing parts work offline and sync when back online).
- **Backend:** Supabase (Auth, Postgres with RLS, scheduled functions). The free tier is enough for one family.
- **Hosting:** Vercel or Netlify, free tier, custom domain optional.
- **Speech:** Browser Web Speech API for read-aloud (on-device, no external service).

## Data model (starting point)

- `families`: id, name, created_at
- `parents`: user_id → family_id
- `kids`: id, family_id, nickname, avatar, age_band (`prereader` \| `reader`), default_volume (`normal` \| `focus`), pin_hash (nullable), birthday_month, birthday_day
- `devices`: id, family_id, device_user_id, label, paired_at, revoked_at, ground (`auto` \| `day` \| `night` \| `device`; parents' phones keep their own choice locally)
- `pairing_codes`: code_hash, family_id, expires_at, used_at
- `routines`: id, family_id, kid_id (nullable = everyone), name, time_of_day, steps (ordered, each with text + icon)
- `routine_completions`: routine_id, kid_id, date, completed_steps
- `chores`: id, family_id, kid_id, title, icon, points, repeat rule
- `chore_completions`: chore_id, kid_id, date, status (`done` \| `approved`)
- `events`: id, family_id, title, icon, date, kind (`birthday` \| `holiday` \| `trip` \| `other`), visible_to_kids
- `feelings_checkins`: id, kid_id, feeling, size (0–4), created_at (30-day retention)
- `reset_plans`: kid_id, body_signs\[\], tools\[\]
- `learning_progress`: kid_id, activity_id, item_id, status (`missed` \| `mastered`), updated_at
- `favorites`: kid_id, activity_id
- `family_modules`: family_id, module_key, enabled, settings (json)
- `kid_focus`: kid_id, mode, started_at, ends_at (focus mode is per kid, not per family)
- `access_holds`: id, kid_id, module_key, reason (optional, parent-only), starts_at, ends_at, created_by
- `chore_weights`: chore_id, kid_id, weight (how much a task counts toward a shared goal for that kid)
- `shared_goals`: id, family_id, title, reward, target, kid_ids\[\], starts_at, ends_at, status
- `goal_contributions`: goal_id, kid_id, source (chore_completion id or manual), amount, created_at
- `money_accounts`: kid_id, balance_cents (a mirror of the real piggy bank, not a bank)
- `money_ledger`: id, kid_id, amount_cents, kind (`earned` \| `spent` \| `gift` \| `saved` \| `adjust`), note, created_by, created_at
- `savings_goals`: id, kid_id, title, target_cents, event_id (nullable, links to a countdown)
- `calendar_sources`: id, family_id, owner_parent_id, provider (`apple` \| `google`), label, visibility_default
- `lesson_packs`: id, kid_id, title, focus_skill, source_note, status (`draft` \| `approved` \| `archived`), content (json), approved_by, approved_at
- `usage_events`: id, family_id, kid_id (nullable for parent use), module_key, action (`opened` \| `completed` \| `abandoned` \| `skipped`), target_id (nullable, e.g. activity or chore id), duration_ms (nullable), created_at (90-day retention, then rolled into monthly aggregates)

## Usage snapshots (how the app tells us what is working)

The app writes a `usage_events` row whenever a module is opened, an activity is completed, or something is abandoned part-way. No content is stored, only what was touched and for how long. Rows are kept for 90 days and then rolled into monthly aggregates.

Once a month the parent can export a **usage snapshot**: a short, plain-language summary of what was actually used, what was never opened, where kids dropped out part-way, and which lessons dragged. It is a file the parent can read in a minute, not a dashboard.

That snapshot is the input to a review conversation: the parent brings it to a chat, the changes are worked out together, and the parent hands the result to Claude Code. **Nothing in the app modifies itself.** The loop is observe, summarise, decide, ship, with a human at the deciding step.

Kid-facing screens never show these numbers. This is a design tool for the parents, not a scoreboard for the children.

**Multi-family from day one.** Every table carries `family_id` (directly or through its parent row), and every RLS policy keys off family membership, never off a single hardcoded family. Nothing may assume exactly two kids: a third profile must be addable with no code change.

Every learning activity and question has a **stable ID** so a kid can return to the exact item later.

## Family features (for the parents, not just the kids)

The hub is for the whole household. Parent-facing features share the same backend, permissions, and look, with a cleaner, adult layout on the phone.

- **Shared calendar:** both parents add and edit events; day, week, and month views; per-event visibility (parents only, or also shown to kids as a countdown). Optional two-way sync with the family's Google Calendar later.
- **Menus and meal planning:** a weekly dinner plan both parents can edit. Kids see "What's for dinner tonight" on their home screen. Each meal can hold a recipe link and ingredients.
- **Shared lists:** groceries (ingredients from the menu can be added in one tap), errands, packing lists for trips.
- **Chores overview:** assign chores, set points and savings goals, approve completions (either parent).
- **Household notes:** a small shared board for things like babysitter info or reminders (no sensitive data such as passwords or ID numbers).
- **Parent home view:** today at a glance: events, dinner, chores waiting for approval, each kid's focus mode and learning progress.

## Focus modes (parent-controlled from the phone)

The parent can switch what the kids' iPads show, instantly, from the phone. Kid screens reconfigure in real time: modules outside the current mode are **hidden, not greyed out**, so there's nothing to beg to unlock.

| Mode                 | Kids see                                                  |
|----------------------|-----------------------------------------------------------|
| Everything           | All modules (default)                                     |
| Session (learning)   | Learning modules only, plus Wave Check (always reachable) |
| Routine              | The active routine only (morning, after school, bedtime)  |
| Last Run (wind-down) | Reading timer, Wave Check, breathing                      |
| Lights out           | A calm "Time for bed" screen; nothing else                |

- **Per kid or whole family.** Each kid can be in a different mode.
- **Optional duration:** "Learning for 20 minutes." Kids see a visual countdown; when it ends, the iPad returns to the previous mode (or a parent-chosen one).
- **Pinned focus:** within Learning, the parent can pin specific activities or items (e.g., "Tricky questions" or "trace b and d"), using the stable activity and item IDs.
- **Schedules:** optional recurring modes (e.g., school days 4:00–4:30 pm is Learning; 7:30 pm is Wind-down).
- **Transition heads-up:** by default, kids get a 2-minute on-screen warning with a visual timer before a mode changes. The parent can override with "switch now." Advance warnings make transitions easier, especially for a child working on emotional regulation.
- **Feelings is never locked out.** A kid can always reach check-in and breathing.
- **Session summary:** when a timed Learning session ends, the parent's phone shows what each kid did and anything they missed.

Enforcement:

- The current mode lives in the database and is pushed to devices with Supabase Realtime. Devices re-read it on launch, so reloading or reopening the app can't escape a mode.
- Only parent sessions can change modes (enforced by RLS). Device sessions are read-only for mode settings.
- **Fail closed:** if a device is offline, it keeps the last mode it received.
- The app can only control itself. To keep kids from leaving the app for other iPad apps, the setup guide must walk the parent through iPad **Guided Access** (locks the iPad to one app) and **Screen Time** (limits other apps).

## Visual direction

A 1990s–2000s surf, skate, and snowboard shop look, built on a clean, modern layout:

- **Shop feel, comic-print edition:** the board-shop look crossed with comic-book printing, inspired by the animated comic films the kids love. Skate graphics and comics share the same roots (zines, screen prints, stickers, street art), so the two blend naturally. The ingredients: halftone dot textures, two-color misregistered headlines (a magenta and a cyan shadow offset a few pixels either side), heavy ink outlines on cards, stickers and buttons, comic-panel cards with hard offset shadows, marker-style hand lettering for small labels, sound-effect bursts ("SHRED!") for celebrations, and stepped, deliberately choppy animation. Reference mockups (phone, iPad, normal and focus): [The Deck — Comic Shop Screens](https://claude.ai/artifact/JF8FD7iAt8p3JKydUHvjSj).
- **No borrowed characters.** The style is fair game; the characters, logos and signature motifs of any comic or film (Spider-Man, Miles Morales, web patterns, spider emblems) are not. The heroes are our own rooster and turtle.
- **Layout (kept from the tvOS-inspired concept):** a large hero at the top that changes by context (countdowns like "12 sleeps until the beach trip," the current mode and its timer, or parent approvals); profile avatars along the top; a grid of large rounded tiles with live status lines; an "Up next" row. The touched tile lifts slightly and gets a bright ring for instant feedback. Frosted-glass panels are optional where they help readability over artwork.
- **Readability first:** display fonts only for headings and stickers. Body text for reading activities stays in a highly readable font (e.g., Lexend) at a large size.
- **Age-band variations:** the pre-reader view uses bigger tiles, fewer per screen, pictures, and audio; the reader view shows more text and more tiles.
- Original icons and artwork only; no brand logos or trademarks.

## Two volume levels: normal and focus styling

Energy is a reward, not the baseline. The app has one visual identity at two volume levels, and the volume is set by the current focus mode, not chosen screen by screen.

- **Normal styling** (Everything mode, Grom Zone, Sticker Wall, celebrations): the full comic-shop treatment above, including halftone texture, tilted cards and stickers, offset headlines, marker lettering, bursts and the kid's accent color used boldly.
- **Focus styling** (Session, Routine, Last Run, Lights out): halftone, tilts, offset headlines and marker lettering are all off. The ground is flat. The kid's accent color appears only as a small indicator (progress dots, avatar ring). The mascot shrinks to a small calm pose. One cream card holds the task.
- **What never changes** between the two: the display typeface, the ink outlines, the chunky pressable buttons, the cream card surface and the icon set. That is what keeps focus mode feeling like The Deck instead of a different app.
- **The payoff comes after.** When a timed session ends, the app may jump straight to a normal-styling celebration screen, so the loud moment is earned.
- **Build it as a theme, not per screen.** One root attribute (e.g. `data-volume="normal|focus"`) set from the focus-mode state, with every texture, tilt, offset and accent rule scoped under it. Screens are written once and pick up the right volume automatically. Reduced motion forces the stepped animations and bursts off in both levels.
- **Per-kid default volume.** Each kid has a default volume (normal or focus) set by a parent in Back Office. A kid who gets overwhelmed by busy screens can live in focus styling all the time and still get the full treatment for celebrations. The effective volume is the quieter of the kid's default and the current focus mode; celebration screens always use normal styling unless reduced motion is on.
- Focus styling changes how visible modules look; it does not change which modules are visible. Modules outside the current mode stay **hidden**, per Focus modes. The dimmed "Later" row shown in one focus mockup is not to be built.

Starting tokens (from the mockups; refine in Phase 1):

| Token           | Value                                                                                                  | Use                                                                                          |
|-----------------|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Ink             | `#0A0818`                                                                                              | Outlines, hard shadows, nav                                                                  |
| Ground (normal) | `#15122E` + halftone                                                                                   | Night background                                                                             |
| Ground (focus)  | `#1C1A33` flat; `#141228` for Last Run                                                                 | Calm background                                                                              |
| Panel           | `#221E45`                                                                                              | Comic-panel cards                                                                            |
| Cream           | `#F4EBD9`                                                                                              | Task cards, text on dark                                                                     |
| Muted text      | `#BDB5D6`                                                                                              | Secondary text on dark                                                                       |
| Accents         | magenta `#FF3E8A`, cyan `#29D3FF`, yellow `#FFD23F`, lime `#9BE564`, lilac `#A99BFF`, orange `#FF8A3D` | Per-kid colors, stickers, categories. Text on accents is always ink, never cream (contrast). |

Type: Archivo Black (display), Archivo (UI), Permanent Marker (small labels, normal styling only), Lexend for reading activities. Confirm each font's license in `ASSETS.md`. The app has two grounds, night and day (see the Daytime row on the Comic Shop canvas).

## Day and night grounds

At night the app is the indigo sky; by day it is the comic page itself. Ground and volume are independent: any screen can be day or night, at normal or focus volume. Build ground as a second root attribute, `data-ground="day|night"`, alongside `data-volume`, so screens are written once.

| Day token       | Value                                            | Use                                                                                   |
|-----------------|--------------------------------------------------|---------------------------------------------------------------------------------------|
| Ground (normal) | `#F2E6CC` newsprint + ink halftone at 9% opacity | Day background                                                                        |
| Ground (focus)  | `#EDE4D1` flat                                   | Calm day background                                                                   |
| Paper           | `#FFFBF2`                                        | Cards, tiles and panels (replaces the night panel `#221E45`)                          |
| Text            | `#15122E`                                        | Body and headings on day surfaces                                                     |
| Muted text      | `#4E4870`                                        | Secondary text (6.8:1 on the ground)                                                  |
| Marker          | `#B3124F`                                        | Marker lettering and links on day surfaces; yellow text is never used on a day ground |
| Empty slots     | `#7A7298` dashed                                 | Unfilled progress and sticker slots                                                   |

- **Stays the same in both grounds:** ink outlines and hard shadows (`#0A0818`), the accent colors with ink text on them, the offset headlines, the type, the icons, and the ink navigation bar.
- **Day accent:** a halftone sun may rise in a corner of kid screens in normal volume only. The primary "I did it!" action is an ink button with paper text in both grounds.
- **Labels a kid must read** (Up next, tile labels) are plain Archivo in both grounds; marker lettering is decoration only.

**When the app switches.** Each device has a ground setting in Back Office: **Auto** (default), Day, Night, or Follow device. Auto uses the family's routine times: day from the start of Dawn Patrol until Last Run begins, night otherwise. Last Run and Lights out are always night, whatever the setting. Follow device uses the iPad or phone light/dark setting (`prefers-color-scheme`). Ground changes cross-fade over about a second, or switch instantly with reduced motion.

## Wave Check scale

Feelings use surf conditions, always paired with the plain feeling word and a face so the surf name is a bonus, not a barrier. The spoken prompt says both ("Choppy. Upset or mad?").

| Surf word | Feeling        | Color  |
|-----------|----------------|--------|
| Pumping   | Happy, excited | Yellow |
| Rolling   | Okay, calm     | Cyan   |
| Flat      | Sad, tired     | Lilac  |
| Choppy    | Upset, mad     | Orange |

A parent should walk the kids through the words the first few times, especially "Choppy." In Last Run, the same four options appear in focus styling with only the faces in color.

## Future: Siri and voice

Siri in iOS 27 can act inside third-party apps through Apple's **App Intents** framework. App Intents only work in a **native** iOS/iPadOS app, not a web app, so plan for this in stages:

1.  **Now (web app):** expose a small, authenticated read-only API (Supabase Edge Function) for parent summaries. The parent builds an Apple **Shortcut** ("Get Contents of URL" with a personal token), so "Hey Siri, how are the kids doing?" speaks back chores done, reading minutes, learning sessions, and tricky questions. Tokens are per parent, revocable, and read-only.
2.  **Later (native wrapper):** wrap the web app in a thin native shell (e.g., Capacitor, or a Swift app with a web view) and add Swift App Intents:
    - Parent intents (parent devices only): get today's summary per kid, list chores awaiting approval, approve a chore, start a focus mode with a duration, add an event.
    - Kid intents (kid iPads): "How many sleeps until the beach trip?", "What's next in my routine?", "Start my reading timer."
3.  **Kid questions ("tell me about tornadoes"):** don't route kids to open-ended assistant answers. Answer from the app's own curated library first (missions, fact cards), written at their reading level. If a generative model is added later, it must run behind the app's backend with a kid-safe system prompt, topic allow-list, and a parent-visible log. Use iPad Screen Time to restrict general Siri and web answers on kid devices if desired.

Rules for all voice features:

- Parent data is never available from a kid device, by voice or otherwise.
- Every voice or Shortcut action goes through the same RLS-protected API as the app.
- Feelings data is never read aloud by default; the parent can opt in on their own device.

## Art direction and assets

Goal: graphics polished enough to feel credible next to Khan Kids or Duolingo. No flat, hand-coded placeholder shapes in kid-facing screens.

Approved sources (verify the license file in each repo or pack before adding, and record it in `ASSETS.md`):

- **Microsoft Fluent Emoji** (MIT; github.com/microsoft/fluentui-emoji). Primary art for topics (dinosaurs, sharks, whales, insects, spiders, weather, space), feelings faces, chores, and routine steps. Use the **3D** style for now, pending the test below. **Flat vs. 3D test:** the glossy 3D art may fight the flat ink-outline comic look. Fluent Emoji also ships a **Flat** style under the same MIT license. In Phase 1 slice 0, render the same set (rooster, turtle, the four Wave Check faces, two routine icons) in both styles with the sticker treatment, side by side on the styleguide page at both volume levels, and let the parent pick before feature screens use art. Use the animated versions for celebrations where available. Self-host the files you use; don't hotlink.
- **Kenney** asset packs (CC0; kenney.nl). Scenes, backgrounds, space and animal game pieces. Credit "Kenney.nl" in the About screen even though it isn't required.
- **Rive and LottieFiles community animations**: only files whose license explicitly allows use in your own app. Rive preferred for interactive characters (reacting to taps, right and wrong answers).
- Google Noto emoji and Open Peeps are acceptable alternates once their licenses are confirmed.

Mascot:

- **Two original mascots: a rooster and a box turtle.** Commission them from an illustrator in several poses, or build from licensed parts. The family owns them outright. App name: **The Deck** (a skateboard deck, the family's back deck, and "all hands on deck"). Coop TV can become a tile inside it. Fluent Emoji's rooster and turtle can stand in during development.
  - **Board style:** the rooster rides a surfboard (a nod to a family hat with a surfing rooster); the box turtle cruises on a longboard skateboard. On snow days, both switch to snowboards.
  - **Rooster = energy and time.** Morning wake-up (crows, opens the curtains), heads-up warnings before mode changes (holding the sand timer), learning starts, celebrations.
  - **Box turtle = calm and steady.** Feelings check-ins, breathing (breathes along), Wind-down, and Lights out (tucks into its shell under the stars). Box turtles can close their shells completely, which makes it a natural symbol for "take a break and calm down": go into your shell, take three slow breaths, come out when you're ready. Use this as the turtle's signature calming move in the reset plan.
  - The turtle is a tribute to a family pet of 30+ years. **The kids name both mascots.** Names are set by the parent (or chosen together in a short "name our friends" moment the first time the kids open the app) and can be changed later. Every screen, spoken line, and transition uses the chosen names.
- **Never** use or imitate copyrighted characters: no Calvin and Hobbes, Letterland, Khan Kids, Duolingo, Disney, or other licensed characters or close look-alikes.

Rules:

- **The art is app-wide, not just for learning.** The same style and mascot appear everywhere kids go: the home screen and top-shelf hero, profile avatars, routine steps, chores, calendar and countdowns ("12 sleeps" with a beach or cake scene), weather, feelings check-ins and breathing, focus-mode screens (Session, Last Run, Lights out), the heads-up warning before a mode change, and celebrations when chores or routines are done. The mascot can guide transitions (e.g., yawning on the Lights out screen, waving at the heads-up). Parent screens stay cleaner and more minimal but use the same icons so the app feels like one product.
- Keep one consistent style across the app. To fit the shop vibe, show Fluent Emoji and other art as **stickers** (a white die-cut border, a heavy ink outline, a hard offset shadow, and a small random tilt in normal styling only), like a sticker-bombed skateboard. The pre-reader view uses bigger art and fewer items per screen.
- Every asset in the repo has an entry in `ASSETS.md`: source URL, license, author, and any attribution required.
- Motion: short, purposeful animations for feedback (tap, correct, try again, celebration). Respect reduced motion.
- AI-generated images only for one-off backgrounds or scenes, never for recurring characters, since consistency matters to kids.

## Mascot transitions

Transitions use the mascot to make mode changes predictable and calm. Each one uses the same words and the same animation every time, so it becomes a familiar ritual. All animations respect reduced motion (show a still pose and the text instead). Keep each under about 5 seconds, and never block the kid from reaching Feelings.

- **Heads-up (before any mode change):** the rooster appears holding a small sand timer, waves, and says, for example, "Two more minutes, then it's learning time." A visual countdown runs beside it. The same line pattern is used for every mode: "Two more minutes, then it's \[mode\] time."
- **Session starts (learning):** the rooster paddles out on the surfboard (or grabs a magnifying glass for reading missions) and the learning tiles slide in.
- **Last Run (wind-down):** the turtle rolls in on its longboard, the screen dims slightly, colors soften toward cooler tones and the turtle stretches and picks up a book. Tiles reduce to reading timer, feelings, and breathing.
- **Lights out:** the turtle yawns and tucks into its shell under the stars (the rooster settles onto its roost beside it), and the screen fades to a calm night scene with very low brightness. The only control is "I need to breathe," which opens balloon breathing with the turtle breathing along. No sounds after the first gentle one.
- **Morning:** the reverse of Lights out. The rooster crows softly, the turtle pokes its head out, and the curtains open, and the morning routine appears.
- **Routine done / chores approved:** a short celebration (rooster cheers, a Fluent animated emoji burst). Keep it brief so it doesn't become a reason to linger on the screen.

Implementation notes:

- Build transitions as a small, reusable scene system (Rive state machine preferred: states like wave, timer, yawn, sleep, wake, cheer, breathe).
- Transitions are triggered by the focus-mode state from the database, so they play the same way whether the parent switched modes or a schedule did.
- The parent can turn sounds off per device and set a quiet mode for bedtime.

## Architecture decisions

- **Own Supabase project.** The Deck gets its own Supabase project, separate from the shared rooster project (which stays one project with prefixed tables for the other apps). Reason: blast radius. Kids' data should not be reachable from a leaked key or bad policy in an unrelated project. It also means the app is already isolated if it ever becomes a product. Same Supabase account and organization; this uses the second of the free tier's two active projects (verify current limits).
- **Same Netlify team is fine.** Hosting separation matters far less than database separation. The Netlify free plan has no site-count cap; the constraint is the shared monthly credit pool, driven mostly by production deploy frequency.
- **Migrate later, not now.** No new accounts needed today. If the app outgrows the family, move the Supabase project to its own organization. The schema discipline above (family_id + RLS) is what makes that move plumbing rather than a rewrite.
- **PWA first, native later.** Build and iterate as a PWA without App Store review; the data model carries straight over. A native iOS app is a later step, mainly for home-screen widgets, reliable notifications, offline, and Pencil. Device lockdown stays with Screen Time and Guided Access either way.
- **Offline-safe kid screens.** If Supabase is unreachable, kid devices show the last cached routine, countdowns, and lessons, never a spinner or blank screen. Writes queue and sync later.

## Modules and access layers

The app is a set of modules (Session, Tune Shop, Sticker Wall, Snack Shack, Supply Run, Tour Dates, Locals Board, Wave Check, Coop TV, Money, and future ones). Navigation is built from data, never hardcoded. Three layers decide what a kid sees, and **the most restrictive wins**:

1.  **Modules (per family):** what this household uses at all. Set once, rarely touched.
2.  **Focus mode (per kid):** what this kid should be doing right now. Kids can be in different modes at the same time (one in Session while the other is still in Dawn Patrol).
3.  **Access holds (per kid):** temporary removals, e.g. one kid loses Coop TV for the evening while the sibling keeps it. Every hold has an end time ("back on at 7 tomorrow") so no parent has to remember to switch it back. Hidden, not greyed out, like focus modes.

Wave Check (feelings) is never removable by a hold or focus mode.

## Parents

- Both parents are full parents with identical permissions. No restricted role. Either parent can run the whole app alone.
- In practice one parent builds lesson packs; that is a habit, not a permission.
- Design guardrail: the app must never become a nagging tool between parents. No "assigned to you by…" pressure framing between adults, no overdue shaming.

## Calendar aggregation

The core family feature. One view merging each parent's calendars across providers (Apple iCloud and Google work calendar), so a Google work calendar becomes visible to the other parent without moving it to Apple.

- Per-source visibility: work events can show as "busy" blocks only, with details private to the owning parent.
- Kid-visible events feed Tour Dates countdowns.
- Start read-only; two-way sync is optional and later.

## Chores, rotation and cooperative rewards

Modeled on the classroom "fill the jar" system: the kids work toward a **shared** goal together rather than competing on separate charts.

- **Shared jar:** a Sticker Wall goal both kids fill together; when it is full, everyone gets the reward (outing, treat, family event).
- **Per-kid weighting:** each kid's tasks are weighted to what is a fair stretch for them, so a younger or neurodivergent child's contribution counts fully even when the task looks different. The shared goal must never turn into one kid carrying the other.
- **No leaderboards,** no sibling comparison, no visible per-kid totals on kid screens. Kids see the jar filling and their own contributions.
- **Rotation:** chores can rotate between kids on a schedule, so no one is stuck with the same job forever. Rotation plus visible rewards is what keeps chore systems alive past the first few months.
- Individual stickers still exist alongside shared goals.

## Money (financial literacy)

- A digital mirror of each kid's real piggy bank. Not a bank, card, or payment product: no money moves through the app, and the physical cash is the source of truth.
- Earned money from chores, gifts, spending, and saving are ledger entries entered by a parent (kids can request, parents confirm).
- Savings goals can link to a countdown ("saving for the zoo trip"), tying together money, time awareness, and anticipation.
- Paired with Session lessons on saving, spending, needs vs wants, and simple home economics, so the lesson and the real balance reinforce each other.

## Learning loop (how Session evolves)

Session is not a fixed library. It is a loop driven by each kid's real progress:

1.  A report card, teacher note, or observed struggle comes in (e.g. "inference").
2.  The parent and Claude build a lesson pack for that skill in a chat session, using the kid's interests and level.
3.  The parent reviews and approves it.
4.  It is imported into `lesson_packs` as ordinary content.
5.  The app tracks progress on it, which informs the next pack.

- **No live model calls from kid devices.** Kids only ever see stored, parent-approved content. This keeps unreviewed output away from them and costs nothing to run.
- Only de-identified skill descriptions go into a lesson-building chat, never the report card itself or identifying details.
- Future (multi-family only): generation would have to move inside the product, which means per-family API costs and a review step. That is a reason to charge from day one if it ever goes wide.

## Groceries and menus

- Snack Shack (weekly menu) feeds Supply Run (grocery list) in one tap per meal.
- Sync with the family's existing iOS Reminders grocery list.
- Price comparison and cart loading stay a **separate companion script** the parent runs on the laptop with a browser extension and their own logged-in sessions, with human review before purchase. It is not part of the app, because retailer sites change often and it will need maintenance.

## Someday modules (not scoped)

- **Family records** (appointments, medication notes, school records): parent-only, encrypted, never on kid devices. Shipped last if ever. Excluded from any multi-family version until the regulatory side is properly reviewed.
- **Kid-to-parent messages:** a simple board for kids to send parents notes or voice messages from the iPad.
- **Seasonal theming:** holiday and birthday themes across the app, driven by Tour Dates.
- **HealthKit:** low value at these ages; only sleep, if ever.
- **Home-screen widgets** (native app): today's routine, chores, and countdowns where people actually look.

## If it ever becomes a product

Built for one family first. The market gap: Picniic, Skylight, and OurHome are parent-coordination tools with little or nothing on the kids' own devices, and serious learning tools live behind school licenses. Nobody joins the calendar, chores, learning, and curated video on the kids' devices. What generalizes: the architecture, calendar, chores and cooperative rewards, menus, countdowns, money. What does not yet: the per-kid calibration, which would need to become configuration or generated content. Hard parts to flag: curated YouTube in a paid product (YouTube API terms), per-family lesson generation cost, and anything health-related.

## Build phases

### Phase 1: Foundation + first modules

- Parent sign-in, family setup, add kids
- Device pairing and revocation
- Kid profile picker with optional PIN
- **Visual routines** (morning, after school, bedtime) with picture steps
- **Countdowns:** "How many sleeps until…" for events, plus a simple month calendar view
- **Feelings:** check-in at routine moments (morning, after school, bedtime); reset plan builder; balloon breathing
- Parent dashboard: today at a glance per kid
- Module registry and data-driven navigation; family export
- Focus modes: Everything, Learning, and Lights out, with durations and the 2-minute heads-up (Routine, Wind-down, and schedules can follow in Phase 2)

### Phase 2: Learning

- **Reader module (7-year-old):** port "Field Notes": chunked nonfiction reading with stop-and-think questions, look-back hints, compare charts, sequencing, claim + evidence. Topics: extreme weather, dinosaurs, insects, animal-vs-animal comparisons. "Tricky questions" shelf returns to exact missed items. Reading timer (15 min/night) with weekly chart.
- **Pre-reader module (5-year-old):** finger tracing with start dots, arrows, and fading guides, following the pre-writing sequence (vertical, horizontal, circle, cross, square, diagonals, X, triangle) before letters. Upper- and lowercase letters, then name tracing. Letter recognition games. Counting by tapping each object (one-to-one), and ten-frames for quantity recognition. Include a prompt to repeat practice on paper, since pencil on paper remains best for letter learning. Use original characters only (no Letterland or other licensed characters). Letter order and stroke directions configurable by the parent to match school.
- Parent can assign or pin specific activities.

### Phase 3: Home life

- Chores with points and a savings goal; parent approves from phone
- Visual transition timers ("5 minutes until we leave")
- Today's weather for the 7-year-old to read and decide what to wear
- Calendar aggregation (Apple + Google, per-source visibility)
- Shared goals with per-kid weighting, and chore rotation
- Access holds with automatic end times

### Phase 4: Money and the learning loop

- Money module: piggy-bank mirror, ledger, savings goals linked to countdowns
- Lesson pack import pipeline (draft → approved → live) and progress reporting back to the parent
- Financial literacy lessons in Session
- Menu → grocery list → iOS Reminders sync

## Kid UX rules

- Tap targets at least 2 cm (about 80 pt on iPad) for the 5-year-old and 64 pt for the 7-year-old. Hit areas bigger than the visuals.
- Drag-and-drop always snaps to the nearest valid target when dropped close. Every drag interaction also has a tap alternative.
- Disable double-tap zoom, text selection, and callouts in kid mode. Instant feedback on every touch.
- One task per screen. No dead-end screens. Home is always one tap away.
- Wrong answers give a hint and a retry, never a penalty.
- Missed items are saved automatically; favorites are one tap.
- Respect reduced motion. Support light and dark mode.

### Lessons from other kids' apps

Watching our kids use a popular branded creativity app surfaced two failures worth designing against.

**Where to go.** The home screen was an animated, scrolling world with unlabelled stations and small icons. Options lived off-screen, nothing was named, and motion competed with the choices. A child has to explore just to find what exists. The Deck does the opposite: large labelled tiles, everything visible without scrolling, the same things always in the same place.

**What to do.** Even after arriving somewhere, nothing said what the next step was. The app assumed kids would poke around until something happened, which leaves some kids frozen. On the Deck, the home screen answers *what's next for me right now* before it offers a menu (during Dawn Patrol, that is the next routine step, big and obvious). Inside every activity there is one clear action per screen, with a spoken or pictured prompt so a non-reader knows what to tap.

## How to work with me (the parent)

- I build. Vanilla JS, Supabase, Netlify, comfortable in the terminal, and I make the product and security calls myself. Don't over-explain the basics. Do pause before schema changes, new write paths, and migrations so I can approve them.
- Build in small, testable slices. After each slice, tell me exactly what to try on my phone and on the iPad.
- Write tests for the RLS policies (a device must be unable to do parent actions; one family can never see another's data).
- Keep a short `SETUP.md` updated so I can rebuild or hand this off later.

## Parked ideas (not scope, do not build yet)

These came out of a scoping conversation and are recorded so they are not lost. None of them are Phase 1 through 4 work. Revisit once the boring version is running and there is real usage data.

### One household database

The Deck's Supabase project is really the **household database**, not an app database. The separate household-assistant schema sketched elsewhere (people, things, events, tasks, documents, places, notes) overlaps heavily: tasks and chores are one table with two audiences, events and calendar aggregation are the same problem, people is people. Keeping them apart means syncing forever, and an agent could not answer "is anyone free Thursday" without querying two stores.

Implication: name the Supabase project for the household, not for the app, so future work is not boxed in. The Deck becomes the kid-facing and parent-facing window onto it. Grocer writes lists into the same tables instead of keeping its own. Coop TV could fold in later.

### Front office, not a super app

The shape this is heading toward is the front office of a household: shared data underneath, small surfaces on top. It is structurally an enterprise pattern (shared data layer, module registry, role-based access, audit trail, scoped service accounts) with a household as the org. The failure mode is the same one enterprise suites hit: building the platform instead of the thing. Dawn Patrol working on a Monday morning matters more than a perfect schema.

### Organic evolution (the novel version)

The boring layer should stay boring, because it is load-bearing. Where novelty actually belongs is the surface. Standard suites assume someone sits down and picks a module; a 7-year-old at 7am does not navigate, he is in a moment.

The idea: **the structure lives in the data, not the navigation.** One surface that reshapes itself around time of day and who is holding the iPad. The 5-year-old sees letters and a routine; two years later the same surface has quietly become reading and money, because his skills moved, not because a parent toggled a module.

Constraint that makes or breaks it: **change must be slow and announced.** Predictability matters more than delight here, especially for the younger child. Something like "something new on the Deck today" rather than a silently rearranged screen overnight.

Why it is parked: evolution cannot be designed up front without guessing. Several months of real usage will say more than any principle written today. It is also not a fork in the road. It is something that may become obvious later, built on top of the same data.

Worth noting why this is buildable here and not generally: it only works when one person knows the children personally. It does not ship to a million households.

### The monthly review loop

Self-improving software mostly fails because the feedback is noisy and nobody trusts it enough to ship unreviewed. A household is a rare place where a small version works: a handful of users all known personally, and the cost of a bad change is a mildly annoyed child.

The small version is already scoped above under Usage snapshots: the app observes, summarises monthly, the parent decides, Claude Code ships. Nothing rewrites itself.

### The agent as a separate actor

A local model (Mac mini class, roughly 48 to 64GB unified memory) acting as a household assistant stays **separate from The Deck**. The Deck is the system of record; the agent is one more consumer, with its own revocable account, an `agent` role, and a narrow scoped API. It may draft (menus, lesson ideas from a report card, list tidying); a human approves before anything lands.

If the agent is ever kid-facing, start narrow: help inside a lesson the kid is already in, not open-ended chat. Everything it says to a child is logged somewhere the parent reads.

### Spanish as a family module

A shared life goal for the parents is learning Spanish, so they can talk with people on cruises. The module would be family-wide, not another drill app (Duolingo already does drilling well). What only the Deck can do: a Spanish word of the day on each kid's home screen; optional Spanish labels on the app's own surfaces; a phrasebook the whole family practises together ahead of a trip, linked to the trip countdown; parents learning alongside the kids. It would plug into the learning loop like any other lesson pack.

### Naming (undecided)

"The Deck" does not feel right yet. Separate the two names: the household database/project gets a home-base style name (it is the front office for everything), and the kid- and parent-facing app gets its own name.

Direction the family likes: island, Caribbean, Hawaiian warmth, a touch of Disney, and something that ties into the Spanish goal. Candidates so far: Marea (tide; the day has tides), La Ola (the wave), Puerto (harbour, where ships come home), Casita (little house), Honu (Hawaiian green sea turtle, echoing the turtle mascot), Hale (Hawaiian for house, a fit for the home-base layer). Ohana is loved but very widely used by family apps and strongly tied to Disney.
