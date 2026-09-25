# portfolio

Personal portfolio, migrating off WordPress to static HTML/CSS. Placeholder — migration not started.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex`, intentional |
| **Dev port** | 8888 |

Netlify site name and ID: see the table in the root `../CLAUDE.md`. Do not duplicate them here — the root table is authoritative.

## Run locally

```bash
cd portfolio && netlify dev      # or: npm run dev:portfolio
```

## Conventions and gotchas specific to this project

Hand-written semantic HTML + one stylesheet. No framework, no build step — same as the other sites here. If it grows past ~10 near-identical pages, that's the point to reconsider a static site generator, not before.

Images go in `assets/`. If old WordPress URLs must keep working, add them as redirects in `netlify.toml`.

## What NOT to change without asking

- `noindex` is intentional on every rooster site, this one included. Removing it takes edits in two places (`netlify.toml` headers and the `<meta name="robots">` tag on every page). Do not lift it without confirming — a portfolio "should" be indexed but this one deliberately isn't.

## Related docs

- Root `../CLAUDE.md` — accounts, Netlify/Supabase verification, new-site rules.
- Root `../decisions.md`, `../gotchas.md` — repo-wide.
- `./STATUS.md` — current work and blockers for this project.
