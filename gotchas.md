# Gotchas

Traps found while building this, and the fix. Add to it rather than re-learning.

---

## The auth overlay is not security

It hides page content. It does not protect files.

Every file in a site folder is a public URL on a public CDN. `hvac-visits/app.js`, `lab/secret-thing/index.html`, any image — all fetchable by anyone who knows or guesses the path, whether or not they can sign in. The overlay is JavaScript running on the visitor's machine, and the visitor controls that machine.

So:

- **Fine to gate this way:** keeping a half-built tool out of sight, a personal playground, anything where exposure is embarrassing rather than harmful.
- **Not fine:** anything genuinely confidential in the static files. Put it in Supabase behind RLS, where the database checks the user's JWT on every query, server-side.

The gate decides what the page *shows*. RLS decides what the data *gives*. Only the second one is enforcement.

## `_shared/` paths break only after deploy

Referencing `../_shared/auth-overlay.js` works perfectly with `netlify dev` from the repo root and 404s in production — Netlify publishes only the site's base directory, so nothing above it exists.

Always copy into the site's own `vendor/`. `npm run sync:auth` does it. If a gated site shows a blank page in production but works locally, check the network tab for a 404 on the overlay first.

## Blank page = the gate failed closed

Hidden-until-authed means a broken overlay renders nothing at all. The usual causes, in order:

1. supabase-js CDN blocked or down → `supabase is not defined` in console
2. `auth-config.js` not loaded, or loaded *after* `auth-overlay.js` — order matters
3. `auth-config.js` still has `YOUR-PROJECT` placeholders
4. JS disabled

The console message is the fast diagnosis; the overlay logs `[rooster-auth]` on every failure path. To confirm it's the gate and not your page, look for `class="rooster-auth-pending"` on `<html>` in the inspector.

## Magic link redirects to the wrong place

Supabase only redirects to URLs on its allow-list. Every origin needs adding under **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:8890/**` and `http://localhost:8891/**` for local `?forceauth=1` testing
- the `*.netlify.app` URL for each gated site
- any custom domain

Miss one and the link silently lands on the Site URL default instead — looks like the link "didn't work" when auth actually succeeded.

## The localhost bypass hides auth breakage

`netlify dev` serves on localhost, so the bypass means your normal local loop **never exercises login**. You can ship a completely broken gate and not notice.

Before deploying anything gated: `http://localhost:8890/?forceauth=1` and actually sign in.

## `netlify dev` needs TWO ports pinned, not one

Setting `[dev] port` is not enough to run sites side by side. `netlify dev` also starts an internal static server that defaults to **3999 for every site**, so the second one you launch dies:

```
Error: listen EADDRINUSE: address already in use ::1:3999
```

The failure names 3999, a port you never configured, which makes it look unrelated to the site you just started. Each `netlify.toml` therefore pins both:

```toml
[dev]
  port             = 8891   # the URL you open
  staticServerPort = 3994   # internal, must also be unique
```

Current assignments: portfolio 8888/3991, dad-contracting 8889/3992, hvac-visits 8890/3993, lab 8891/3994. **Any new site needs both**, or it'll work alone and break the moment two are running.

Also: `netlify dev` takes a few seconds to bind. A script that curls immediately gets connection-refused from a server that's about to be fine — poll rather than assume.

## Two places set noindex

Both must go when a site should be indexed:

1. the `[[headers]]` block in the site's `netlify.toml`
2. `<meta name="robots" content="noindex, nofollow">` in each page's `<head>`

Either one alone keeps you out of search results, and the meta tag is easy to forget because the header is the one you tested.

## robots.txt does not do this

`Disallow` blocks crawling, not indexing. A blocked URL linked from elsewhere can still appear in results — and because the crawler never fetches it, it never sees your `noindex`. Blocking a page is the one way to *guarantee* the noindex is never read.

Leave sites crawlable and let the header work. Verify:

```bash
curl -sI https://<site>.netlify.app | grep -i x-robots-tag
```

## Removing someone's access takes two steps

Deleting from `allowed_emails` stops new logins but **does not end existing sessions** — a signed-in user keeps working until their token expires, since the check only runs on load and on auth-state change.

To actually cut someone off: delete the row, then delete the user in **Supabase → Authentication → Users**.

## Every push rebuilds every site

All four sites watch the same repo and the same branch, so a one-line change to `lab/` triggers four builds. Harmless at this size, irritating later.

Fix per site with **Site settings → Build & deploy → Ignore builds** — Netlify runs the command and skips the build when it exits `0`:

```bash
git diff --quiet HEAD^ HEAD -- .
```

Run from the site's base directory, this skips whenever nothing in that folder changed.

## `lab/` subfolders are not gated by default

The gate is per page. `lab/index.html` loads the overlay; `lab/whatever/index.html` does not, unless you add the same four `<head>` tags with `../` paths. See `lab/README.md`.

The `noindex` header *is* site-wide, so an ungated experiment still stays out of Google. It's reachable by anyone with the URL, though.

## `shouldCreateUser: true` creates accounts on sign-in

Carried over from the original. It's safe here because the allow-list is checked before the magic link is ever sent — but the ordering *is* the safeguard. If you refactor `handleLogin()`, keep the check first, or the endpoint becomes an open account-creation form.

## The publishable key is fine to commit; the secret key is not

Supabase renamed these. The old `anon` JWT is now the **publishable key** (`sb_publishable_…`), and `service_role` is now the **secret key** (`sb_secret_…`). Same split as before:

- **Publishable** — designed to ship in client code. Its reach is whatever RLS allows. That's why RLS has to actually be on: with policies disabled, that same public key reads every table.
- **Secret** — bypasses RLS entirely. Never belongs in this repo, in any file, on any branch. Server-side only, and `.env*` is gitignored for exactly this reason.

Two knock-on effects of the rename worth knowing:

`supabaseAnonKey` still works in `auth-config.js` as a fallback, so an old config won't break — but new sites should use `supabasePublishableKey`.

The publishable key is **not a JWT**, unlike the old anon key. That looks like it should break `Authorization: Bearer <key>`, which is what the ported code sends. It doesn't — Supabase's gateway accepts the publishable key in both `apikey` and `Authorization`. Verified against the live project; don't "fix" it.

## Roles in SQL are still `anon` and `authenticated`

The key rename didn't rename the Postgres roles. `grant execute on function … to anon` in `schema.sql` is still correct — a request carrying the publishable key resolves to the `anon` role, and one carrying a signed-in user's JWT resolves to `authenticated`.

## Don't point personal sites at the work Supabase project

`comms-platform/config.js` holds the MBA project URL and anon key, and copying them here is the path of least resistance. Don't. That project is work infrastructure under a BAA; personal projects sharing its auth means sharing its user table and its blast radius. Use a separate personal project — see `decisions.md`.
