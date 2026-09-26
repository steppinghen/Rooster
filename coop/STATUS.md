# coop — status

## Currently working on

Live. **The parent PIN is still the temporary `0000` until you change it in-app.**

Site: <https://rooster-coop.netlify.app>

To change the PIN: open the site → tap the padlock (Parent Mode) → enter `0000` → Parent Settings → **Change Parent Code**. `sessionStorage` caches it per browser tab; new tabs re-prompt.

## Blockers / open questions

- **PIN = `0000`** (throwaway). Change it before real use.
- **Disney Junior — @disneyjunior on YouTube resolves to a lookalike, not the official Disney channel.** The `channels.list?forHandle=disneyjunior` response returns channel ID `UC6aSP-ovnLX2W-tNiz1df4g` with `customUrl: @disneyjunior`, but the title uses combining-diacritic spoof glyphs (`Dis̈̇̃n̈̇̃ë̇̃y J̈̇̃ün̈̇or̈̇̃`), the subscriber count is 161, and the uploads playlist genuinely returns 404 (no videos). The row exists in `coop_channels` with 0 videos. Options: leave in place (Brody's other channels are fine), `remove_channel UC6aSP-ovnLX2W-tNiz1df4g` via parent-write, or supply a specific channel ID / handle you trust and re-seed. Not substituting on my own per your rule.

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
