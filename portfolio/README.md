# portfolio

Personal portfolio, migrating off WordPress to static HTML/CSS. **Placeholder — migration not started.**

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex`, intentional |
| **Dev port** | 8888 |

## Run locally

```bash
cd portfolio && netlify dev      # or: npm run dev:portfolio
```

## Blocked on

Migration needs one of:

- **WordPress export** — WP Admin → Tools → Export → All content (`.xml`), or
- **The live URL**, to crawl and convert

Also needed:

- Which pages/posts survive the move
- Whether old URLs must keep working (→ redirects in `netlify.toml`)
- Any assets to carry over (images land in `assets/`)

## Plan

Hand-written semantic HTML + one stylesheet. No framework, no build step — same as the other sites here. If it grows past ~10 near-identical pages, that's the point to reconsider a static site generator, not before.

## noindex is intentional

This site is deliberately kept out of search results, like every site in the monorepo. Nothing to undo — migrated pages should carry the same `<meta name="robots" content="noindex, nofollow">` tag.

If that ever changes, it has to come out of **two** places: the `[[headers]]` block in `netlify.toml` and the `<meta>` tag on every page. Either one alone keeps it unindexed.
