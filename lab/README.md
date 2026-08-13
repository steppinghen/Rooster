# lab

Playground. `index.html` links to experiment subfolders; each subfolder is self-contained.

| | |
|---|---|
| **URL** | _not deployed yet_ |
| **Gated** | **Yes** — Supabase magic link, `site = 'lab'` |
| **Indexed** | No — `X-Robots-Tag: noindex` |
| **Dev port** | 8891 |

## Run locally

```bash
cd lab && netlify dev      # or: npm run dev:lab
```

Auth is bypassed on localhost. Real flow: <http://localhost:8891/?forceauth=1>

## Adding an experiment

```bash
mkdir lab/my-experiment
echo '<!DOCTYPE html><meta charset="utf-8"><title>my-experiment</title><h1>hi</h1>' \
  > lab/my-experiment/index.html
```

Then add a link to `lab/index.html` (there's a commented template in the markup):

```html
<a class="exp" href="my-experiment/">
  <span class="exp-name">my-experiment</span>
  <span class="exp-desc">What it does</span>
</a>
```

The index isn't generated — if you don't add the row, the folder still deploys and is still reachable by URL, just unlisted.

## Gate coverage — important

The gate is **per page**, not per site. `lab/index.html` loads the overlay; a subfolder's `index.html` does not, unless you add the same four `<head>` tags:

```html
<link rel="stylesheet" href="../vendor/auth-overlay.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>
<script src="../auth-config.js"></script>
<script src="../vendor/auth-overlay.js"></script>
```

Note the `../` — paths are relative to the subfolder. Without these, the experiment is wide open to anyone who knows the URL. The `noindex` header still applies (it's set at the site level), so it stays out of Google either way.

## Access

```sql
insert into allowed_emails (email, site) values ('someone@example.com', 'lab');
```

## Setup status

- [x] `auth-config.js` wired to the personal Supabase project
- [ ] Run `_shared/schema.sql` in that project — **required**, the gate denies everyone until `is_email_allowed()` exists
- [ ] Add your email to `allowed_emails`
- [ ] Add redirect URLs in Supabase → Authentication → URL Configuration (`http://localhost:8891/**` for local testing, plus the deployed URL)
