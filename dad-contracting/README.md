# dad-contracting

Simple static marketing site for Dad's contracting business.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex`, intentional |
| **Dev port** | 8889 |

## Run locally

```bash
cd dad-contracting && netlify dev      # or: npm run dev:dad-contracting
```

## Status

Scaffold with placeholder copy. Needs real content before it goes anywhere:

- [ ] Business name, phone, email, service area
- [ ] Actual service list
- [ ] Photos of past work → `assets/`
- [ ] License / insurance details if they should be shown

## noindex is intentional

This site is deliberately kept out of search results, like every site in the monorepo. Nothing to undo before launch — the site is meant to be shared by link, not found by search.

If that ever changes, it has to come out of **two** places: the `[[headers]]` block in `netlify.toml` and the `<meta name="robots">` tag in `index.html`. Either one alone keeps it unindexed.
