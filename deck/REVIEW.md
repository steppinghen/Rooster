# Phase 1 review packet

For the parent's single review at Gate 1. The builder fills this in slice by slice, and `phase-reviewer` finishes it in slice 12.

## 1. Summary

_Filled in slice 12._

## 2. Review these first

_Each item marked → REVIEW.md in the plan, with the SQL or code location, what it does, how it's tested, and trade-offs. Added as slices land._

## 3. Deviations

| # | Deviation | From | Why | Agreed |
|---|---|---|---|---|
| D1 | Parent sign-in is an **email one-time code plus TOTP MFA**, not Apple/Google or email + passkey | `CLAUDE.md` security req. 1 | Magic links open in Safari instead of the installed PWA (separate storage on iOS). Apple sign-in needs a paid developer account. Email code + TOTP gives 2FA without leaving the app. | Parent, before slice 0 |
| D2 | Hosted parent sign-in emails may need a **transactional email provider** (a third party), limited to parent email addresses and sign-in codes | `CLAUDE.md` security req. 7 | Supabase's built-in sender may deliver only to members of the Supabase org and is heavily rate-limited. Parent B must never be added to the org to get around this. No kid data goes to the provider. See Gate 2 step G3. | Parent, before slice 0 |
| D3 | The Deck's tables are **unprefixed** (`families`, `kids`, …) | Root `CLAUDE.md` "Database" rules (prefix per project, shared project) | The Deck has its own Supabase project (brief, "Architecture decisions"), so prefixes add nothing. The root `CLAUDE.md` gets a Deck exception at Gate 2. | Parent, before slice 0 |

## 4. Gaps

_Filled in slice 12._

## 5. Open questions

| # | Question | Default taken |
|---|---|---|
| Q1 | Emoji style: 3D or Flat | **Pending: the parent picks at the slice 0 stop** |
| Q3 | Kid PIN on a shared iPad | Both kids share one device identity, so the database can't tell them apart. The PIN keeps a sibling out of the other's profile in the UI only, which is what CLAUDE.md req. 4 asks for; a determined sibling with dev tools could still read the other kid's routine data. Accepted. |
| Q2 | How to close public sign-ups when "Allow new users to sign up" off also blocks anonymous (iPad) sign-ins | **Decided (parent):** the switch stays on; a `before_user_created` hook enforces the allowlist; a nightly job removes unpaired anonymous users and unlisted users. Fallback (no hook): an unlisted user has zero access to every table (`audit_unlisted_user.sql`) and is removed by the job. |

## 6. Device test list

_Filled in slice 12. Items Playwright can't cover are collected here as slices land:_

- Installed-PWA storage: sign in from the home-screen app, close it, reopen it, and check you're still signed in.
- The styleguide on the real iPad and iPhone, both grounds, both volumes, and Reduce Motion on.

## 7. Go-live checklist (Gate 2)

The parent does steps G1–G7 by hand. Claude Code does steps C1–C5 only after approval.

**Parent, in the hosted Supabase dashboard and Netlify**

- **G1. Sign-ups closed to the public.** Only emails a parent has pre-added (the allowlist) can sign in. **Tested locally (slice 0):** Supabase's "Allow new users to sign up" switch also blocks anonymous sign-ins (`422 signup_disabled`), which iPad pairing needs. _Exact setting depends on Q2._
- **G2. "Automatically expose new tables" stays off.** Every migration GRANTs explicitly, and the local stack revokes the same default privileges, so nothing works locally that would break when hosted. **Verified item:** after `db push`, run the grant check from slice 1 against the hosted project.
- **G3. Email delivery for sign-in codes.**
  1. Check whether the built-in sender works for a non-org address: add a test address to the allowlist, request a code, and see whether it arrives. Also note the hourly rate limit shown under Auth → Rate Limits.
  2. If it doesn't, pick a transactional provider that can send from `steppinghen.com` (SPF/DKIM on the domain). Options to compare: Resend, Postmark, Amazon SES, Mailgun. Enter SMTP settings under Auth → SMTP. The provider sees parent email addresses and codes only.
- **G4. Auth settings** (exact values listed in slice 2): email OTP template using `{{ .Token }}` with no link, OTP length and expiry, TOTP MFA on, anonymous sign-ins on, rate limits.
- **G5. Free tier: pick one.**
  - **Scheduled keep-alive ping:** free projects pause after about 7 days with no API activity, for example during a family trip.
  - **Supabase Pro:** no pausing, plus daily backups.
  - On the free tier, **the family export is the only backup**. Download one regularly.
- **G6. Netlify env vars** on `rooster-deck`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (hosted values). Nothing else ships to the browser.
- **G7. Root `CLAUDE.md`:** approve the Deck exception (own Supabase project ref, unprefixed tables) and fill in the `rooster-deck` site ID.

**Claude Code, after approval**

- C1. Run the account checks from the root `CLAUDE.md`, with the Deck's own project ref as the expected value.
- C2. `supabase link` to the Deck project (from `deck/` only), then `supabase db push`.
- C3. Run the grant check (G2) and the pgTAP suite against the hosted project where possible.
- C4. Create or link `rooster-deck` in the steppinghen team and deploy from `deck/`.
- C5. Rerun the Phase 1 acceptance checklist against production and confirm the URL loads publicly.
