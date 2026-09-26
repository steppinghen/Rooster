// ------------------------------------------------------------------------
// coop/netlify/functions/sync-now.js
//
// HTTP-triggerable manual sync. Scheduled functions (sync-youtube) block
// direct HTTP invocation for security; this wrapper delegates to the
// same handler but is gated by the parent PIN so only the parent can
// trigger a sync outside the 6-hour cron.
//
// Usage:
//   curl -X POST https://rooster-coop.netlify.app/.netlify/functions/sync-now \
//     -H 'Content-Type: application/json' -d '{"pin":"…"}'
// ------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import syncHandler from './sync-youtube.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }
  let pin;
  try { ({ pin } = await req.json()); } catch { pin = null; }
  if (!pin) {
    return new Response(JSON.stringify({ ok: false, error: 'pin required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  const { data: ok } = await supabase.rpc('coop_verify_parent_pin', { p_pin: String(pin) });
  if (ok !== true) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid PIN' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  return syncHandler(req);
};
