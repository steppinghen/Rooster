<!-- Generated from the brief by split_brief.py. Edit the brief, not this file. -->
# Data model and access

Part of The Deck brief. Rules in `CLAUDE.md` apply here too.

## Data model (starting point)

- `families`: id, name, created_at, settings (json, new in 1.5: holiday master switch and per-holiday switches, winter start and end dates, dog pin `season` \| `mara` \| `costa`, the five tip temperatures)
- `parents`: user_id → family_id; new in 1.5: display_name, initial, color (for the S/J faces), unlock_pin_hash (the 6-digit parent PIN for the kitchen hub, separate from the account sign-in)
- `kids`: id, family_id, nickname, avatar (icon key from the avatar pool), accent (one of the six accent hexes; new in 1.5), age_band (`prereader` \| `reader`), default_volume (`normal` \| `focus`), pin_hash (nullable), birthday_month, birthday_day; new in 1.5: can_change_look (default on), dock_picks (ordered module keys: up to 3 for readers, 1 for pre-readers)
- `devices`: id, family_id, device_user_id, label, paired_at, revoked_at, last_seen_at, ground (`auto` \| `day` \| `night` \| `device`; parents' phones keep their own choice locally). New in 1.5: job (`display` \| `kid`), kid_ids (kid iPads), start_view (`today` \| `calendar` \| `dinners`) and return_to_start, parent_unlock (on for displays, off for kid iPads), unlock_minutes (1 \| 2 \| 5), sound, read_aloud, dim_at_lights_out
- `pairing_codes`: code_hash, family_id, expires_at, used_at
- `routines`: id, family_id, kid_ids (one or more kids), name, type (`morning` \| `after_school` \| `bedtime` \| `other`), days (weekday set), start_time, finish_by (nullable time), finish_label (`bus` \| `car`), earns_sticker, steps (ordered, up to 8, each with kind (`task` \| `wave_check`), text, icon and who: `all` (everyone on the routine) or a set of kid ids). New fields in 1.5.
- `routine_completions`: routine_id, kid_id, date, completed_steps
- `chores`: id, family_id, kid_id, title, icon, points, repeat rule
- `chore_completions`: chore_id, kid_id, date, status (`done` \| `approved`)
- `events`: id, family_id, title, icon, date, kind (`birthday` \| `holiday` \| `school` \| `trip` \| `other`), all_day, start and end time, repeats, visible_to_kids, kid_title, kid_icon, kid_ids, birthday_kid_id (birthday kind), holiday_key (holiday kind), place (nullable, for trip weather). The `school` kind drives the school stickers; holiday events drive the holiday stickers. New in 1.5: the school kind, calendar_id and external_uid (synced events are read-only apart from their kid layer), kid_visibility (`inherit` \| `shown` \| `hidden`) overriding the calendar's kids_default; countdown (boolean, "Countdown on Tour Dates", starts 14 days out).
- `meals`: id, family_id, name, default_sides, icon, recipe_url, ingredients (new in 1.5)
- `dinner_plan`: family_id, date, kind (`meal` \| `undecided` \| `none`), meal_id (nullable), sides, options\[\] (for undecided) (new in 1.5)
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
- `calendars` (replaces `calendar_sources`; new in 1.5): id, family_id, name, source (`feed` \| `built_in`), feed_url (secret, server-only), color, owner_parent_id (nullable), kids_default (`shown` \| `hidden` \| `never`), last_synced_at
- `device_calendars` (new in 1.5): device_id, calendar_id, mode (`off` \| `busy` \| `title`)
- `parent_calendar_prefs` (new in 1.5): parent_id, calendar_id, shown (each parent's own toggles on the phone)
- `checkin_moments` (new in 1.5): id, kid_id, label, time or anchor (routine start), up to 3 per kid
- `lesson_packs`: id, kid_id, title, focus_skill, source_note, status (`draft` \| `approved` \| `archived`), content (json), approved_by, approved_at
- `weather_cache`: family_id, fetched_at, location (rounded), today (hourly summary), days (7-day summary), source (new in 1.5)
- `kid_decks` (new in 1.5): id, kid_id, week_start (Monday), design_key, colorway (1 \| 2), world, holiday_key (nullable, for a holiday deck week), rerolls_used (0–3). One row per kid per week; past rows are My old decks.
- `sticker_awards` (new in 1.5): id, kid_id, kid_deck_id, source_kind (`routine` \| `chore` \| `last_run`), source_id, offered_keys\[\] (the three offered), sticker_key (null while "pick waiting"), x, y, size, tilt (saved at placement so the deck looks the same everywhere), awarded_at, placed_at. The four-a-day cap is counted from this table.
- `display_unlocks` (new in 1.5): id, device_id, parent_id, created_at, expires_at, ended_at. Created only by a server function after the parent PIN checks out, with a lockout after repeated misses; a display device gains parent reads and writes only while an unexpired row exists, and never the phone-only actions.
- `usage_events`: id, family_id, kid_id (nullable for parent use), module_key, action (`opened` \| `completed` \| `abandoned` \| `skipped`), target_id (nullable, e.g. activity or chore id), duration_ms (nullable), created_at (90-day retention, then rolled into monthly aggregates)

## Usage snapshots (how the app tells us what is working)

The app writes a `usage_events` row whenever a module is opened, an activity is completed, or something is abandoned part-way. No content is stored, only what was touched and for how long. Rows are kept for 90 days and then rolled into monthly aggregates.

Once a month the parent can export a **usage snapshot**: a short, plain-language summary of what was actually used, what was never opened, where kids dropped out part-way, and which lessons dragged. It is a file the parent can read in a minute, not a dashboard.

That snapshot is the input to a review conversation: the parent brings it to a chat, the changes are worked out together, and the parent hands the result to Claude Code. **Nothing in the app modifies itself.** The loop is observe, summarise, decide, ship, with a human at the deciding step.

Kid-facing screens never show these numbers. This is a design tool for the parents, not a scoreboard for the children.

**Multi-family from day one.** Every table carries `family_id` (directly or through its parent row), and every RLS policy keys off family membership, never off a single hardcoded family. Nothing may assume exactly two kids: a third profile must be addable with no code change.

Every learning activity and question has a **stable ID** so a kid can return to the exact item later.

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
