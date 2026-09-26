// Client-side Supabase config for coop.
// The publishable key is designed to ship in browser code — its reach is
// whatever RLS allows. RLS is on for every coop_* table (see the initial
// migration). Never put the service-role key here.
window.COOP_CONFIG = {
  supabaseUrl: 'https://csbjszhlzdxeoqafggbw.supabase.co',
  supabasePublishableKey: 'sb_publishable_HdJrCUctQITL5cLtI-cTMQ_I2lUlRU5'
};
