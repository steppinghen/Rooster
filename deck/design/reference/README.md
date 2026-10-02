> **Phase 1 references, superseded by design/canvas/ for Phase 1.5. Do not build from these.**

# Design reference: Comic Shop direction

Mockups exported from the design canvas "The Deck — Comic Shop Screens." They are the **visual target** for The Deck. The rules behind them are in `CLAUDE.md` ("Visual direction," "Two volume levels," the token table, and "Wave Check scale"). Where a mockup and `CLAUDE.md` disagree, `CLAUDE.md` wins.

## How to use these

- They are reference, not code to copy. They are fixed-size artboards with inline styles and Google Fonts links; the app uses design tokens, the `data-volume` theme, components, and self-hosted fonts.
- Kid accent placeholders were filled with magenta `#FF3E8A`. In the app, accent comes from each kid's profile.
- Each file ends with a design-tool script block (`text/x-dc`) that won't run outside the tool. `Sticker Wall` uses a template loop (`sc-for`), so its sticker grid won't render standalone; the script block lists the sample data.
- Parent names were replaced with Parent A and Parent B. Use only placeholder names in the app and tests.
- To view them, render each file with Playwright (WebKit) on the Mac, where Google Fonts can load, and save PNGs to `design/reference/png/`.

## Screens

| File | Size | What it shows | Phase |
|---|---|---|---|
| `Main.html` | iPhone 390×844 | Parent Today timeline, normal styling | 1 (parent dashboard) |
| `GromZone.html` | iPhone | Kid B home on a phone, normal | 1 (kid home) |
| `Shred.html` | iPhone | Celebration burst | Style reference; used after timed sessions in Phase 1, chores in Phase 3 |
| `iPadHub.html` | iPad landscape 1180×820 | Kitchen hub | Layout reference for the parent dashboard on iPad |
| `iPadGromZone.html` | iPad portrait 820×1180 | Kid home, normal | 1 (kid home) |
| `iPadGromZoneFocus.html` | iPad portrait | Kid home, focus styling | 1 (focus modes). Do **not** build its dimmed "Later" row; hidden modules stay hidden |
| `iPadSession.html` | iPad portrait | Session task in focus styling | Styling reference; content is Phase 2 |
| `iPadWaveCheck.html` | iPad portrait | Wave Check, normal | 1 |
| `iPadLastRun.html` | iPad portrait | Wave Check inside Last Run, focus | 1 |
| `iPadStickerWall.html`, `iPadStickerWallFocus.html` | iPad portrait | Sticker Wall | Phase 3. Style reference only |

| `iPadDawnPatrolDay.html` | iPad portrait | Kid home in Dawn Patrol, **day ground**, normal | 1 (kid home, routines) |
| `iPadDawnPatrolDayFocus.html` | iPad portrait | Routine step, day ground, focus | 1 (routines, focus modes) |
| `iPadHubDay.html` | iPad landscape | Kitchen hub, day ground | Layout reference for the parent dashboard on iPad |
| `MainDay.html` | iPhone | Parent Today, day ground | 1 (parent dashboard) |

The chores shown on kid screens (Feed the turtle, Toys away) are sample content. Chores themselves are Phase 3; in Phase 1, the "up next" slot shows the next routine step.
