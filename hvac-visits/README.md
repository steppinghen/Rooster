# hvac-visits

Visit-tracking tool. Scaffold only — the gate works, the tool isn't built yet.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | **Yes** — Supabase magic link, `site = 'hvac-visits'` |
| **Indexed** | No — `X-Robots-Tag: noindex` |
| **Dev port** | 8890 |

## Run locally

```bash
cd hvac-visits && netlify dev      # or: npm run dev:hvac-visits
```

Auth is **bypassed on localhost** — you land straight in the app as `local-dev`. To test the real login flow: <http://localhost:8890/?forceauth=1>

## Access

Managed in the `allowed_emails` table, not in this repo:

```sql
insert into allowed_emails (email, site) values ('someone@example.com', 'hvac-visits');
```

`site = '*'` grants access to every rooster site at once.

## Before this works

1. Fill in `auth-config.js` with your personal Supabase URL + anon key
2. Run `_shared/schema.sql` in that project
3. Add the deployed URL to Supabase → Authentication → URL Configuration → Redirect URLs

## Notes

- `vendor/` holds copies of `_shared/auth-overlay.{js,css}`. Edit the originals in `_shared/`, then `npm run sync:auth`.
- The gate hides the page; it does not protect the files. Anything genuinely sensitive belongs in Supabase behind RLS — see `gotchas.md`.
