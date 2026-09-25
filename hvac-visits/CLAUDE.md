# hvac-visits

Visit-tracking tool. Scaffold — the gate works, the tool itself isn't built yet.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | **Yes** — Supabase magic link, `site = 'hvac-visits'` |
| **Indexed** | No — `X-Robots-Tag: noindex` |
| **Dev port** | 8890 |

Netlify site name and ID: see the table in the root `../CLAUDE.md`. Do not duplicate them here — the root table is authoritative.

## Run locally

```bash
cd hvac-visits && netlify dev      # or: npm run dev:hvac-visits
```

Auth is **bypassed on localhost** — you land straight in the app as `local-dev`. To test the real login flow: <http://localhost:8890/?forceauth=1>. Do this before every deploy — the bypass hides auth breakage.

## Conventions and gotchas specific to this project

**Access is managed in the `allowed_emails` table, not in this repo:**

```sql
insert into allowed_emails (email, site) values ('someone@example.com', 'hvac-visits');
```

`site = '*'` grants access to every rooster site at once.

**`vendor/` holds copies of `_shared/auth-overlay.{js,css}`.** Edit the originals in `_shared/`, then run `npm run sync:auth` from the repo root. Never point runtime code at `../_shared/...` — it works locally and 404s in production.

**The gate hides the page; it does not protect the files.** Anything genuinely sensitive belongs in Supabase behind RLS — see root `../gotchas.md`.

## Database tables

All tables for this project must be prefixed `hvac_` (see root `../CLAUDE.md` "Database" rules). Never create an un-prefixed table and never touch another project's tables.

## What NOT to change without asking

- `noindex` — edits in two places (`netlify.toml`, `<meta>` tag).
- The order of scripts in `<head>`: `auth-config.js` must load before `auth-overlay.js`, or the gate fails closed.
- `shouldCreateUser: true` in the overlay is only safe because the allow-list check runs first. If you refactor `handleLogin()`, keep that ordering.

## Related docs

- Root `../CLAUDE.md` — accounts, Netlify/Supabase verification, new-site rules.
- Root `../decisions.md`, `../gotchas.md` — repo-wide.
- `_shared/README.md` — auth-overlay setup and `allowed_emails` schema.
- `./STATUS.md` — current work and blockers for this project.
