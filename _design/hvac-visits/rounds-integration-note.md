# Rounds redesign — integration note for Claude Code

You're integrating a full **drop-in replacement** for `hvac-visits/index.html`: a redesigned,
iOS-27-native front end. The design is final and approved — **match it; don't redesign it.**
Your job is plumbing: wire its data seams to the existing Supabase layer, re-add the auth gate,
and add follow-up support. The schema migration is **already run** (follow-up columns exist on
`updates`).

## What NOT to touch
- **The design/layout/CSS** — it's approved. Don't restyle. If something needs a real-data tweak,
  make the minimal change and flag it.
- **RLS, the territory derivation logic, the 418 contractors, the magic-link gate** — all stay.
- The Supabase **schema** beyond what's already migrated. No new tables.

## Step 1 — swap the file, re-add the gate
1. Back up the current `index.html` (it's the working gate).
2. Drop this file in as the new `index.html`.
3. At the **GATE SEAM** comment in `<head>`, paste the four includes this site already uses, in
   this order (from the backup): `auth-overlay.css`, `supabase-js@2.112.3`, `auth-config.js`,
   `vendor/auth-overlay.js`.
4. The gate hides `body` children via `.rooster-auth-pending` until auth. `.phone` is a direct
   child of `<body>`, so it's covered — **do NOT add `display:none` to it** (it would never come
   back; see the gotcha from the original build).
5. Reuse the gate's Supabase client via `window.roosterAuth.client()` — **do not create a second
   client** (two GoTrue clients race on token refresh).

## Step 2 — replace the DATA LAYER block
In `<script>`, everything between `DATA LAYER — CC: REPLACE` and `END DEMO DATA` is hardcoded
sample data so the file previews standalone. Replace it: populate the same variables from Supabase,
and **trigger the initial load on the `rooster:authed` event, not on page load** (the current
`boot()` / initial render calls at the bottom of the script should run after auth resolves).

Keep the exact **shapes** the render functions consume (documented inline in the cordon). Mapping:

### Reads
| UI variable / call | Supabase query |
|---|---|
| `due[]` (Today → Due to visit) | active contractors (`status='active'`), computed overdue = `current_date - last_visited - target_days`; `last_visited IS NULL` → calm-start (not overdue, sorts last, readout "not visited"). Map to `{name:company, terr:territory, meta, d, l, heat, call:(visitable='CALL ONLY')}`. |
| `attention[]` (Today → Needs attention) | `select u.*, c.company from updates u join contractors c on c.id=u.contractor_id where u.is_followup and u.done_at is null order by u.due_date nulls last`. `late = due_date < current_date`. |
| Today tiles | counts: Overdue = due where heat='hot'; Due today = heat='due' & d='today'; Follow-ups = open follow-up count. |
| `roster[]` (Contractors A–Z) | all contractors, filter by `status` (Active/Churned segment) and `territory` (chip bar); group by first letter. |
| `nextSteps[]` (detail) | `updates where contractor_id=? and is_followup and done_at is null order by due_date`. |
| `history[]` (detail) | `visits` + all `updates` (incl. done follow-ups) for the contractor, newest first. Kind: visit / note / done (a follow-up with `done_at`). |

### Writes (all via the gate's client; RLS scopes to the user)
| UI action | Mutation |
|---|---|
| Log visit (composer, mode='visit') | `insert into visits (contractor_id, owner_id, visited_on, note)`; `update contractors set last_visited = visited_on`. If the follow-up toggle is on, ALSO insert the follow-up (below). |
| Add note (composer) | `insert into updates (contractor_id, owner_id, note, is_followup=false)`. |
| Add next step / follow-up (composer toggle on, or "Add" in Next steps) | `insert into updates (…, is_followup=true, due_date=<picked>)`. |
| Check off a next step | `update updates set done_at = now() where id=?` (keeps it as a "Done" history entry — do not delete). |
| Frequency stepper | `update contractors set target_days=?`. |
| Active-in-rotation toggle / "Mark as churned" | `update contractors set status=?`. |
| Add / Edit contractor (native form) | upsert `contractors`; **territory derived client-side from the address** via the existing `deriveTerritory` logic — never store a typed value. Address field is where Google Places autocomplete will later plug in; for now free-text + derive. |

After any write, re-fetch the affected view so the UI reflects the DB (the demo currently mutates
local arrays and re-renders — swap that for write-then-reload).

## Step 3 — behaviors to preserve / get right
- **Calm start:** real data has all `last_visited` NULL → Needs attention empty, Due-to-visit shows
  everyone as "not visited yet", tiles read 0/0/0. Make sure these empty/zero states render cleanly
  (the render fns have empty-state fallbacks; verify against real data).
- **Search** is Contractors-only (matches the design). No Today search.
- **CALL ONLY** contractors: show the amber "Call only" tag, and in the detail hide the Directions
  quick-action (the design already does this when meta includes call-only).
- **Map** stays the current placeholder/abstract behavior — do NOT build the real Google map now;
  it's a separate later project.
- **Needs-attention items and Next-steps are the same follow-up rows**, one on Today (all accounts),
  one on the detail (one account). Tapping a Needs-attention item should open that contractor.

## Responsive — the drop-in is mobile AND desktop
The file is fully responsive; **don't build layouts, just wire data — both breakpoints share the same components, DOM, and data seams.**
- **Mobile (<900px):** single column, floating glass dock, push-navigation detail. (Dan's field use.)
- **Desktop (≥900px):** three-column master-detail — left nav rail (from the dock), middle list column, persistent right detail pane. Tapping a list row opens it in the right pane (`aria-current` highlights it); a "Select a contractor" empty state shows when nothing's picked. Map spans full width. Edit and the note composer render in-pane / as centered modals.
- All desktop rules live in one `@media(min-width:900px)` block; mobile is untouched below it. `show()` sets `.phone[data-tab]` (drives the map full-width rule) and swaps the detail pane to the placeholder on tab change when desktop.
- **When wiring data, both layouts get it for free** — they call the same render functions. Test at both widths in `netlify dev` (drag across 900px).

## Step 4 — verify, then deploy once
Test with `netlify dev` at `?forceauth=1` (signed in) against real data. Confirm: 418 load, calm-start
states look intentional, log-visit writes visit + resets clock + optional follow-up, add-note and
add-follow-up land in the right places, checking off a follow-up moves it to history as "Done" and
off Today, area chips filter both Today and Contractors, edit/add writes with derived territory.
Then commit + deploy **once**.

Batch the work — don't deploy iteratively; get it right locally first.
