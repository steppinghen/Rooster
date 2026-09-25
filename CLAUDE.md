# CLAUDE.md — Rooster

See `README.md`, `decisions.md`, and `gotchas.md` for project context.

## Accounts

| Service | This repo uses |
|---|---|
| GitHub | `steppinghen`, through SSH alias `github.com-rooster` (remote `git@github.com-rooster:steppinghen/Rooster.git`) |
| Commit identity | Stephen Ayers <316376381+steppinghen@users.noreply.github.com>, set by `~/.gitconfig-rooster` via `includeIf` |
| Netlify | Account `steppinghen.nc@gmail.com`. **One site per subfolder; the repo root is intentionally not linked.** See the table below. |
| Supabase | Project ref `csbjszhlzdxeoqafggbw` (linked at repo root; stored in `supabase/.temp/project-ref`) |

| Folder | Netlify site | Site ID |
|---|---|---|
| `portfolio/` | `rooster-portfolio` | `fbf41681-1128-4d70-8db8-f8e070f54888` |
| `dad-contracting/` | `rooster-dad` | `48a98ee4-3dd1-4f06-b325-057cfcdcecb4` |
| `hvac-visits/` | `rooster-hvac` | `8956daf6-d01c-4042-b89f-0dc3748bcaa3` |
| `lab/` | `rooster-lab` | `a57208ba-f912-4996-a075-5c23ed3336f8` |
| `knee-program/` | `rooster-knee` | `25eff7d5-147c-432b-86da-24c8af851fd8` |

`NETLIFY_AUTH_TOKEN` and `SUPABASE_ACCESS_TOKEN` come from `.claude/settings.local.json` (gitignored). Never print, log, or commit them.

**Rule — verify accounts before any push, deploy, or migration.** Before `git push`, any `netlify deploy`, or any Supabase migration / `supabase db push` / SQL that changes a remote database, run the checks below and compare each result to the table above. If anything does not match, or a check errors, **stop and ask the user before continuing.** Do not "fix" a mismatch on your own by switching accounts, relinking, or editing remotes. Never run `netlify deploy` or `netlify link` from the repo root; always `cd` into the site's folder first.

```bash
ssh -T git@github.com-rooster      # expect: Hi steppinghen!
git remote get-url origin          # expect: git@github.com-rooster:steppinghen/Rooster.git
git config user.email              # expect: 316376381+steppinghen@users.noreply.github.com
(cd <folder> && netlify status)    # expect: user steppinghen.nc@gmail.com and the site/ID from the table above
cat supabase/.temp/project-ref     # expect: csbjszhlzdxeoqafggbw
supabase projects list             # expect: csbjszhlzdxeoqafggbw present and marked linked (●)
```

## New site

**Hosting**

- Each new project gets its own subfolder at the repo root, with its own Netlify site. Never deploy from the repo root.
- Before creating a site, run the account checks above and confirm the Netlify team is the steppinghen team (`rooster-nc`). If it isn't, stop and ask the user.
- Name the site `rooster-<project-name>`, create it in that team, and link only the project's subfolder. Add the new folder, site name, and site ID to the table above.
- After deploying, confirm the live URL loads publicly (no 401) and report the URL.

**Database**

- All rooster projects share one Supabase project (ref `csbjszhlzdxeoqafggbw`). Before any database change, confirm the linked ref matches. If it doesn't, stop and ask the user.
- Every table name starts with the project's prefix (for example `kids_`, `knee_`). Never create or change a table without a prefix, and never touch another project's tables.
- Every new table has row-level security enabled, with its policies written in the same migration.
- All changes go through migration files in `supabase/migrations`, pushed with the Supabase CLI. No changes made by hand in the dashboard.
- Before pushing a migration, show the user the SQL and wait for their OK.
