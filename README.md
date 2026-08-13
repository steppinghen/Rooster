# rooster

Personal projects monorepo. One GitHub repo, several independent Netlify sites — one per top-level folder.

## Projects

| Folder | What it is | URL | Gated | Indexed | Dev port |
|---|---|---|---|---|---|
| [`portfolio/`](portfolio/) | Portfolio, migrating off WordPress | _tbd_ | No | No | 8888 |
| [`dad-contracting/`](dad-contracting/) | Contracting business site | _tbd_ | No | No | 8889 |
| [`hvac-visits/`](hvac-visits/) | Visit-tracking tool | _tbd_ | **Yes** | No | 8890 |
| [`lab/`](lab/) | Experiments playground | _tbd_ | **Yes** | No | 8891 |
| [`_shared/`](_shared/) | Library — copied from, never deployed | — | — | — | — |

**No site is indexed, by design.** `X-Robots-Tag: noindex` plus a `robots` meta tag on every site, public ones included — these are shared by link, not found by search. New sites inherit it.

## Conventions

**Folder names are kebab-case and describe the thing.** `dad-contracting`, not `dadsite` or `project2`.

**Every project folder has its own `README.md`** stating what it is, its URL, and whether it's gated.

**One folder = one deployable Netlify site.** A folder is self-contained: its own `index.html`, its own `netlify.toml`, its own copy of anything shared. Nothing reaches outside its own directory at runtime — Netlify only publishes the folder, so `../_shared/x.js` is a 404 in production even though it works locally.

**`_shared/` is a library you copy from.** It has no `netlify.toml` and is never linked to Netlify. Copying means the sites drift independently; that's the accepted trade — see `decisions.md`.

**Leading underscore = not a site.** Any future `_*` folder is tooling, not a deployable.

## Local preview

Requires the [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`netlify --version`).

```bash
npm run dev:portfolio        # → http://localhost:8888
npm run dev:dad-contracting  # → http://localhost:8889
npm run dev:hvac-visits      # → http://localhost:8890
npm run dev:lab              # → http://localhost:8891
```

Or `cd <folder> && netlify dev`. Each site pins **two** ports — the one you open, plus `staticServerPort` for Netlify's internal server — so all four can run at once. A new site needs both set, or it'll collide; see `gotchas.md`.

`netlify dev` (rather than any static server) is the point: it applies `netlify.toml` headers and redirects locally, so you can confirm the `noindex` header is really there —

```bash
curl -sI http://localhost:8891 | grep -i x-robots-tag
```

The gated sites **skip auth on localhost**. Add `?forceauth=1` to exercise the real login flow.

## Deploying a site

Each folder becomes its own Netlify site from the same repo:

1. Netlify → **Add new site** → **Import an existing project** → this repo
2. **Base directory:** the folder (e.g. `hvac-visits`)
3. **Publish directory:** the same folder
4. **Build command:** leave empty — these are static
5. Repeat per folder

Netlify will rebuild every linked site on each push to `main`. To stop untouched sites rebuilding, set each site's **Build settings → Stop builds** or add an ignore command — noted in `gotchas.md`.

## Auth

Gated sites use a Supabase magic-link overlay ported from `comms-platform`. Setup, the `allowed_emails` schema, and what the gate does and doesn't protect: [`_shared/README.md`](_shared/README.md).

**The gate is a UX gate, not a security boundary.** It hides page content; it does not protect files on a public URL. Real protection is RLS on your Supabase data.

## Repo docs

- [`decisions.md`](decisions.md) — why things are the way they are
- [`gotchas.md`](gotchas.md) — traps, and how to avoid re-learning them

## Layout

```
rooster/
├── README.md
├── decisions.md
├── gotchas.md
├── package.json          dev + sync scripts
├── _shared/              library — NOT deployed
│   ├── auth-overlay.js
│   ├── auth-overlay.css
│   ├── auth-config.example.js
│   ├── schema.sql
│   └── noindex-headers
├── portfolio/
├── dad-contracting/
├── hvac-visits/
└── lab/
```

## Netlify sites

Created under the **Rooster** team (`rooster-nc`), each folder linked to its own site.

| Folder | Site | URL | Deployed |
|---|---|---|---|
| `portfolio/` | `rooster-portfolio` | https://rooster-portfolio.netlify.app | ✅ prod |
| `dad-contracting/` | `rooster-dad` | https://rooster-dad.netlify.app | not yet |
| `hvac-visits/` | `rooster-hvac` | https://rooster-hvac.netlify.app | not yet |
| `lab/` | `rooster-lab` | https://rooster-lab.netlify.app | not yet |

**Team-wide SSO protection is currently ON**, so deployed sites return 401 to the public. It must be turned off before the remaining sites are worth deploying — see `gotchas.md`. No custom domains or DNS are configured.

Deploy a site (production, costs credits — do it deliberately):

```bash
cd <folder> && netlify deploy --prod --dir . --no-build
```
