/* -------------------------------------------------------------
 * ROOSTER — AUTH CONFIG TEMPLATE
 * Copy to <site>/auth-config.js and fill in. One per gated site.
 *
 * This file IS committed and IS publicly readable. That's fine: the
 * publishable key is designed to ship in client code, and its reach
 * is bounded by your RLS policies.
 *
 * NEVER put the secret key (sb_secret_… / service_role) here.
 * It bypasses RLS entirely.
 * ----------------------------------------------------------- */

window.ROOSTER_AUTH = {
  // Supabase → Project Settings → API Keys
  supabaseUrl:            'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR-KEY',

  // Legacy configs may use `supabaseAnonKey` instead — still honoured.

  // Must match allowed_emails.site (see _shared/schema.sql)
  site:  'my-site',

  // Shown on the login card
  title: 'My Site',

  // 'rpc'   → is_email_allowed() function, list stays private (default)
  // 'table' → direct select, list is publicly readable
  allowListMode: 'rpc',

  // Optional hardcoded list, checked before the database.
  // Anyone can read these in page source — use only for addresses
  // you don't mind publishing, or leave empty.
  allowedEmails: [],

  // Signed-in badge + sign-out button, bottom-right
  showBadge: true
};
