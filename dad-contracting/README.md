# dad-contracting

Simple static marketing site for Dad's contracting business.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | No — public |
| **Indexed** | No — `X-Robots-Tag: noindex` **(remove before launch)** |
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

## Before launch — remove noindex

A local business site that isn't indexed is invisible to the customers it's for. Delete the `[[headers]]` block from `netlify.toml` **and** the `<meta name="robots">` tag from `index.html`.

Worth doing at the same time: real `<title>` and `<meta name="description">`, plus [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business) — that's what surfaces hours and phone number in search results.
