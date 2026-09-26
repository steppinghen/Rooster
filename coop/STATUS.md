# coop — status

## Currently working on

Live. **The parent PIN is still the temporary `0000` until you change it in-app.**

Site: <https://rooster-coop.netlify.app>

To change the PIN: open the site → tap the padlock (Parent Mode) → enter `0000` → Parent Settings → **Change Parent Code**. `sessionStorage` caches it per browser tab; new tabs re-prompt.

## Session 2026-09-26 (pause mask + Netlify overlay + cleanup)

**Shipped to prod** (commit `57dacd4`, deploy `6ab76c89a90f2965ed75ebc9`):
- Player pause mask reworked. No longer replaces the video with a blown-up thumbnail. Portrait paints solid-black bars sized to the exact 16:9 letterbox (`calc((100% - 100vw * 9 / 16) / 2 + 4px)`) so YouTube's title / share / suggestions never peek out. Landscape (iPhone + iPad) fades dark gradient strips over the top/bottom edges plus a subtle 0.18 overall dim. The centered accent Play button still covers YouTube's center pause flash. Thumbnail now only shows during the pre-first-play intro (`.k-player-intro-thumb`) and fades on `PLAYING`.
- QA screenshots at iPhone portrait, iPhone landscape, iPad landscape confirm mask geometry. Real YouTube pause-chrome test still needs a live iPad/iPhone — headless Chrome refused autoplay-with-sound.

**Netlify overlay**: was the "Built with Netlify" badge (`built_with_badge_enabled`), not the collab drawer (`hud_enabled` was already off). Disabled via `netlify api updateSite` — confirmed the `nl-badge-frame` iframe is absent from the live prod HTML.

**Local-only** (unpushed, undeployed) commit `2ec93af`: cleanup — removed dead `.screen`, `.screen-centered`, `.screen-scroll`, `.parent-mode-btn`, and the `.screen`-only `@media (min-width: 768px)` line. `-29/+2`. Smoke-tested on draft `6ab76e52b824cd6855ed64a3--rooster-coop.netlify.app`: profile-select renders, `.k-parent-mode-btn` still present, no console errors.

## Blockers / open questions

- **PIN = `0000`** (throwaway). Change it before real use.
- **Netlify Free-plan monthly deploy cap hit.** After the pause-mask prod deploy went through, follow-up `netlify deploy --prod` calls return `JSONHTTPError: Forbidden` (draft deploys still work). Cleanup commit `2ec93af` is waiting on either the billing cycle to reset, or promoting the draft `6ab76e52b824cd6855ed64a3` via the Netlify UI ("Publish deploy"). Local commits `57dacd4` + `2ec93af` were pushed to `origin/main` in this session.
- **Disney Junior — @disneyjunior on YouTube resolves to a lookalike, not the official Disney channel.** The `channels.list?forHandle=disneyjunior` response returns channel ID `UC6aSP-ovnLX2W-tNiz1df4g` with `customUrl: @disneyjunior`, but the title uses combining-diacritic spoof glyphs (`Dis̈̇̃n̈̇̃ë̇̃y J̈̇̃ün̈̇or̈̇̃`), the subscriber count is 161, and the uploads playlist genuinely returns 404 (no videos). The row exists in `coop_channels` with 0 videos. Options: leave in place (Brody's other channels are fine), `remove_channel UC6aSP-ovnLX2W-tNiz1df4g` via parent-write, or supply a specific channel ID / handle you trust and re-seed. Not substituting on my own per your rule.

## What's next

- When Netlify's Free-tier cycle resets (or via UI promote of draft `6ab76e52b824cd6855ed64a3`): ship the `.screen` / `.parent-mode-btn` cleanup to prod.
- Live-device QA on iPad + iPhone: confirm the new pause mask fully swallows YouTube's paused chrome (title bar, "Watch on YouTube", share, related-videos overlay) in both orientations. If any YT chrome pokes past the mask, gradient strip heights and portrait bar `+4px` safety padding in `coop/style.css` are the knobs.
- Change parent PIN off `0000`.
- User is doing Parent Mode write-path QA themselves this cycle.

## Live state

- 12 starter channels seeded; 11 synced. **550 videos** cached.
- Feed counts after all filters (available, not live, not upcoming, not blocked, not short):
  - **RC: 342 visible videos** (10 channels: 5 shared + 5 RC-only)
  - **Brody: 212 visible videos** (7 channels: 5 shared + Alphablocks + Disney Junior — DJ contributes 0 right now)
- Sync detected 148 Shorts (hidden) and 16 livestreams (hidden). Blocklist matched 0 titles in the current uploads window for `milo` / `chip`.

## Setup checklist

- [x] Scaffold, migration, Netlify site, env vars.
- [x] Parent PIN set to `0000` (throwaway).
- [x] Refactor `kids-videos.html` → `index.html` + `js/{avatars,blocklist,data,ui,writer,youtube}.js`.
- [x] Functions deployed: `parent-write.js`, `sync-youtube.js` (scheduled `0 */6 * * *`), `sync-now.js` (HTTP-invoke wrapper, PIN-gated). `sync-now` calls the same `coop_verify_parent_pin` RPC as `parent-write`, so failed PIN attempts on either endpoint share the DB-level 5-strike / 15-min lockout.
- [x] RC + Brody profiles created and starter channels seeded.
- [x] First sync ran (11 s parallel — see gap notes below).
- [x] Verified RLS + function permissions live:
  - Anon insert on `coop_channels` → `42501 permission denied`
  - Anon read on `coop_settings` → empty; on `coop_kid_pins` → empty
  - Anon read on `coop_public_settings` → returns row
  - Anon RPC `coop_verify_parent_pin` / `coop_set_parent_pin` / `coop_set_kid_pin` / `coop_clear_kid_pin` → `permission denied`
  - Anon RPC `coop_verify_kid_pin` → callable, returns bool
- [x] Netlify site-level SSO turned off (`sso_login: false`) so the site is publicly reachable, matching knee-program's pattern. `noindex` still applied at all paths.
- [ ] **iPad**: install as PWA, sign in as each kid, confirm feeds render.
- [ ] Change parent PIN off `0000`.

## Entry screens + avatar packs (2026-09-26)

- **profileSelect** restyled in dark kid UI (`.k-page`): centered "Who's watching?" title, large 156px avatars ringed in each kid's `accent_color`, name below in Outfit 700. Kids with a PIN show a small glass lock badge tucked onto the avatar. Bottom-right glass circle → Parent Mode.
- **kidPin** restyled to match: `.k-page.centered.kid-pin` scoped with the kid's `--accent`/`--on-accent`, 128px avatar ring, big Outfit-700 heading, four PIN dots in the accent color, and a 3×4 numpad with 84px buttons that flash accent on press. Back FAB top-left.
- **Avatars**: replaced the DiceBear pack with original inline SVGs in a flat calm style (no outlines, muted palette that sits on `#1A2230`). All artwork original. Organized in `coop/js/avatars.js` as `PACKS`:
  - **Animals** (12): fox, owl, bear, whale, lion, penguin, rabbit, octopus, turtle, elephant, bee, puppy
  - **Dinosaurs** (6): T-Rex, triceratops, stegosaurus, brachiosaurus, pterodactyl, baby dino in an egg
  - **Christmas** (6): Santa, reindeer, snowman, elf, gingerbread kid, penguin in a hat
  - **Easter & Spring** (4): Easter bunny, chick, lamb, decorated egg
  - **Halloween & Fall** (4): friendly pumpkin, friendly ghost, black cat, owl with a moon
  - **Emoji** (56 curated glyphs): rendered as `<text>` in the platform emoji font
- Stored as `pack:id` in `coop_profiles.avatar` (e.g. `animals:fox`, `dino:trex`, `emoji:🦖`). Legacy plain-id values (like `lion`, `bear` from earlier) still resolve — `avatarSvg()` treats colonless values as `animals:<id>`. RC's `lion` and Brody's `bear` still render because both exist in the new animals pack.
- Parent Mode → profile edit now shows a pack tab strip and a scroll grid per pack.
- No migration needed (backward compat handled in JS). No security surface touched (no new writes, no policy changes).

## Kid-side responsive: iPhone (2026-09-26)

- Under 700px viewport width, the sidebar/rail is hidden and a fixed **bottom tab bar** takes over. Four tabs, 56px+ targets: Home, Search, All videos, and the kid's avatar (tap → switch kid). Bottom padding respects `env(safe-area-inset-bottom)` so the iPhone home indicator has room.
- `nav_style` only affects iPad-sized screens (>= 700px width). Both kids get the same tab bar on iPhone. Per-kid `accent_color` and `tile_size` still apply everywhere.
- Hero shrinks to `min-height: 33vh` on phones with tighter typography.
- Grids: 1 column in portrait, 2 columns in phone landscape (`max-width: 900px and (orientation: landscape) and max-height: 500px`). iPad landscape keeps the 3-column grid.
- Video player: on phone landscape the topbar collapses to a slim translucent bar so the video fills the screen without noticeable chrome. Existing `returnTo` still works from the compact back button.
- Both nav variants (side + tab bar) render on every kid screen; CSS decides which one shows. No JS resize handling needed.

## Kid-side redesign (2026-09-26)

- Dark palette (`#1A2230` bg, `#EAF0EE` text, glass panels), Outfit + Figtree fonts, rounded pill buttons everywhere.
- Per-kid theme columns on `coop_profiles`: `accent_color`, `on_accent_text`, `nav_style` (`sidebar`|`rail`), `tile_size` (`regular`|`large`). All `NOT NULL`, hex CHECK constraints on both colors. Migration `20260926000000_coop_profile_theme.sql`.
- **RC**: sage accent (`#A9D3BE` / `#14231C`), sidebar, regular tiles. **Brody**: sky accent (`#9CC8E8` / `#0F1E2A`), rail, large tiles.
- Kid screens now split into `coop/js/kid.js` (nav + Home + AllVideos + Channel + Search). Helpers extracted to `coop/js/dom.js`. CSS moved to `coop/style.css` with parent theme unchanged and kid theme scoped under `.k-app`.
- Nav: fixed left glass panel. Sidebar (248px) shows Search / Home / All videos + a scrolling "My channels" list; Rail (96px) is icon-only. Avatar taps in either variant return to profile-select ("Switch kid").
- Home: full-bleed hero (newest visible video) with fade to bg, accent-colored "New from &lt;channel&gt;" eyebrow, big Play button, plus "Open channel" for sidebar kids. Below: horizontal swipeable "My channels" row (tile size follows profile setting).
- All videos: dedicated screen from the nav. 3-column grid, IntersectionObserver-paginated in batches of 24.
- Channel page: 112px avatar, name, video count, same paged grid.
- Search: rounded glass input labelled "Search your channels" (plain `<input type=search>` so iPad dictation works). Debounced 250ms. Results heading "Videos about '<q>'" + "Only from your channels" sub. Never calls YouTube search. Blocklisted queries → normal "Nothing here." empty state.
- Video player: unchanged behavior; `returnTo: { screen, params }` on the `videoPlayer` route so the player returns to the exact screen the kid came from (Home / All videos / channel / search) — replaces the old always-return-to-kidHome.
- Parent-mode `profileEdit` gained an accent-color picker (8 presets + hex input + "Flip text color"), a Sidebar/Rail toggle, and a Regular/Large toggle. `edit_profile` op validates hex, nav_style, and tile_size before writing (server-side, in addition to the DB CHECK constraints).

## Known gaps to revisit

- **`netlify dev` locally**: this repo has a shared `.netlify` at root; running `netlify dev` from `coop/` still targets repo-root paths for functions. Not a production issue — `netlify dev:exec` works fine (that's what we used for the PIN script). Fix if it comes up: run with `--filter coop` or similar.
- **Disney Junior playlist 404** — see Blockers.
- **`sync-youtube.js` runtime**: parallelized to 20-way concurrent Shorts probes + 4-way channel parallel. First sync ran in ~11 s. Netlify's 26 s sync function budget still applies — if we grow to many more channels, promote to a background function (`sync-youtube-background.js`).
- **`sync-now.js`**: HTTP-triggerable, PIN-gated. Cheap; leaving in.
- **UI gaps**: no parent-mode buttons for "trigger sync now" or "seed starter channels" (both are covered by direct `curl` for now).
- **No `apple-touch-icon.png` / `manifest.webmanifest` / `sw.js`** yet — knee-program has a template to lift when polishing.
- **Search UI**: `data.searchFeedForProfile` exists but no on-screen search field yet.

## Backlog

- Hard-prune `availability='unavailable'` videos after N days (currently kept indefinitely so they can un-hide if they return).
- Bulk-import parent-write op for pasting many one-off video URLs at once.
- `set-kid-pin.mjs` local script (optional — kid PINs can be set via parent mode).
- Add per-profile "remove channel" (currently `remove_channel` is global; use `set_profile_channels` for per-profile trims until then).
