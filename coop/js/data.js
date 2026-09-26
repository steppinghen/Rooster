// ------------------------------------------------------------------------
// coop/js/data.js
//
// Read layer for the browser. Uses the Supabase publishable key. Every
// mutation goes through writer.js → parent-write function; nothing in
// this file writes to the database.
//
// Filters applied at read time (see plan):
//   availability = 'available'
//   is_live      = false
//   is_upcoming  = false
//   blocked_by_keyword = false  ← plus a live re-check against the
//                                  current keyword list
//   hide_shorts && is_short IS TRUE → excluded
//   hidden-for-this-profile → excluded
// ------------------------------------------------------------------------

import { compile as compileBlocklist, matches as matchesBlocklist } from './blocklist.js';

const { supabaseUrl, supabasePublishableKey } = window.COOP_CONFIG;
export const supabase = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// -------- profiles --------

export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('coop_profiles')
    .select('id, name, avatar, color, sort_order, accent_color, on_accent_text, nav_style, tile_size')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Attach has_pin per profile in a single follow-up query.
  const ids = (data || []).map(p => p.id);
  const pinSet = new Set();
  if (ids.length) {
    // coop_kid_pins is not readable by anon — we can only *know* a kid
    // has a PIN by asking the verify function. That's a lot of extra
    // calls. Cheaper: attempt one verify with an empty string; if the
    // response is false, a PIN exists (empty PIN never matches);
    // if true, no PIN. We do this lazily via `hasKidPin(profileId)`
    // below rather than eagerly here.
  }
  return (data || []).map(p => ({ ...p, has_pin: pinSet.has(p.id) }));
}

// Best-effort check: verify with the empty string. If it returns true,
// the DB has no pin_hash row for this profile (function returns true).
// If false, a PIN is set.
export async function hasKidPin(profileId) {
  const { data, error } = await supabase.rpc('coop_verify_kid_pin', {
    p_profile_id: profileId,
    p_pin: ''
  });
  if (error) throw error;
  return data !== true;
}

export async function verifyKidPin(profileId, pin) {
  const { data, error } = await supabase.rpc('coop_verify_kid_pin', {
    p_profile_id: profileId,
    p_pin: String(pin)
  });
  if (error) throw error;
  return data === true;
}

// -------- settings --------

export async function fetchPublicSettings() {
  const { data, error } = await supabase
    .from('coop_public_settings')
    .select('hide_shorts, show_up_next, max_video_seconds')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

// Predicate used everywhere the kid can see a video: NULL duration is
// always allowed (parent-approved one-offs may not have been backfilled
// yet), NULL cap means no limit.
function passesDurationCap(v, cap) {
  if (cap == null) return true;
  if (v.duration_seconds == null) return true;
  return v.duration_seconds <= cap;
}

// -------- channels --------

export async function fetchAllChannels() {
  const { data, error } = await supabase
    .from('coop_channels')
    .select('id, handle, title, thumbnail_url, added_at, last_synced_at')
    .order('title', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchChannelIdsForProfile(profileId) {
  const { data, error } = await supabase
    .from('coop_profile_channels')
    .select('channel_id')
    .eq('profile_id', profileId);
  if (error) throw error;
  return new Set((data || []).map(r => r.channel_id));
}

export async function fetchChannelsForProfile(profileId) {
  const { data, error } = await supabase
    .from('coop_profile_channels')
    .select('channel_id, coop_channels ( id, handle, title, thumbnail_url )')
    .eq('profile_id', profileId);
  if (error) throw error;
  return (data || [])
    .map(r => r.coop_channels)
    .filter(Boolean)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

// Single channel row — used by the channel page header.
export async function fetchChannelById(channelId) {
  const { data, error } = await supabase
    .from('coop_channels')
    .select('id, handle, title, thumbnail_url, added_at')
    .eq('id', channelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Feed narrowed to a single channel. Wraps fetchFeedForProfile so the
// same read-time filters (blocklist, hidden, shorts, availability) apply.
export async function fetchFeedForChannel(profileId, channelId, opts) {
  const all = await fetchFeedForProfile(profileId, opts);
  return all.filter(v => v.channel_id === channelId);
}

// Newest visible video across the kid's channels — hero pick.
export async function fetchHeroVideoForProfile(profileId) {
  const feed = await fetchFeedForProfile(profileId, { limit: 50 });
  return feed[0] || null;
}

// -------- blocklist --------

export async function fetchBlocklist() {
  const { data, error } = await supabase
    .from('coop_blocklist_keywords')
    .select('id, keyword')
    .order('keyword', { ascending: true });
  if (error) throw error;
  return data || [];
}

// -------- videos for a kid profile --------

// Union of:
//   - Videos where video.channel_id ∈ profile's approved channels
//   - Videos in coop_profile_videos for this profile (one-offs)
// Then apply the read-time filters and dedupe. Sorted by published_at desc.
export async function fetchFeedForProfile(profileId, { limit = 200 } = {}) {
  const [channelIds, publicSettings, hiddenIds, blocklist, oneoffLinks] = await Promise.all([
    fetchChannelIdsForProfile(profileId),
    fetchPublicSettings(),
    fetchHiddenIdsForProfile(profileId),
    fetchBlocklist(),
    fetchOneoffVideoIdsForProfile(profileId)
  ]);

  const chanIdArr = [...channelIds];
  const oneoffArr = [...oneoffLinks];

  // Base query: videos matching any approved channel or in the oneoff list.
  let query = supabase
    .from('coop_videos')
    .select('id, channel_id, title, thumbnail_url, channel_title, published_at, duration_seconds, is_short, is_oneoff')
    .eq('availability', 'available')
    .eq('is_live', false)
    .eq('is_upcoming', false)
    .eq('blocked_by_keyword', false);

  if (chanIdArr.length && oneoffArr.length) {
    // channel_id in (…) OR id in (…)
    query = query.or(
      `channel_id.in.(${chanIdArr.map(v => `"${v}"`).join(',')}),id.in.(${oneoffArr.map(v => `"${v}"`).join(',')})`
    );
  } else if (chanIdArr.length) {
    query = query.in('channel_id', chanIdArr);
  } else if (oneoffArr.length) {
    query = query.in('id', oneoffArr);
  } else {
    return [];
  }

  query = query.order('published_at', { ascending: false, nullsFirst: false }).limit(limit);
  const { data, error } = await query;
  if (error) throw error;

  const blocklistRe = compileBlocklist((blocklist || []).map(k => k.keyword));
  const hideShorts = !!publicSettings?.hide_shorts;
  const maxDur = publicSettings?.max_video_seconds ?? null;
  const seen = new Set();
  const out = [];
  for (const v of data || []) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    if (hiddenIds.has(v.id)) continue;
    if (hideShorts && v.is_short === true) continue;
    if (matchesBlocklist(v.title, blocklistRe)) continue;
    if (!passesDurationCap(v, maxDur)) continue;
    out.push(v);
  }
  return out;
}

export async function fetchOneoffVideoIdsForProfile(profileId) {
  const { data, error } = await supabase
    .from('coop_profile_videos')
    .select('video_id')
    .eq('profile_id', profileId);
  if (error) throw error;
  return new Set((data || []).map(r => r.video_id));
}

export async function fetchHiddenIdsForProfile(profileId) {
  const { data, error } = await supabase
    .from('coop_profile_hidden_videos')
    .select('video_id')
    .eq('profile_id', profileId);
  if (error) throw error;
  return new Set((data || []).map(r => r.video_id));
}

// -------- search (Supabase-only; never YouTube) --------

export async function searchFeedForProfile(profileId, q, { limit = 100 } = {}) {
  const term = (q || '').trim();
  if (!term) return [];
  // Fetch a wider feed and filter by title in JS. Keeps the filter
  // logic (blocklist, hidden, shorts) identical to fetchFeedForProfile,
  // and doesn't need a Postgres text-search config in the migration.
  const feed = await fetchFeedForProfile(profileId, { limit: 500 });
  const needle = term.toLowerCase();
  return feed
    .filter(v => (v.title || '').toLowerCase().includes(needle))
    .slice(0, limit);
}
