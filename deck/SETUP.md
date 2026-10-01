# The Deck: setup

How to rebuild the local environment from a clean checkout, or hand it off. Keep this short and current.

## Prerequisites

- Node 20+ (via nvm), npm
- Docker Desktop, running (the local Supabase stack runs in containers)
- Supabase CLI 2.118+ (`brew install supabase/tap/supabase`)
- Netlify CLI (only for `netlify dev`; deploys happen only at Gate 2)
- Tailscale, so the phone and iPad can reach the Mac

## First run

```bash
cd rooster/deck
npm install
npx playwright install webkit
supabase start          # local stack: API 54321, DB 54322, Studio 54323, mail viewer 54324
npm run env:local       # writes .env.local with the Tailscale IP and the local anon key
npm run dev             # netlify dev on 0.0.0.0:8894, Vite behind it on 3997
```

Open `http://<tailscale-ip>:8894` on the phone or iPad. `/styleguide` shows every component on both grounds and at both volumes.

Run `supabase` commands from `deck/`. This folder has its own `supabase/config.toml` (project id `deck`) and is **not linked** to any hosted project. The shared rooster project lives at the repo root and must never be touched from here.

## Ports

| What | Port |
|---|---|
| netlify dev (open this) | 8894 |
| Vite (behind netlify dev; Playwright uses it directly) | 3997 |
| Supabase API | 54321 |
| Postgres | 54322 |
| Studio | 54323 |
| Mail viewer (email sign-in codes land here) | 54324 |

The local stack listens on all interfaces so devices on the tailnet can reach it. It only ever holds seed data (Kid A, Kid B, Parent A, Parent B).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | netlify dev (8894) wrapping Vite (3997) |
| `npm run build` | Typecheck and production build (PWA, strict CSP meta tag) |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint |
| `npm run test:unit` | Vitest (pure logic in `src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright, WebKit, at iPad portrait, iPad landscape and iPhone sizes |
| `npm run test:db` | pgTAP tests (`supabase test db`) |
| `npm run env:local` | Regenerates `.env.local` from `supabase status` |
| `npm run render:reference` | Renders `design/reference/*.html` to `design/reference/png/` (gitignored) |
| `npm run icons` | Regenerates the app icons |

## Environment variables

Only two variables ever reach the browser; see `.env.example`.

| Variable | Local | Hosted (Gate 2) |
|---|---|---|
| `VITE_SUPABASE_URL` | `http://<tailscale-ip>:54321` (from `npm run env:local`) | Hosted project URL, set in Netlify site env |
| `VITE_SUPABASE_ANON_KEY` | Local anon key from `supabase status` | Hosted anon (publishable) key, set in Netlify site env |

The production build bakes `VITE_SUPABASE_URL` into the Content-Security-Policy, so `connect-src` allows only that one Supabase origin.

## Guided Access and Screen Time

_Written in slice 12._
