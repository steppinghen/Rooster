/* HVAC Visits — auth config.
 *
 * Safe to commit. The publishable key is designed to ship in client
 * code; what it can reach is bounded by RLS. Never put the secret /
 * service_role key here — it bypasses RLS entirely. */

window.ROOSTER_AUTH = {
  supabaseUrl:            'https://csbjszhlzdxeoqafggbw.supabase.co',
  supabasePublishableKey: 'sb_publishable_HdJrCUctQITL5cLtI-cTMQ_I2lUlRU5',

  site:  'hvac-visits',
  title: 'HVAC Visits',

  allowListMode: 'rpc',
  allowedEmails: [],
  showBadge: true
};
