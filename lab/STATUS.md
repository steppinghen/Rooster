# lab — status

## Currently working on

_none_

## Blockers / open questions

_none_

## Setup checklist

- [x] `auth-config.js` wired to the personal Supabase project
- [ ] Run `_shared/schema.sql` in that project — **required**, the gate denies everyone until `is_email_allowed()` exists
- [ ] Add your email to `allowed_emails`
- [ ] Add redirect URLs in Supabase → Authentication → URL Configuration (`http://localhost:8891/**` for local testing, plus the deployed URL)
- [ ] First deploy

## Backlog

_none_
