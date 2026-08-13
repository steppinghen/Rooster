# Decisions

Why things are the way they are. Newest first. When you reverse one of these, edit the entry rather than deleting it — the reasoning is the useful part.

---

## 2026-08-12 — Monorepo, multiple Netlify sites

One repo, one folder per site, each folder linked to Netlify separately with its own base directory.

Keeps one git history and one clone while sites stay independently deployable with their own domains and settings. Cost: every linked site rebuilds on every push to `main` unless told otherwise (see `gotchas.md`).

## 2026-08-12 — `_shared/` is copied, not imported

Sites get their own copy of `auth-overlay.{js,css}` in `vendor/`. `npm run sync:auth` re-copies.

Netlify only publishes the site's own directory. A runtime path like `../_shared/auth-overlay.js` works locally and 404s in production — a failure that shows up only after deploy. Copying is a bit dumb and completely reliable, and it means an experiment can pin an older overlay without breaking anything.

The trade is real: fix a bug in the overlay and you must re-sync, or copies drift. With two gated sites that's fine. Past ~5, revisit — either a build step or an `_shared`-as-published-site with absolute URLs.

## 2026-08-12 — Overlay injects its own DOM

The comms-platform original required `#loginOverlay` and `#appShell` markup in each page. The port builds the overlay in JS instead.

Adding a site is now four `<head>` tags rather than a markup block to keep in sync. It also removes the `#appShell` requirement — content is gated by a class on `<html>`, so pages don't need a specific wrapper element.

## 2026-08-12 — Gate hides content via `<html>` class, set synchronously

`auth-overlay.js` adds `.rooster-auth-pending` to `<html>` as it parses, and the CSS hides `body > *` except the overlay.

The original toggled `display` on `#appShell` after the session check resolved, which leaves gated content painted for a few hundred ms on a slow connection. Setting a class during parse means it's never painted at all.

Consequence: **fails closed.** If the Supabase CDN is unreachable or JS is disabled, the page stays blank instead of exposed. Correct for a gate, and worth knowing when someone reports "the page is empty."

## 2026-08-12 — Allow-list defaults to an RPC, not a table read

`allowListMode: 'rpc'` calls `is_email_allowed(email, site)`, a `SECURITY DEFINER` function. The table stays unreadable from the browser.

The original queried `allowed_emails` directly with the anon key, which needs a policy letting `anon` select — and that makes the entire list dumpable by anyone who reads the key out of your page source. The function answers one yes/no question and leaks nothing else.

`allowListMode: 'table'` still does it the original way if you want it, and `schema.sql` carries the commented-out policy.

## 2026-08-12 — One `allowed_emails` table, `site` column per site

Rather than a table per site or a hardcoded array per site. `site = '*'` grants access everywhere.

Access changes are one SQL insert, no deploy. A `allowedEmails: []` array in `auth-config.js` also works and is checked first — but it's readable by anyone, so it's for convenience, not privacy.

## 2026-08-12 — localhost bypass kept, with an escape hatch

Ported as-is: `localhost` and `127.0.0.1` skip auth entirely. `?forceauth=1` opts back into the real flow.

The bypass is genuinely convenient — no email round-trip to see a change. But it means the default local experience never exercises login, so auth breakage stays invisible until production. The escape hatch is the compromise; use it before every deploy of a gated site.

## 2026-08-12 — `noindex` on every site, including the public ones

The brief said every site, so every site has it.

Flagging the tension: `portfolio` and `dad-contracting` are public sites whose whole point is being found. Shipping them with `noindex` and forgetting is a genuinely easy mistake — a contracting business invisible to search is worse than no site. Removal instructions are in both READMEs and in `gotchas.md`, in both places it has to be removed (`netlify.toml` **and** the `<meta>` tag).

## 2026-08-12 — Headers in `netlify.toml`, not `_headers`

`_shared/noindex-headers` documents both forms; every site uses the `netlify.toml` one.

Netlify applies both files if both exist, and reconciling them later is guesswork. One file per site also puts headers and dev config in the same place.

## 2026-08-12 — Pinned dev ports per site (two each)

8888–8891 for the URLs, 3991–3994 for `staticServerPort`, in each `netlify.toml`.

`netlify dev` otherwise picks whatever's free, so the URL moves between runs — annoying with a magic-link redirect URL that has to match. Pinned ports keep Supabase redirect URLs stable.

The second port isn't optional: Netlify's internal static server defaults to 3999 for every site, so pinning only the public port still makes the second site fail with `EADDRINUSE`. Found by running all four at once; see `gotchas.md`.

## 2026-08-12 — No framework, no build step

Hand-written HTML + one stylesheet per site.

These are small static sites; a build step is another thing to break and to keep current. Revisit if a site passes ~10 near-duplicate pages, where templating starts earning its keep.

## 2026-08-12 — Separate Supabase project from work

`auth-config.js` files ship with `YOUR-PROJECT` placeholders, awaiting a **personal** Supabase project.

The comms-platform config points at the MBA/work project (`ppwlcnjgiuglonzyqqir`). That instance is work infrastructure under a BAA — personal side projects must not authenticate against it or share its user table. Cross-wiring a personal repo into work infrastructure is the kind of thing that's trivial to do and unpleasant to unwind.
