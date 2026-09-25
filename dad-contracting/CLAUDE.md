# dad-contracting

Simple static marketing site for Dad's contracting business.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex`, intentional |
| **Dev port** | 8889 |

Netlify site name and ID: see the table in the root `../CLAUDE.md`. Do not duplicate them here — the root table is authoritative.

## Run locally

```bash
cd dad-contracting && netlify dev      # or: npm run dev:dad-contracting
```

## Conventions and gotchas specific to this project

Hand-written HTML + one stylesheet. Photos of past work go in `assets/`.

## What NOT to change without asking

- `noindex` is intentional. This site is meant to be shared by link, not found by search. Removing it takes edits in two places (`netlify.toml` headers and the `<meta name="robots">` tag in `index.html`).

## Related docs

- Root `../CLAUDE.md` — accounts, Netlify/Supabase verification, new-site rules.
- Root `../decisions.md`, `../gotchas.md` — repo-wide.
- `./STATUS.md` — current work and blockers for this project.
