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

## Setup status

- [x] `auth-config.js` wired to the personal Supabase project
- [ ] Run `_shared/schema.sql` in that project — **required**, the gate denies everyone until `is_email_allowed()` exists
- [ ] Add your email to `allowed_emails`
- [ ] Add redirect URLs in Supabase → Authentication → URL Configuration (`http://localhost:8890/**` for local testing, plus the deployed URL)

## Notes

- `vendor/` holds copies of `_shared/auth-overlay.{js,css}`. Edit the originals in `_shared/`, then `npm run sync:auth`.
- The gate hides the page; it does not protect the files. Anything genuinely sensitive belongs in Supabase behind RLS — see `gotchas.md`.
