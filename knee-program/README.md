# knee-program

A personal knee-rehab tracker: the exercises my PT prescribed, grouped by phase, each
with its own sets/reps/hold targets and a guided hold timer that counts each rep out
loud on screen so you're not watching a clock. Tick exercises off as you go; the
progress bar at the top tracks the day.

Single-file vanilla JS — `index.html` is the whole app. No build step, no dependencies,
no backend.

| | |
|---|---|
| **URL** | <https://rooster-knee.netlify.app> |
| **Gated** | **No** — see below |
| **Indexed** | No — `X-Robots-Tag: noindex` + `robots` meta tag |
| **Dev port** | 8892 |

## Run locally

```bash
cd knee-program && netlify dev      # or: npm run dev:knee-program
```

## No auth, on purpose

The other tools in this repo sit behind the Supabase magic-link gate. This one doesn't,
and doesn't need to: **all state lives in `localStorage` on the device**. There is no
account, no sync, no server, and nothing leaves the phone — so there's no shared
resource for a gate to protect. The deployed URL serves the same static app to anyone
who loads it; they just get their own empty tracker.

What that also means:

- **Clearing site data wipes your progress.** There is no backup and no export yet.
- Progress does not follow you between devices or browsers.
- iOS can evict `localStorage` for sites you haven't opened in a while. Installing it to
  the home screen (below) makes eviction much less likely.

## Install to the home screen

Committed here so it installs cleanly rather than showing a screenshot-of-a-webpage icon:

| File | What it's for |
|---|---|
| `manifest.webmanifest` | name, `standalone` display, theme colors, icon set |
| `apple-touch-icon.png` | 180×180 — iOS home screen |
| `icon-192.png`, `icon-512.png` | manifest icons (Android / PWA, incl. `maskable`) |

`index.html` carries the matching `apple-mobile-web-app-*` meta tags, so on iOS
(**Share → Add to Home Screen**) it opens full-screen with no Safari chrome. The layout
already pads for `env(safe-area-inset-*)`, which is what keeps the header clear of the
notch in standalone mode.

Icons are plain committed PNGs — regenerating them is a manual job, there's no asset
pipeline.

## Deploy

One folder = one Netlify site, same as every other site here. Already created and
deployed; these are the commands that did it:

```bash
cd knee-program
netlify sites:create --name rooster-knee --account-slug stevea
netlify link --name rooster-knee
netlify deploy --prod --dir . --no-build
```

After that, deploys are just the last line. Production deploys cost credits — do them
deliberately.

If you'd rather wire it through the UI: **Add new site → Import an existing project →**
this repo, **base** and **publish** directory both `knee-program`, **build command**
empty.

> **The account slug is `stevea`, not `rooster-nc`.** The root README's "Netlify sites"
> table describes a `rooster-nc` team and four `rooster-*` sites; as of this commit
> `netlify sites:list` shows neither — the only team is `stevea` (Free) and the only
> sites on it are the two `mybenefitsadvice.com` ones. That table is aspirational, so
> check `netlify status` before trusting it. The same goes for its note about team-wide
> SSO protection returning 401 — that's a paid feature and this team is on Free.

## Offline

A basic app-shell service worker (`sw.js`) is already in place and registered at the
bottom of `index.html`. It precaches `./` and `./index.html`, serves the shell
network-first (so a new deploy still shows up), and runtime-caches everything else
cache-first.

### Backlog — full offline caching

Not built yet. What's there covers the common case but isn't deliberate or verified:

- The precache list is only the HTML — icons, `manifest.webmanifest` and the Google
  Fonts CSS/woff2 are cached only if a request happens to go through while online, so a
  genuinely cold first-run-offline launch is unstyled at best.
- The cache name (`knee-v1`) is hardcoded, so a stale cache is only invalidated by
  editing `sw.js` by hand.
- A cold offline launch has never actually been tested (Airplane mode, force-quit,
  reopen from the home screen).

Doing it properly means precaching the full asset list, self-hosting or explicitly
precaching the fonts, versioning the cache per deploy, and then verifying a cold
offline start on a real device.
