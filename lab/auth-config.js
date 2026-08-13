/* Lab — auth config.
 * Safe to commit: the anon key is a publishable key.
 * TODO: fill in from your PERSONAL Supabase project
 *       (Project Settings → API). Not the MBA/work project. */

window.ROOSTER_AUTH = {
  supabaseUrl:     'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',

  site:  'lab',
  title: 'Lab',

  allowListMode: 'rpc',
  allowedEmails: [],
  showBadge: true
};
