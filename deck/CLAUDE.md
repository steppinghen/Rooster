<!-- Generated from the brief by split_brief.py. Edit the brief, not this file. -->
# The Deck: Family Hub Build Brief

This is the lean brief Claude Code reads every session. It holds the rules that apply to all work. The detail lives in `docs/`; read the files a task touches before starting it. When the text says "see" a section, the table below says which file holds it.

**Current work:** Phase 1.5. Follow `PHASE15_PLAN.md` and resume from `PROGRESS.md`.

| File | What it covers | Sections |
|---|---|---|
| `docs/design-system.md` | Design system, art and motion | Visual direction; Two volume levels: normal and focus styling; Day and night grounds; Art direction and assets; Art spec for Claude Code (Phase 1.5); Mascot transitions |
| `docs/kid-screens.md` | Kid screens | Focus modes (parent-controlled from the phone); Wave Check scale; The Point: layout B2 (Phase 1.5); Kid personalization: My look (Phase 1.5); Surf Report (Phase 1.5); Tour Dates views (Phase 1.5) |
| `docs/stickers-and-holidays.md` | Stickers, decks and holidays | Weekly decks and stickers (Phase 1.5); My stickers (Phase 1.5) |
| `docs/parent-screens.md` | Parent screens | Family features (for the parents, not just the kids); Parent Today and Snack Shack (Phase 1.5); Kids tab, Back Office and devices (Phase 1.5); Calendar (Phase 1.5) |
| `docs/data-model.md` | Data model and access | Data model (starting point); Usage snapshots (how the app tells us what is working); Modules and access layers; Parents |
| `docs/roadmap.md` | Roadmap and later phases | Build phases; Future: Siri and voice; Calendar aggregation; Chores, rotation and cooperative rewards; Money (financial literacy); Learning loop (how Session evolves); Groceries and menus; Someday modules (not scoped); If it ever becomes a product; Parked ideas (not scope, do not build yet) |

## Name and sections

The app is called **The Deck**, with a 1990s–2000s surf, skate, and snowboard shop vibe. Sections use board-shop names:

| Section      | What it is                                                                           |
|--------------|--------------------------------------------------------------------------------------|
| The Point    | The kids' home screen (formerly Grom Zone; the kid's name stays in marker lettering) |
| Session      | Learning mode and learning activities                                                |
| Dawn Patrol  | Morning routine                                                                      |
| Last Run     | Wind-down and bedtime routine                                                        |
| Wave Check   | Feelings check-ins                                                                   |
| Sticker Wall | Chore rewards: kids earn stickers instead of plain points                            |
| Tune Shop    | Chores                                                                               |
| Snack Shack  | Menus and dinner plans                                                               |
| Supply Run   | Grocery, errand, and packing lists                                                   |
| Tour Dates   | Family calendar, events, and kids' countdowns                                        |
| Locals Board | Household notes                                                                      |
| Back Office  | Parents-only dashboard and settings                                                  |
| Team Riders  | Kid profiles; each kid's avatar is their own custom "pro model" deck graphic         |

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
3.  **Enforce permissions in the database, not the UI.** Every table uses Postgres Row Level Security. A device session can only read and write its own family's kid-facing data and can never perform parent actions on its own. A "parent lock" screen on the iPad is a convenience, not the protection. **Parent unlock on a shared display (1.5):** where a device allows it, a parent picks their face and enters a 6-digit parent PIN (separate from kid PINs, stored hashed, rate-limited with lockout); the server checks it and gives that device a short-lived parent session that ends after 1, 2 or 5 minutes idle (2 by default) or on Lock. Unlocked, the display can do everything the phone can (Kids tab, Back Office, calendars, its own device settings) except a phone-only set: kid and parent PINs, pairing or unpairing devices, parent accounts, export all family data and delete family. Phone-only items still appear on the display, tagged Phone; tapping one shows why and a QR code that opens that exact screen on a parent's phone. The database refuses phone-only actions from any device session. Kid iPads have it off by default.
4.  **Kid profiles:** No passwords. Kids tap their avatar. An optional 4-digit PIN (stored hashed) keeps siblings out of each other's profiles.
5.  **Data minimization:** Nicknames only. No last names, school names, exact birth years, or photos of the kids in v1. Birthdays are stored as month and day for countdowns.
6.  **Feelings data:** Visible to parents only (kids see only their own current check-in). Auto-delete check-ins after 30 days via a scheduled job. No scores, points, or rewards attached to feelings.
7.  **No third parties:** No ads, analytics, trackers, or external fonts or scripts beyond what's self-hosted. No data leaves Supabase and the app host. One limited exception: the weather forecast (see Surf Report). Only the server calls the weather service, sending only the home location rounded to about 1 km; kid devices never call out, and no kid or family data is sent. A second limited exception (1.5): calendar feeds. Only the server fetches each calendar's read-only feed link (an iCloud public calendar link or a Google secret iCal address) about every 15 minutes; feed links are secrets stored server-side, never sent to a device, and nothing is sent back to Apple or Google.
8.  **Secrets:** Never commit keys. Use environment variables and a `.env.example` with placeholders. Only the Supabase anon key ships to the browser.
9.  **Parent controls:** "Export all family data" and "Delete family" (full wipe) in parent settings. The export is a single zip: a full JSON dump of every table, CSVs for the human-readable tables (chores, calendar, money ledger, learning progress), and any uploaded files alongside. It must be good enough to rebuild the app from. Build it early; it is cheap now and miserable to retrofit.
10. **Placeholders only during development:** Seed data uses fake names ("Kid A", "Kid B"). Real family data is entered by the parent in the live app, never in code, prompts, or commits.

## Tech stack

- **Frontend:** Vite + React + TypeScript, installable PWA (manifest + service worker; the kid-facing parts work offline and sync when back online).
- **Backend:** Supabase (Auth, Postgres with RLS, scheduled functions). The free tier is enough for one family.
- **Hosting:** Vercel or Netlify, free tier, custom domain optional.
- **Speech:** Browser Web Speech API for read-aloud (on-device, no external service).

## Kid UX rules

- Tap targets at least 2 cm (about 80 pt on iPad) for the 5-year-old and 64 pt for the 7-year-old. Hit areas bigger than the visuals.
- Drag-and-drop always snaps to the nearest valid target when dropped close. Every drag interaction also has a tap alternative.
- Disable double-tap zoom, text selection, and callouts in kid mode. Instant feedback on every touch.
- One task per screen, except routines: a routine shows its whole checklist on one screen (next step highlighted, any order, tap a done step to undo, up to 8 steps). No dead-end screens. Home is always one tap away.
- Every kid screen fits the iPad in both orientations with no scrolling.
- Wrong answers give a hint and a retry, never a penalty.
- Missed items are saved automatically; favorites are one tap.
- Respect reduced motion. Support light and dark mode.

### Lessons from other kids' apps

Watching our kids use a popular branded creativity app surfaced two failures worth designing against.

**Where to go.** The home screen was an animated, scrolling world with unlabelled stations and small icons. Options lived off-screen, nothing was named, and motion competed with the choices. A child has to explore just to find what exists. The Deck does the opposite: large labelled tiles, everything visible without scrolling, the same things always in the same place.

**What to do.** Even after arriving somewhere, nothing said what the next step was. The app assumed kids would poke around until something happened, which leaves some kids frozen. On the Deck, the home screen answers *what's next for me right now* before it offers a menu (during Dawn Patrol, that is the next routine step, big and obvious). Inside every activity there is one clear action per screen, with a spoken or pictured prompt so a non-reader knows what to tap.

## Architecture decisions

- **Own Supabase project.** The Deck gets its own Supabase project, separate from the shared rooster project (which stays one project with prefixed tables for the other apps). Reason: blast radius. Kids' data should not be reachable from a leaked key or bad policy in an unrelated project. It also means the app is already isolated if it ever becomes a product. Same Supabase account and organization; this uses the second of the free tier's two active projects (verify current limits).
- **Same Netlify team is fine.** Hosting separation matters far less than database separation. The Netlify free plan has no site-count cap; the constraint is the shared monthly credit pool, driven mostly by production deploy frequency.
- **Migrate later, not now.** No new accounts needed today. If the app outgrows the family, move the Supabase project to its own organization. The schema discipline above (family_id + RLS) is what makes that move plumbing rather than a rewrite.
- **PWA first, native later.** Build and iterate as a PWA without App Store review; the data model carries straight over. A native iOS app is a later step, mainly for home-screen widgets, reliable notifications, offline, and Pencil. Device lockdown stays with Screen Time and Guided Access either way.
- **Offline-safe kid screens.** If Supabase is unreachable, kid devices show the last cached routine, countdowns, and lessons, never a spinner or blank screen. Writes queue and sync later.

## How to work with me (the parent)

- I build. Vanilla JS, Supabase, Netlify, comfortable in the terminal, and I make the product and security calls myself. Don't over-explain the basics. Do pause before schema changes, new write paths, and migrations so I can approve them.
- Build in small, testable slices. After each slice, tell me exactly what to try on my phone and on the iPad.
- Write tests for the RLS policies (a device must be unable to do parent actions; one family can never see another's data).
- Keep a short `SETUP.md` updated so I can rebuild or hand this off later.
