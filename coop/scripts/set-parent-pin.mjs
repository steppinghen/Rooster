#!/usr/bin/env node
// -------------------------------------------------------------------------
// coop/scripts/set-parent-pin.mjs
//
// One-shot local script to set (or rotate) the parent PIN.
//
// Preferred invocation (uses env vars from Netlify — never printed or logged):
//
//   cd coop && NEW_PIN=0000 netlify dev:exec node scripts/set-parent-pin.mjs
//
// Required env vars:
//   SUPABASE_URL                 project URL
//   SUPABASE_SERVICE_ROLE_KEY    service-role key
//   NEW_PIN                      the PIN to set (4+ chars)
//
// Uses plain fetch against the PostgREST endpoint so we don't pull the
// supabase-js realtime dep (which requires Node 22+ for native WebSocket).
//
// The script never prints the service-role key, its length, its prefix,
// or the PIN itself. Success message prints ONLY after reading back
// coop_settings and confirming parent_pin_hash is non-null.
// -------------------------------------------------------------------------

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newPin = process.env.NEW_PIN;

if (!url) { console.error('Missing SUPABASE_URL in env.'); process.exit(2); }
if (!serviceRoleKey) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY in env.'); process.exit(2); }
if (!newPin || newPin.length < 4) { console.error('NEW_PIN must be set to at least 4 characters.'); process.exit(2); }

if (serviceRoleKey.startsWith('sb_publishable_')) {
  console.error("SUPABASE_SERVICE_ROLE_KEY looks like a publishable key (sb_publishable_…). Refusing.");
  process.exit(2);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json'
};

// 1. Set the PIN via RPC.
const setRes = await fetch(`${url}/rest/v1/rpc/coop_set_parent_pin`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ p_pin: newPin })
});
if (!setRes.ok) {
  const body = await setRes.text().catch(() => '');
  console.error(`coop_set_parent_pin RPC failed: HTTP ${setRes.status}`);
  console.error('  body:', body);
  process.exit(1);
}

// 2. Read the row back and confirm the hash is non-null.
const readRes = await fetch(
  `${url}/rest/v1/coop_settings?id=eq.1&select=parent_pin_hash,pin_updated_at`,
  { method: 'GET', headers }
);
if (!readRes.ok) {
  const body = await readRes.text().catch(() => '');
  console.error(`Read-back failed: HTTP ${readRes.status}`);
  console.error('  body:', body);
  process.exit(1);
}
const rows = await readRes.json();
const row = rows && rows[0];
if (!row || !row.parent_pin_hash) {
  console.error('The RPC returned success, but coop_settings.parent_pin_hash is still NULL.');
  console.error('The PIN was NOT set. Verify the service-role key belongs to project csbjszhlzdxeoqafggbw');
  console.error('and that no policy or trigger is blocking the write.');
  process.exit(1);
}

console.log('PIN set. Hash updated at:', row.pin_updated_at);
