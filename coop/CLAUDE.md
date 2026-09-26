# coop

Coop TV — a curated, ad-free YouTube PWA for the boys' iPads. Only content the parent has approved shows up. Replaces YouTube Kids.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — the whole app is public; parent mode sits behind a PIN (verified server-side) |
| **Indexed** | No — `X-Robots-Tag: noindex` + `robots` meta tag |
| **Dev port** | 8893 |

Netlify site name and ID: see the table in the root `../CLAUDE.md`. Do not duplicate them here — the root table is authoritative.

## Run locally

```bash
cd coop && netlify dev      # or: npm run dev:coop
```

Netlify Functions are served locally on the same port. Env vars are read from the linked Netlify site (`netlify link`) or a local `.env` (gitignored). See "Environment variables" below.

## The rules that make this project what it is

- **Search only queries approved content in Supabase.** Never call the YouTube `search.list` endpoint, from anywhere. If you find yourself typing `youtube.googleapis.com/youtube/v3/search`, stop.
- **Kid iPads read only.** They use the Supabase publishable key and only ever `select`. Every write path goes through `netlify/functions/parent-write.js`, which uses the service-role key and verifies the parent PIN via `coop_verify_parent_pin` in Postgres. Never call service-role Supabase code from the browser.
- **Parent PIN**: brute-force protection lives in `coop_verify_parent_pin` (5 fails → 15 min lockout). Function is service-role-only; do not grant execute to anon. Kid PINs live in `coop_kid_pins` (anon-invisible) and are verified via the anon-callable `coop_verify_kid_pin` RPC.
- **Minecraft rule**: beyond the two official Minecraft channels (`Minecraft`, `Minecraft Education`), Minecraft content is only added as individual one-off approved videos. Never approve another Minecraft creator channel wholesale.
- **Blocklist** (`coop_blocklist_keywords`) is whole-word, case-insensitive. Applied at sync time (marks `blocked_by_keyword=true`) and at display time. Seeded with `Milo` and `Chip`.
- **Shorts / livestreams / premieres** are always hidden by default. `hide_shorts` is a parent-toggleable setting in `coop_public_settings` (anon-readable); livestreams and upcoming premieres are hidden unconditionally.
- **One-off approvals survive channel removal.** `coop_videos.is_oneoff=true` rows are preserved when their owning channel is removed (FK is `on delete set null`). The sync's upsert never overwrites `is_oneoff`.
- **`coop_videos.is_short` is probed once** via HEAD to `https://www.youtube.com/shorts/{id}` and never re-probed. A video's Short-ness doesn't change after upload.

## Database

- All tables prefixed `coop_`. See migration `supabase/migrations/<ts>_coop_initial.sql` for the full schema and RLS.
- Two tables are anon-invisible (no anon policy at all): `coop_settings` (PIN hash + lockout state) and `coop_kid_pins`.
- All others are anon-select-only. No table grants anon insert/update/delete.
- PIN hashing: pgcrypto `crypt(pin, gen_salt('bf'))`. Verification via `SECURITY DEFINER` functions.

## Environment variables (set via Netlify UI, never in the repo)

- `YOUTUBE_API_KEY` — Data API key. Used only by `sync-youtube` and by `parent-write`'s `add_channel` op.
- `SUPABASE_URL` — Rooster project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key. Functions only. Never in client, never in repo, never in logs.

`config.js` (shipped to the browser) holds only `SUPABASE_URL` and the publishable key.

## Layers — keep them separate

The UI is a placeholder for now. When the UI changes, none of this should have to move:

- `js/data.js` — every read the app does (feeds, search, profile lookup, kid-pin RPC). Anon Supabase client.
- `js/writer.js` — every write. Wraps POSTs to `/.netlify/functions/parent-write` with the cached parent PIN.
- `js/blocklist.js` — the whole-word matcher, shared byte-for-byte with `netlify/functions/sync-youtube.js`.
- `js/youtube.js` — IFrame player wrapper.
- `js/ui.js` — screens + rendering. **This is the layer that will change.** It calls `data.*` and `writer.*`; it never touches Supabase or fetch directly.

## What NOT to change without asking

- `noindex` — edits in two places (`netlify.toml` headers and the `<meta name="robots">` tag).
- Do not add a `search.list` call to YouTube anywhere. Search is Supabase-only.
- Do not remove RLS from any `coop_*` table.
- Do not grant `execute` on `coop_verify_parent_pin`, `coop_set_parent_pin`, `coop_set_kid_pin`, or `coop_clear_kid_pin` to anon or authenticated. Service role only.
- Do not weaken the parent PIN lockout in `coop_verify_parent_pin`.
- Do not commit `YOUTUBE_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` anywhere — not in `config.js`, not in a `.env`, not in a comment.
- Do not use `on delete cascade` on `coop_videos.channel_id`. It must be `on delete set null` to preserve one-off approvals.
- Do not have the sync overwrite `is_oneoff` or re-probe `is_short`.

## Related docs

- Root `../CLAUDE.md`, `../decisions.md`, `../gotchas.md` — repo-wide.
- `./STATUS.md` — current work, blockers, manual steps outstanding.
