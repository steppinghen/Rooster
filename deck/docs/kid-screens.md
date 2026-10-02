<!-- Generated from the brief by split_brief.py. Edit the brief, not this file. -->
# Kid screens

Part of The Deck brief. Rules in `CLAUDE.md` apply here too.

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

## Wave Check scale

Feelings use surf conditions, always paired with the plain feeling word and a face so the surf name is a bonus, not a barrier. The spoken prompt says both ("Choppy. Upset or mad?").

| Surf word | Feeling        | Color  |
|-----------|----------------|--------|
| Pumping   | Happy, excited | Yellow |
| Rolling   | Okay, calm     | Cyan   |
| Flat      | Sad, tired     | Lilac  |
| Choppy    | Upset, mad     | Orange |

A parent should walk the kids through the words the first few times, especially "Choppy." In Last Run, the same four options appear in focus styling with only the faces in color.

## The Point: layout B2 (Phase 1.5)

Reference frames: The Deck — Comic Shop Screens, The Point page (Kid A portrait plain, Halloween, Christmas and focus volume; Kid A landscape; Kid B pre-reader landscape plain, Halloween, Christmas and focus volume). B2 replaces the earlier The Point frames, which are archived.

- **Top to bottom (reader, portrait):** the sky band (holiday trims hang here), the header (marker greeting, THE POINT, the kid's avatar on the seasonal sun or holiday circle), Right now, Today's stickers, My week with the full-size deck, three info cards, and the ink dock along the bottom edge.
- **Info cards are static slots with live content:** weather (picture, temperature and the day's tip, e.g. "58° · Rain, Bring a rain coat") opens Surf Report; dinner opens this week's dinners; the countdown opens Tour Dates. Each card shows a small arrow so it reads as tappable. If something dynamic is added later, it is one spotlight slot, not shuffling cards.
- **The dock holds places, not information:** Home, My week and Wave Check are always there (Wave Check can never be removed); a parent picks up to three more per kid in Back Office (e.g. Session, Coop TV, Tune Shop). The pre-reader gets four larger items. Focus modes trim the dock to what the mode allows (Session mode: Home, Session, Wave Check). Modules that don't fit are swapped per kid in Back Office, never hidden behind a "More" menu. The active item fills with the kid's color.
- **Where the dock appears:** the same ink bar sits at the bottom of every kid screen, so the app looks the same everywhere, but what it holds depends on the screen. Browsing screens (The Point, My week, My old decks, Tour Dates, Surf Report, this week's dinners) get the full dock. Task screens (routines, Wave Check, breathing, Session activities, My look) get a slim dock with only Home and Wave Check, so there are no exits mid-task and feelings stay one tap away; on Wave Check and breathing, the Wave Check item shows as active. Home lives in the dock, so task screens drop their separate header Home button. Celebrations (short, they return on their own) and Lights out (its only control is "I need to breathe") have no dock. In focus volume the dock stays ink, the active item gets a ring in the kid's color instead of a fill, and tags show still.
- **The dock lights the section you are in:** every screen shows exactly one active dock item, and it is always the way back. The Point lights Home; My week and My old decks light My week; the info pages (Tour Dates, Surf Report, this week's dinners) belong to Home and light Home, since they only open from The Point's cards and are always one step below it. So Home on an info page is the same as Back, and there is no separate Back button. No card-to-page transition animation.
- **Markers on dock items, no badges:** never red, never a number of things missed, no sound, at most one animating at a time.
  - Invitation (Wave Check): a blue "Check in" tag with a small wave, tilted right. It shows at the check-in moments a parent sets per kid (up to three, in Kid settings) (e.g. after school, bedtime) when there has been no check-in since the last moment; if ignored it rests until the next moment and never escalates.
  - To-do (Session, Tune Shop, anything assigned): a yellow tag, tilted left, such as "1 mission". It stays until the item is done or a parent clears it.
  - Tags pop on once in a few stepped frames, then stay still; with Reduce Motion they simply appear. In focus volume they show still.
- **Right now nudges:** the hero is the main channel. When a check-in moment is open and no routine is running, it becomes "How's your wave?" with the calm turtle, a big Wave Check button and "Not now". Assigned work (a pinned session, a chore) shows here when it is next and links straight in.
- **Wave Check as a routine step:** parents can add a Wave Check step to any routine. It counts as done whether the kid checks in or taps "Not now", so finishing the routine (and its sticker) never rewards a check-in.
- **Headline shadows:** the misregistered headline always uses a cyan and a magenta shadow, whatever the kid's color; the kid's color shows in the hero card, the avatar, the active dock item and the deck tint.
- **Pre-reader (landscape):** left column: Right now, then three large picture cards with one-word labels ("Rain coat", "Burgers", "3 sleeps"), spoken on tap. Right column: My week with the deck and today's sticker slots as large circles beneath it. Four dock items.
- **Reader (landscape):** the same two columns as the pre-reader, so both bands rotate the same way. Left column: Right now, then the three info cards, taller, keeping the reader text ("58° · Rain / Bring a rain coat", "Tonight / Bubba burgers", "3 sleeps / Grandma's house"). Right column: My week (title, sticker count and deck name, then the deck), with Today's stickers beneath as three labelled slots. The reader's full dock. Holiday accents use the landscape-width trims. The deck uses the same saved sticker spots and sizes as portrait, so stickers look larger on the shorter deck.
- **Focus volume** (a kid whose default volume is focus, or a focus mode that shows The Point): the same modules, cards and dock as normal volume, quieted. Flat focus ground with no seasonal sun, holiday trim or corner circle (no holiday accents in focus volume; the holiday sticker and deck still show). No offset headline shadow; the greeting is plain Archivo; RIGHT NOW is a plain caps label inside the card. The hero card is cream for both Right now and the Wave Check invite. The kid's color appears only as a ring around the avatar, progress dots in Right now (filled for done steps, dashed for the rest) and a ring on the active dock item. The rooster uses his small Calm pose (about 58 px) and the turtle shrinks the same way, with no tilt and no halftone. Stickers on the deck and info cards are untilted and the deck has no halftone, but the deck keeps its kid-color tint, since the deck is the kid's artwork. The next sticker slot gets a solid ink outline instead of the marker-red dash. Dock tags show still and straight. The pre-reader gets the same treatment, with the progress dots under its picture-only Right now line.

## Kid personalization: My look (Phase 1.5)

Each kid picks their own avatar icon and color. Reference frames: The Deck — Comic Shop Screens, Kid personalization page.

- **Where:** the kid taps their own avatar on The Point to open My look. Normal volume, with the seasonal sun behind the header avatar in day ground. It gets the slim task dock (Home and Wave Check), with Home lit in the color being picked, and no separate header Home button: nothing saves until "That's me!" (or "Yes!"), so a full dock would only invite leaving halfway. Home goes back to The Point; leaving before saving keeps the old look.
- **One choice, two uses:** the icon and color make the round avatar shown on every kid screen, and the kid's "pro model" deck (their color, their sticker and their nickname) shown on Team Riders, the profile picker. Both preview live while the kid chooses, and the header avatar updates as they tap.
- **Reader view:** one screen with six colors and 18 named stickers. Nothing is saved until the kid presses "That's me!"
- **Pre-reader view:** three steps, one task each: pick a color (six large circles), pick a sticker (12 large stickers, no labels, each name spoken on tap), then "A pink octopus!" with Yes or Change it. A large avatar on the left updates throughout. Yes saves and offers Go home. Back is always available on step 2; Home is always one tap away.
- **Colors:** the six accents (pink, blue, yellow, green, purple, orange). Colors are not exclusive, so siblings can share one; parent screens always show the kid's icon beside the color and never rely on color alone.
- **Avatar pool:** Fluent Emoji animals, dinosaurs, sea creatures, space and a few fun things. Never the mascots (rooster, turtle, dog) and never a face emoji, since faces belong to Wave Check. The pool is data and can grow, including seasonal picks offered only in season.
- **Parent controls:** Back Office has a per-kid "Can change their look" switch (default on) and can override the avatar and color.
- **Write path:** a narrow RPC lets a kid device update only `avatar` and `accent` for a kid in its own family, rate-limited, nothing else. It goes in REVIEW.md for the parent's Gate 1 review.

## Surf Report (Phase 1.5)

Reference frames: The Deck — Comic Shop Screens, Kid modules page, "Surf Report" (Kid A reader, day, normal, portrait; Kid B pre-reader, day, focus, landscape). Art: Weather & art page, R4 (weather icons and dressing hints) and R5 (Snow Report). Built in 1.5 because the art is done and the Snow Report must be live by December 1; trip weather is Phase 2.

- **How kids get there:** the weather info card on The Point opens it. It is not tied to any routine step and is not a dock item.
- **Reader screen:** a Today card (R4 picture, plain word, temperature, a feel word like "Cool today", and morning / after school / evening pictures, with a hear button), the day's tip, a seven-day strip, and a trip card for the next trip within forecast range (Phase 2). A small "Weather data by Open-Meteo.com" line sits at the bottom.
- **Pre-reader screen:** today's big picture and word on the left; the tip as a large card that reads itself aloud when tapped, with one to three clothing pictures; five days of pictures below.
- **The tip, phrased as advice (deterministic, same wording for the same forecast):** rain from the morning or storms: "Wear your rain coat and rain boots" (rain all day). Rain later only: "Bring a rain coat" (rain after school). Under 35°: "Wear a heavy jacket, hat and gloves". Under 45°: "Wear a heavy jacket". Windy, or under 65°: "Bring a jacket". 85° and up: "Shorts, not pants, today" plus "Hot! Bring water too." 75° and up: "Shorts, not pants, today". Otherwise "No jacket needed". The temperature thresholds are parent-adjustable in Back Office.
- **Snow Report:** from the winter start date (December 1 by default) the same data uses the Snow Report art, words and badge from R5.
- **Data:** one scheduled server function (Supabase Edge Function or Netlify function) fetches the home forecast from Open-Meteo about hourly and writes `weather_cache`. Kid devices only read that table, so weather works offline from the last fetch. If the cache is more than about 12 hours old, kid screens hide the weather rather than show a stale forecast. Weather codes map to the eight conditions in code, not by a model.
- **Terms:** Open-Meteo's free API needs no key and is for non-commercial use, with data under CC BY 4.0; credit "Weather data by Open-Meteo.com" is shown next to the data (plain text on kid screens, a link in the About screen). If the Deck ever becomes a product, commercial use needs Open-Meteo's paid plan. Record it in ASSETS.md. Verify the current terms before building.

## Tour Dates views (Phase 1.5)

- A labeled view switch replaces the page dots: **Countdowns · Months · Calendar**, each a picture with a word, active in the kid's color.
- **Months** pages three months at a time with big Back and Next arrow buttons and the range between them (Back is dimmed on the current page). No swipe-only paging.
- **Calendar** (readers): a month grid in the kid look, today in the kid's color, past days faded, kid-layer events as stickers and plain kid-visible events as words. Tap a day for a card with each item, "N sleeps" and a Hear it button. Pre-readers keep Countdowns only.
