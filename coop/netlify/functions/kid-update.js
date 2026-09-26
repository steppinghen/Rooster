// ------------------------------------------------------------------------
// coop/netlify/functions/kid-update.js
//
// Narrow endpoint used only by the kid's "Me" screen. Accepts avatar
// and/or accent_color for one profile. Nothing else. Kid PIN required
// if the profile has one. In-memory rate-limited per profile.
// ------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ---------- allow-lists ----------

// Same 8 accents used in the kid Me screen. The function only writes
// one of these — no arbitrary hex — so the DB can never end up with
// an unvetted color even if the client sends garbage.
const KID_ACCENTS = new Set([
  '#A9D3BE', '#9CC8E8', '#F5C6A5', '#F0B5C4',
  '#C6B8E5', '#B7E3D6', '#F3DFA2', '#F2A79B'
]);

// The full set of legal avatar pack:id values. Mirrored from
// coop/js/avatars.js — kept as plain strings here to keep this
// function's cold-start dependency-free (no bundled avatars.js).
const PACK_IDS = new Set([
  // animals (12)
  'animals:fox','animals:owl','animals:bear','animals:whale',
  'animals:lion','animals:penguin','animals:rabbit','animals:octopus',
  'animals:turtle','animals:elephant','animals:bee','animals:puppy',
  // dino (6)
  'dino:trex','dino:triceratops','dino:stegosaurus','dino:brachiosaurus',
  'dino:pterodactyl','dino:egg',
  // xmas (6)
  'xmas:santa','xmas:reindeer','xmas:snowman','xmas:elf',
  'xmas:gingerbread','xmas:penguin-hat',
  // spring (4)
  'spring:bunny','spring:chick','spring:lamb','spring:easter-egg',
  // fall (4)
  'fall:pumpkin','fall:ghost','fall:black-cat','fall:owl-moon'
]);

// Emoji spec must be `emoji:<payload>` where <payload> is 1..12 chars
// composed ONLY of:
//   - Extended_Pictographic codepoints (the emoji glyphs themselves)
//   - U+FE0F / U+FE0E (variation selectors 15/16)
//   - U+200D (zero-width joiner, for ZWJ sequences)
//   - U+1F3FB..U+1F3FF (skin-tone modifiers)
// Explicitly excludes any letters, digits, whitespace, punctuation, or
// symbols — so `emoji:hi🐶` or `emoji:1️⃣` (contains digit) is rejected.
// Must also contain at least one Extended_Pictographic.
const EMOJI_ALLOWED = /^[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{1F3FB}-\u{1F3FF}]+$/u;
const EMOJI_HAS_PICT = /\p{Extended_Pictographic}/u;
function isEmojiSpec(spec) {
  if (!spec.startsWith('emoji:')) return false;
  const payload = spec.slice(6);
  if (!payload || payload.length > 12) return false;
  try {
    return EMOJI_ALLOWED.test(payload) && EMOJI_HAS_PICT.test(payload);
  } catch {
    // If the runtime lacks unicode property escapes, reject rather than
    // accept — better to fail closed for this validator.
    return false;
  }
}

function isLegalAvatar(spec) {
  if (typeof spec !== 'string' || spec.length > 40) return false;
  if (PACK_IDS.has(spec)) return true;
  return isEmojiSpec(spec);
}

// ---------- WCAG-luminance on-accent picker (mirrors parent-write) ----------
function deriveOnAccentText(hex) {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!m) return '#14231C';
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  const chan = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  return L > 0.5 ? '#14231C' : '#EAF0EE';
}

// ---------- rate limiter (in-memory, per profile) ----------
// Netlify may spin up multiple function instances; this is best-effort.
// Combined with the kid-PIN requirement it's enough to stop tap-spam
// and casual scripted abuse for a personal 2-kid app.
const attempts = new Map();
function checkRate(profileId) {
  const now = Date.now();
  const rec = attempts.get(profileId);
  const WINDOW_MS = 60_000;   // 1 minute
  const MAX_PER_WINDOW = 20;
  const MIN_GAP_MS = 300;     // per-call cooldown
  if (!rec) {
    attempts.set(profileId, { count: 1, windowStart: now, last: now });
    return { ok: true };
  }
  if (now - rec.last < MIN_GAP_MS) return { ok: false, reason: 'too fast' };
  if (now - rec.windowStart > WINDOW_MS) {
    rec.count = 1; rec.windowStart = now; rec.last = now;
    return { ok: true };
  }
  rec.count++; rec.last = now;
  if (rec.count > MAX_PER_WINDOW) return { ok: false, reason: 'rate limit' };
  return { ok: true };
}

// ---------- handler ----------
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers }
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Server env missing' });
  }

  let body;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'Invalid JSON' }); }
  const { profile_id, pin, avatar, accent_color } = body || {};

  if (!profile_id || typeof profile_id !== 'string') {
    return json(400, { ok: false, error: 'profile_id required' });
  }
  if (avatar === undefined && accent_color === undefined) {
    return json(400, { ok: false, error: 'nothing to update' });
  }

  const rate = checkRate(profile_id);
  if (!rate.ok) return json(429, { ok: false, error: rate.reason });

  // Confirm the profile exists.
  const { data: profile, error: pErr } = await supabase
    .from('coop_profiles')
    .select('id')
    .eq('id', profile_id)
    .maybeSingle();
  if (pErr || !profile) return json(404, { ok: false, error: 'profile not found' });

  // If the profile has a kid PIN, require and verify it.
  const { data: pinRow } = await supabase
    .from('coop_kid_pins')
    .select('profile_id')
    .eq('profile_id', profile_id)
    .maybeSingle();
  if (pinRow) {
    if (!pin || typeof pin !== 'string') return json(401, { ok: false, error: 'pin required' });
    const { data: verified, error: vErr } = await supabase.rpc('coop_verify_kid_pin', {
      p_profile_id: profile_id, p_pin: pin
    });
    if (vErr || verified !== true) return json(401, { ok: false, error: 'wrong pin' });
  }

  // Build the patch. Only avatar + accent_color are ever written here.
  const patch = {};
  if (avatar !== undefined) {
    if (!isLegalAvatar(avatar)) return json(400, { ok: false, error: 'illegal avatar' });
    patch.avatar = avatar;
  }
  if (accent_color !== undefined) {
    if (!KID_ACCENTS.has(accent_color)) return json(400, { ok: false, error: 'illegal accent_color' });
    patch.accent_color = accent_color;
    patch.on_accent_text = deriveOnAccentText(accent_color);
  }

  const { data: updated, error: uErr } = await supabase
    .from('coop_profiles')
    .update(patch)
    .eq('id', profile_id)
    .select('id, name, avatar, accent_color, on_accent_text')
    .single();
  if (uErr) return json(400, { ok: false, error: uErr.message });

  return json(200, { ok: true, profile: updated });
};
