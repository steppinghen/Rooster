# portfolio

Personal portfolio, migrating off WordPress to static HTML/CSS. **Placeholder — migration not started.**

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex` **(remove before launch, see below)** |
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

## Before launch — remove noindex

Every rooster site ships `noindex` by default. A portfolio you want found needs that deleted from `portfolio/netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Robots-Tag = "noindex, ..."   # ← delete this block
```

Also drop `<meta name="robots" content="noindex, nofollow">` from each page's `<head>`. Both have to go — either one alone keeps you out of search results.
