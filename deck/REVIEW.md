# Phase 1 review packet

For the parent's single review at Gate 1. The builder fills this in slice by slice, and `phase-reviewer` finishes it in slice 12.

## 1. Summary

_Filled in slice 12._

## 2. Review these first

_Each item marked → REVIEW.md in the plan: where the SQL or code is, what it does, how it's tested, and the trade-offs. phase-reviewer finishes this section in slice 12._

### R1. Auth settings for the hosted dashboard (slice 2)

The local values are in `supabase/config.toml`. Apply the same settings by hand in the hosted dashboard; they are listed as G4 in section 7.

### R2. Pairing RPCs (slice 3): `supabase/migrations/20261001000300_device_pairing.sql`

- **`create_pairing_code(label)`**
  - Parent (aal2) of their own family only.
  - 8 digits from `gen_random_bytes`.
  - Stores a bcrypt hash; the plain code is returned once.
  - Lives 10 minutes; a trigger clamps `created_at`/`expires_at`.
  - At most 3 open codes per family.
- **`redeem_pairing_code(code)`**
  - The caller must be an anonymous session that isn't paired yet.
  - Locks out after 5 wrong tries per caller, or 100 wrong tries across all callers, in 10 minutes.
  - If more than one live code matches, it refuses rather than guessing.
  - Claims the code atomically with `update … where used_at is null and expires_at > now()`.
  - Returns a status object instead of raising, so the failed attempt it records is kept.
- **`revoke_device`**
  - One-way: there is no path back from revoked.
  - A revoked identity can never re-pair; the iPad signs out and gets a new anonymous identity.
- **Tests:** `004_pairing.sql`, the rls-auditor's `audit_*`, and e2e `pairing.spec.ts`.
- **Trade-off:** the 100-wrong-tries cap lets an attacker pause pairing for 10 minutes for everyone. That's acceptable because pairing is rare.

### R3. PIN RPC (slice 4): `verify_kid_pin` in `supabase/migrations/20261001000400_kid_profiles.sql`

- **Compare:** the bcrypt check happens in the database; `pin_hash` is granted to no API role.
- **Lockout:** 5 wrong tries per kid per caller identity lock that kid for 5 minutes. Attempts persist because the function returns a status instead of raising.
- **Reset:** a parent setting a new PIN clears the lock.
- **Tests:** `005_kid_profiles.sql` and e2e `picker.spec.ts`.
- **Limit:** see Q3. The PIN is a UI keep-out between siblings on a shared iPad, not a database boundary.

### R4. Delete family (slice 6): `delete_family` in `supabase/migrations/20261001000500_export_delete.sql`

- **Who and how:** a parent at aal2 types the exact family name; the comparison is case-sensitive.
- **What it removes:**
  - every family row, by cascade from `families`;
  - the family's `pairing_attempts` and `pin_attempts`;
  - any leftover bootstrap allowlist rows for those parents;
  - the **auth users of both parents and every paired iPad**.
- **Tests:** `006_export_delete.sql` (every row of family 1 gone, family 2 byte-identical, lockout rows), the rls-auditor's `audit_delete_family.sql`, and e2e `export-delete.spec.ts`.
- **Trade-off (Q4):** to start over after a delete, the parent runs the bootstrap insert again (G8).

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
| Q4 | Delete family also deletes both parents' accounts | Default: yes, a full wipe. To start over, run the bootstrap allowlist insert again (G8). |
| Q5 | Export: PIN hashes left out | Default: left out. A 4-digit bcrypt hash is effectively the PIN, and the export lives on a phone. After a rebuild, PINs are set again. |
| Q2 | How to close public sign-ups when "Allow new users to sign up" off also blocks anonymous (iPad) sign-ins | **Decided (parent):** the switch stays on; a `before_user_created` hook enforces the allowlist; a nightly job removes unpaired anonymous users and unlisted users. Fallback (no hook): an unlisted user has zero access to every table (`audit_unlisted_user.sql`) and is removed by the job. |

## 6. Device test list

_Filled in slice 12. Items Playwright can't cover are collected here as slices land:_

- Installed-PWA storage: sign in from the home-screen app, close it, reopen it, and check you're still signed in.
- The styleguide on the real iPad and iPhone, both grounds, both volumes, and Reduce Motion on.

## 7. Go-live checklist (Gate 2)

The parent does steps G1–G7 by hand. Claude Code does steps C1–C5 only after approval.

**Parent, in the hosted Supabase dashboard and Netlify**

- **G1. Sign-ups closed to the public through the allowlist hook.**
  1. Leave **"Allow new users to sign up" ON**. Turning it off also blocks anonymous sign-ins, which iPads need (tested: `422 signup_disabled`).
  2. Leave **"Allow anonymous sign-ins" ON**.
  3. Under Auth → Hooks, enable **Before User Created** → Postgres function `private.hook_before_user_created`.
  4. **Check that the hook works on the free plan:** with the hook on, request a code for an unlisted email. Expect a 403 ("not on the list") and no new row in Authentication → Users.
  5. If the hook isn't available on the free plan, the fallback still holds. An unlisted user has zero access (`audit_unlisted_user.sql`), and the nightly job removes them after 24 hours.
- **G2. "Automatically expose new tables" stays off.** Every migration GRANTs explicitly, and the local stack revokes the same default privileges, so nothing works locally that would break when hosted. **Verified item:** after `db push`, run the grant check from slice 1 against the hosted project.
- **G3. Email delivery for sign-in codes.**
  1. Check whether the built-in sender works for a non-org address: add a test address to the allowlist, request a code, and see whether it arrives. Also note the hourly rate limit shown under Auth → Rate Limits.
  2. If it doesn't, pick a transactional provider that can send from `steppinghen.com` (SPF/DKIM on the domain). Options to compare: Resend, Postmark, Amazon SES, Mailgun. Enter SMTP settings under Auth → SMTP. The provider sees parent email addresses and codes only.
- **G4. Auth settings** (to match `supabase/config.toml`):
  - Email templates **Magic Link** and **Confirm signup**: subject "Your code for The Deck", with the body from `supabase/templates/otp.html`. It shows `{{ .Token }}` only, with **no link** (remove `{{ .ConfirmationURL }}`).
  - Email OTP length **6**; OTP expiry **600 s** (10 minutes).
  - Site URL: the production app URL. No redirect URLs are needed, because nothing in the flow uses links.
  - MFA: **TOTP enroll and verify on**. Phone MFA stays off.
  - Anonymous sign-ins: **on**.
  - Rate limits: leave the defaults (30 sign-ins per 5 minutes per IP, 30 anonymous per hour per IP). The email send limit depends on G3.
  - Refresh token rotation on (the default).
- **G5. Free tier: pick one.**
  - **Scheduled keep-alive ping:** free projects pause after about 7 days with no API activity, for example during a family trip.
  - **Supabase Pro:** no pausing, plus daily backups.
  - On the free tier, **the family export is the only backup**. Download one regularly.
- **G6. Netlify env vars** on `rooster-deck`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (hosted values). Nothing else ships to the browser.
- **G7. Root `CLAUDE.md`:** approve the Deck exception (own Supabase project ref, unprefixed tables) and fill in the `rooster-deck` site ID.
- **G8. Bootstrap Parent A (one-off SQL, run by the parent in the hosted SQL editor after `db push`):**
  ```sql
  insert into public.parent_allowlist (email, family_id) values ('<your email>', null);
  ```
  Then sign in on the phone with that email. The row is consumed when the family is created. No real email ever goes into code or migrations.

**Claude Code, after approval**

- C1. Run the account checks from the root `CLAUDE.md`, with the Deck's own project ref as the expected value.
- C2. `supabase link` to the Deck project (from `deck/` only), then `supabase db push`.
- C3. Run the grant check (G2) and the pgTAP suite against the hosted project where possible.
- C4. Create or link `rooster-deck` in the steppinghen team and deploy from `deck/`.
- C5. Rerun the Phase 1 acceptance checklist against production and confirm the URL loads publicly.
