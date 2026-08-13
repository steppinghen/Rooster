# \_shared

Reusable pieces copied into sites. **Not a deployable site** — no `netlify.toml`, never linked to Netlify.

Copy from here; don't symlink or reference across folders. Each Netlify site only publishes its own directory, so a link outside it resolves to nothing once deployed.

| File | What it is |
|---|---|
| `auth-overlay.js` | Supabase magic-link gate, ported from `comms-platform/mba-supabase.js` |
| `auth-overlay.css` | Login card + gate styles, namespaced `.rooster-*` |
| `auth-config.example.js` | Per-site config template |
| `schema.sql` | `allowed_emails` table + `is_email_allowed()` function |
| `noindex-headers` | `X-Robots-Tag` snippet for `netlify.toml` / `_headers` |

## Gating a new site

```bash
cp _shared/auth-overlay.js _shared/auth-overlay.css my-site/vendor/
cp _shared/auth-config.example.js my-site/auth-config.js
```

Edit `my-site/auth-config.js` (set `site:` to match the folder name), then in `<head>` — **this order matters**:

```html
<link rel="stylesheet" href="vendor/auth-overlay.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>
<script src="auth-config.js"></script>
<script src="vendor/auth-overlay.js"></script>
```

Add the email to `allowed_emails` with `site = 'my-site'`, and add the deployed URL to Supabase → Authentication → URL Configuration → Redirect URLs.

## How the gate behaves

- `auth-overlay.js` puts `.rooster-auth-pending` on `<html>` synchronously, and the CSS hides everything except the overlay. Gated content is never painted, even for a frame.
- **Fails closed.** If the CDN is down or JS is off, the page stays blank rather than open.
- On `localhost` / `127.0.0.1` auth is skipped entirely (ported from the original). `?forceauth=1` exercises the real flow locally.
- Emits `rooster:authed` on `document` once a session is confirmed — hook app startup to it:

```js
document.addEventListener('rooster:authed', function (e) {
  startApp(e.detail.email);
});
```

`window.roosterAuth` exposes `.signOut()`, `.email()`, `.isLocalBypass()`.

## What this is and isn't

It's a **UX gate**: it decides what the page shows. It is not a security boundary. Everything in the folder is a public file on a public URL — the overlay hides it, it doesn't protect it. Anyone can read `auth-overlay.js`, skip it, and fetch your HTML, CSS, JS, and images directly.

Anything that must actually stay private belongs in Supabase behind RLS, where the database enforces it against the user's JWT. See `gotchas.md`.

## Updating the overlay

The copies are independent. After editing here:

```bash
for s in hvac-visits lab; do
  cp _shared/auth-overlay.js _shared/auth-overlay.css "$s/vendor/"
done
```

`npm run sync:auth` from the repo root does exactly this.
