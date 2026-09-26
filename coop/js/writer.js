// ------------------------------------------------------------------------
// coop/js/writer.js
//
// Thin wrapper over POST /.netlify/functions/parent-write. Handles the
// cached parent PIN (sessionStorage — dies with the tab; the function
// verifies on every call anyway, so this cache is UX only).
//
// Kids never import this module. Only parent-mode screens do.
// ------------------------------------------------------------------------

const PIN_KEY = 'coop_parent_pin';

let cachedPin = null;
try { cachedPin = sessionStorage.getItem(PIN_KEY); } catch { /* private mode */ }

export function setParentPin(pin) {
  cachedPin = pin;
  try { sessionStorage.setItem(PIN_KEY, pin); } catch { /* ignore */ }
}
export function clearParentPin() {
  cachedPin = null;
  try { sessionStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
}
export function hasCachedPin() { return !!cachedPin; }
export function getCachedPin() { return cachedPin; }

async function callOp(op, payload = {}) {
  if (!cachedPin) throw new Error('No parent PIN set');
  const res = await fetch('/.netlify/functions/parent-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: cachedPin, op, payload })
  });
  let body = {};
  try { body = await res.json(); } catch { /* leave empty */ }
  if (res.status === 401) {
    clearParentPin();
    const err = new Error(body.error || 'Invalid PIN');
    err.status = 401;
    err.retryAfter = res.headers.get('Retry-After');
    throw err;
  }
  if (!res.ok || body.ok !== true) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

// Confirm the cached PIN with the server before entering parent mode.
// Uses the verify_pin op — no side effects. Throws on 401.
export async function verifyParentPin() {
  await callOp('verify_pin');
  return true;
}

// -------- op-specific wrappers --------

export const setParentPinOp        = (new_pin)          => callOp('set_parent_pin',        { new_pin });
export const setKidPin             = (profile_id, pin)  => callOp('set_kid_pin',           { profile_id, pin });
export const clearKidPin           = (profile_id)       => callOp('clear_kid_pin',         { profile_id });
export const addProfile            = (payload)          => callOp('add_profile',           payload);
export const editProfile           = (payload)          => callOp('edit_profile',          payload);
export const deleteProfile         = (profile_id)       => callOp('delete_profile',        { profile_id });
export const resolveChannel        = (input)                    => callOp('resolve_channel', { input });
export const addChannel            = (channel_id, profile_ids = []) => callOp('add_channel', { channel_id, profile_ids });
export const auditChannels         = (min_subscribers)          => callOp('audit_channels', min_subscribers != null ? { min_subscribers } : {});
export const removeChannel         = (channel_id)       => callOp('remove_channel',        { channel_id });
export const setProfileChannels    = (profile_id, channel_ids) => callOp('set_profile_channels', { profile_id, channel_ids });
export const addOneoffVideo        = (input, profile_ids = []) => callOp('add_oneoff_video', { input, profile_ids });
export const removeOneoffVideo     = (video_id)         => callOp('remove_oneoff_video',   { video_id });
export const hideVideo             = (profile_id, video_id) => callOp('hide_video',        { profile_id, video_id });
export const hideVideoEverywhere   = (video_id)          => callOp('hide_video_everywhere', { video_id });
export const unhideVideo           = (profile_id, video_id) => callOp('unhide_video',      { profile_id, video_id });
export const addBlocklistKeyword   = (keyword)          => callOp('add_blocklist_keyword', { keyword });
export const removeBlocklistKeyword = (keyword)         => callOp('remove_blocklist_keyword', { keyword });
export const setHideShorts         = (hide_shorts)      => callOp('set_hide_shorts',       { hide_shorts });
export const setShowUpNext         = (show_up_next)     => callOp('set_show_up_next',      { show_up_next });
export const setMaxVideoSeconds    = (max_video_seconds) => callOp('set_max_video_seconds', { max_video_seconds });
export const backfillOneoffDurations = ()               => callOp('backfill_oneoff_durations', {});
export const seedStarterChannels   = (rc_profile_id, brody_profile_id) =>
                                      callOp('seed_starter_channels', { rc_profile_id, brody_profile_id });
