# knee-program

A personal knee-rehab tracker: the exercises my PT prescribed, grouped by phase, each with its own sets/reps/hold targets and a guided hold timer that counts each rep out loud on screen so you're not watching a clock. Tick exercises off as you go; the progress bar at the top tracks the day.

Single-file vanilla JS — `index.html` is the whole app. No build step, no dependencies, no backend.

| | |
|---|---|
| **URL** | <https://rooster-knee.netlify.app> |
| **Gated** | **No** — see below |
| **Indexed** | No — `X-Robots-Tag: noindex` + `robots` meta tag |
| **Dev port** | 8892 |

Netlify site name and ID: see the table in the root `../CLAUDE.md`. Do not duplicate them here — the root table is authoritative.

## Run locally

```bash
cd knee-program && netlify dev      # or: npm run dev:knee-program
```

## Deploy

Production deploys cost credits — do them deliberately.

```bash
cd knee-program && netlify deploy --prod --dir . --no-build
```

## No auth, on purpose

The other tools in this repo sit behind the Supabase magic-link gate. This one doesn't, and doesn't need to: **all state lives in `localStorage` on the device**. There is no account, no sync, no server, and nothing leaves the phone — so there's no shared resource for a gate to protect. The deployed URL serves the same static app to anyone who loads it; they just get their own empty tracker.

Consequences:

- **Clearing site data wipes progress.** There is no backup and no export.
- Progress does not follow you between devices or browsers.
- iOS can evict `localStorage` for sites you haven't opened in a while. Installing to the home screen makes eviction much less likely.

## Install to the home screen

Committed here so it installs cleanly rather than showing a screenshot-of-a-webpage icon:

| File | What it's for |
|---|---|
| `manifest.webmanifest` | name, `standalone` display, theme colors, icon set |
| `apple-touch-icon.png` | 180×180 — iOS home screen |
| `icon-192.png`, `icon-512.png` | manifest icons (Android / PWA, incl. `maskable`) |

`index.html` carries the matching `apple-mobile-web-app-*` meta tags, so on iOS (**Share → Add to Home Screen**) it opens full-screen with no Safari chrome. The layout already pads for `env(safe-area-inset-*)`, which is what keeps the header clear of the notch in standalone mode.

Icons are plain committed PNGs — regenerating them is a manual job, no asset pipeline.

## Offline

A basic app-shell service worker (`sw.js`) is registered at the bottom of `index.html`. It precaches `./` and `./index.html`, serves the shell network-first (so a new deploy still shows up), and runtime-caches everything else cache-first.

Known limitations of the current service worker are in `./STATUS.md` under Backlog.

## What NOT to change without asking

- `noindex` — edits in two places (`netlify.toml` headers and the `<meta name="robots">` tag).
- Don't add auth or a backend. The `localStorage`-only model is intentional (see `../decisions.md` and the "No auth" section above).
- Don't change the service-worker cache name (`knee-v1`) without a plan — that's the only invalidation lever right now.

## Related docs

- Root `../CLAUDE.md`, `../decisions.md`, `../gotchas.md` — repo-wide.
- `./STATUS.md` — current work and known service-worker limitations.
