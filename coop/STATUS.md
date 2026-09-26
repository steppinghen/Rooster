# coop — status

## Currently working on

First deploy + end-to-end verification.

## Blockers / open questions

- **Initial parent PIN needs to be set** — run the local script (see setup below). No writes work until it is; `parent-write` returns 401 with no `Retry-After` when `parent_pin_hash IS NULL`.

## Setup checklist

- [x] Scaffold `coop/` (CLAUDE.md, STATUS.md, netlify.toml, `index.html`)
- [x] Migration `supabase/migrations/20260925000000_coop_initial.sql` pushed (10 tables, 5 SECURITY DEFINER functions, seeds for `coop_settings`/`coop_public_settings`/blocklist).
- [x] Netlify site `rooster-coop` created (ID `44fc9f31-1923-4b86-a377-a9a3f20ff5e4`), linked to `coop/`.
- [x] Netlify env vars set: `YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [x] `coop/scripts/set-parent-pin.mjs` written; deps installed (`npm install` in `coop/`).
- [ ] **User to run** `set-parent-pin.mjs` to set the initial parent PIN. Command:
      ```
      cd coop && SUPABASE_URL=https://csbjszhlzdxeoqafggbw.supabase.co \
      SUPABASE_SERVICE_ROLE_KEY=<your service role key> \
      node scripts/set-parent-pin.mjs
      ```
      Never commit the service role key. `sessionStorage` caches the PIN client-side per browser tab.
- [x] Refactor `kids-videos.html` → `index.html` + `js/{data,writer,blocklist,youtube,avatars,ui}.js`. No visual changes.
- [x] `netlify/functions/parent-write.js` — verify_pin, set_parent_pin, set/clear_kid_pin, add/edit/delete_profile, add/remove_channel, set_profile_channels, add/remove_oneoff_video, hide/unhide_video, add/remove_blocklist_keyword, set_hide_shorts, seed_starter_channels.
- [x] `netlify/functions/sync-youtube.js` — scheduled every 6h; playlistItems + videos.list; HEAD-probe /shorts/{id}; blocklist match; upsert never touches `is_oneoff` or an existing `is_short`; disappearance sweep marks `unavailable`.
- [ ] Deploy to production.
- [ ] Seed profiles (RC, Brody) and starter channels — parent enters PIN, uses **+ Add** in Parent Settings to create both kids, then invokes the `seed_starter_channels` op (either via `netlify functions:invoke parent-write` or via a small parent-mode button we can add later).
- [ ] Manually invoke `sync-youtube` after seeding to populate feeds: `cd coop && netlify functions:invoke sync-youtube`.
- [ ] Full verification (see plan): RLS denies anon writes; service-role RPCs 401 for anon; lockout after 5 wrong PINs; kid PIN RPC; Shorts probe; disappearance; one-off protection; cascade; hide_shorts toggle; secret hygiene.
- [ ] iPad: install as PWA, sign in as each kid, feeds render.

## Known gaps to revisit

- `netlify dev` locally in this repo needs the CLI to be run from `coop/` for functions to load (otherwise it treats the repo root as the base). Production is unaffected.
- No UI yet for triggering `seed_starter_channels` from parent mode; only via `netlify functions:invoke`.
- No UI for triggering an on-demand sync from parent mode (falls back to scheduled runs).
- No `apple-touch-icon.png` / `manifest.webmanifest` / `sw.js` yet — knee-program has a template we can copy when polishing.
- Search UI: `data.searchFeedForProfile` exists but no on-screen search field yet.

## Backlog

- Hard-prune `availability='unavailable'` videos after N days (currently kept indefinitely so they can un-hide if they return).
- Bulk-import parent-write op for pasting many one-off video URLs at once.
- `set-kid-pin.mjs` local script (optional — kid PINs can be set via parent mode).
- Add per-profile "remove channel" (currently `remove_channel` is global). Wire via `set_profile_channels` when we need it.
