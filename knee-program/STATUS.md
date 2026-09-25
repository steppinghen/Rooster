# knee-program — status

## Currently working on

_none_

## Blockers / open questions

_none_

## Backlog

### Full offline caching

Not built yet. What's there covers the common case but isn't deliberate or verified:

- The precache list is only the HTML — icons, `manifest.webmanifest`, and the Google Fonts CSS/woff2 are cached only if a request happens to go through while online. A genuinely cold first-run-offline launch is unstyled at best.
- The cache name (`knee-v1`) is hardcoded, so a stale cache is only invalidated by editing `sw.js` by hand.
- A cold offline launch has never actually been tested (Airplane mode, force-quit, reopen from the home screen).

Doing it properly means precaching the full asset list, self-hosting or explicitly precaching the fonts, versioning the cache per deploy, and then verifying a cold offline start on a real device.
