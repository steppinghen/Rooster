#!/usr/bin/env node
// -------------------------------------------------------------------------
// coop/scripts/set-parent-pin.mjs
//
// One-shot local script to set (or rotate) the parent PIN.
//
//   SUPABASE_URL=https://csbjszhlzdxeoqafggbw.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_… \
//     node coop/scripts/set-parent-pin.mjs
//
// The script never prints the PIN or its hash. Postgres hashes the PIN
// with pgcrypto bcrypt inside coop_set_parent_pin(); we only send the
// plaintext PIN over an HTTPS RPC call.
//
// Keep the service-role key out of shell history — set it via `read -s`,
// an .envrc, or a private env file. Do not commit it.
// -------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(2);
}

async function readSecret(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Suppress echo. Node's readline has no built-in secret mode; we mute
  // stdout writes for the duration of the prompt.
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write(prompt);
  process.stdout.write = () => true;
  try {
    const value = await new Promise(resolve => rl.question('', resolve));
    return value;
  } finally {
    process.stdout.write = stdoutWrite;
    process.stdout.write('\n');
    rl.close();
  }
}

const pin1 = await readSecret('New parent PIN: ');
const pin2 = await readSecret('Confirm PIN:    ');

if (!pin1 || pin1.length < 4) {
  console.error('PIN must be at least 4 characters.');
  process.exit(1);
}
if (pin1 !== pin2) {
  console.error('PINs did not match.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { error } = await supabase.rpc('coop_set_parent_pin', { p_pin: pin1 });
if (error) {
  console.error('Failed to set PIN:', error.message);
  process.exit(1);
}

console.log('PIN set.');
