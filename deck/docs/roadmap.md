<!-- Generated from the brief by split_brief.py. Edit the brief, not this file. -->
# Roadmap and later phases

Part of The Deck brief. Rules in `CLAUDE.md` apply here too.

## Build phases

### Phase 1: Foundation + first modules

- Parent sign-in, family setup, add kids
- Device pairing and revocation
- Kid profile picker with optional PIN
- **Visual routines** (morning, after school, bedtime) with picture steps
- **Countdowns:** "How many sleeps until…" for events, plus a simple month calendar view
- **Feelings:** check-in at routine moments (morning, after school, bedtime); reset plan builder; breathing wave
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
- Trip weather on Tour Dates events (moved from Surf Report, which is now Phase 1.5): needs a place on each event, geocoding, and a forecast per trip location
- Calendar aggregation beyond the 1.5 read-only feeds (a feed out of The Deck, more providers)
- Shared goals with per-kid weighting, and chore rotation
- Access holds with automatic end times

### Phase 4: Money and the learning loop

- Money module: piggy-bank mirror, ledger, savings goals linked to countdowns
- Lesson pack import pipeline (draft → approved → live) and progress reporting back to the parent
- Financial literacy lessons in Session
- Menu → grocery list → iOS Reminders sync

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

## Calendar aggregation

The core family feature. One view merging each parent's calendars across providers (Apple iCloud and Google work calendar), so a Google work calendar becomes visible to the other parent without moving it to Apple.

- Per-source visibility: work events can show as "busy" blocks only, with details private to the owning parent.
- Kid-visible events feed Tour Dates countdowns.
- Start read-only; two-way sync is optional and later.
- Read-only feed sync is pulled into Phase 1.5 (see Calendar (Phase 1.5)): per-calendar kid defaults, per-display Not here / Busy / Title, each parent's own toggles, and kid layers on synced events. Two-way sync stays out of scope; an iOS Shortcut import was considered and dropped in favor of whole-calendar feeds.

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

### Family hub: the parents' side (direction, not yet scoped)

Parent Today grows into the place where both parents coordinate the household, and later where an agent helps. It runs on three surfaces over one set of data: the phone (quick checks and actions), the kitchen iPad (the shared family view) and a wall display (the kitchen view in a read-mostly, across-the-room density). Parent surfaces use a refined third look: tvOS-like, same indigo, cream and accents, frosted panels, no halftone, tilts or offset headlines, with whimsy in small doses (sticker-cut avatars, a mascot cameo, the seasonal sun as a small accent).

- **Privacy on shared screens:** the kitchen iPad and wall display are seen by the kids. Wave Check notes, bill amounts and anything private stay on parent phones or behind a parent unlock, never on the open shared screen.
- **Wave Check notes:** parents can add a note to a kid's check-in. Notes follow the same rolling 30-day auto-delete as check-ins.
- **Calendar:** a wall calendar with category toggles (family events, shared calendars, bills due), synced from the parents' calendars (Phase 3, see Calendar aggregation). Shared screens show a bill as "due" only, without the amount.
- **Menus and lists:** weekly menu creation, and the grocery and Costco lists checked off from the hub. Apple Reminders stays the capture point (Siri already adds to the shared list for the Grocer agent); the Deck shows that list rather than keeping a second copy. Reminders has no web API, so a live mirror needs a Shortcut bridge or the native wrapper.
- **House projects:** a running list of house projects with notes and details (working name "Shaping Bay," the board shop's workshop).
- **Notes and tasks to kids:** parents push a note or an extra task to a kid. Needs a kid-side inbox first, which pairs with the parked kid-to-parent messages.
- **Plate Hunt:** the license plate road-trip game (find a plate from every state), shared by both parents and joinable by the kids on road trips, tied to the trip's Tour Dates entry.
- **Agent:** the household agent works here as its own scoped account (see The agent as a separate actor). Example: as the grocery list fills, a weekly run builds the carts for a parent to review.

### More personalization (undecided)

My look (icon and color) is the start. More personalization is wanted later, but what it should be is not known yet. Revisit once real usage shows what the kids reach for. Whatever is added must keep the home screen predictable: the same things always stay in the same place.

### Naming (undecided)

"The Deck" does not feel right yet. Separate the two names: the household database/project gets a home-base style name (it is the front office for everything), and the kid- and parent-facing app gets its own name.

Direction the family likes: island, Caribbean, Hawaiian warmth, a touch of Disney, and something that ties into the Spanish goal. Candidates so far: Marea (tide; the day has tides), La Ola (the wave), Puerto (harbour, where ships come home), Casita (little house), Honu (Hawaiian green sea turtle, echoing the turtle mascot), Hale (Hawaiian for house, a fit for the home-base layer). Ohana is loved but very widely used by family apps and strongly tied to Disney.

### Coop TV folds into the Deck

The 1.5 embedded view is the first step. The direction is for Coop TV to become a full Deck module: restyled in the Deck's look (Sticker Punk, day and night, normal and focus), skipping its profile picker because the Deck already knows which kid the iPad belongs to, and moving its parent settings (channels, per-kid limits, personalization) into the Deck's Back Office, possibly as its own module settings page. Needs its own design pass before any code, starting from the current Coop TV screens and its open bugs.

### Special stickers a parent hands out

Some stickers may later be given by a parent instead of earned through a routine: the travel stickers for a trip that happened, or a one-off for a big moment. Not designed yet. If it comes back, it must follow the sticker rules already in place (never a reward taken away, never a count of what was missed, no sibling comparison) and land through the same paw-slap moment.
