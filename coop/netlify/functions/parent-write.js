// ------------------------------------------------------------------------
// coop/netlify/functions/parent-write.js
//
// The single write endpoint for coop. Every mutation the parent can make
// goes through here. The endpoint has three responsibilities and nothing
// else:
//
//   1. Verify the parent PIN by calling the SECURITY DEFINER function
//      coop_verify_parent_pin(pin) with the service-role client. Lockout
//      state and the fail counter both live inside that function.
//   2. Dispatch the requested op (see OPS below).
//   3. Perform the actual write with the service-role client — RLS
//      bypassed, but only after step 1 said yes.
//
// Kids never call this endpoint. Kid iPads use the anon key and can only
// select.
//
// Body: { pin: string, op: string, payload: object }
// Response: { ok: true, ...opResult } | { ok: false, error: string }
// ------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ---------- helpers ----------

const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

// Extract a YouTube video ID from a URL or plain ID. Returns null if not found.
function parseVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.+&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

// Extract a channel handle (without @) or a channel ID from a URL or plain form.
// Returns { handle } or { channelId } or null.
function parseChannelRef(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { channelId: s };
  if (s.startsWith('@')) return { handle: s.slice(1) };
  const handleMatch = s.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (handleMatch) return { handle: handleMatch[1] };
  const idMatch = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (idMatch) return { channelId: idMatch[1] };
  return null;
}

async function ytChannelLookup(ref) {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    key: YOUTUBE_API_KEY
  });
  if (ref.channelId) params.set('id', ref.channelId);
  else params.set('forHandle', ref.handle);
  const url = 'https://www.googleapis.com/youtube/v3/channels?' + params;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('Channel not found');
  return {
    id: item.id,
    handle: ref.handle || null,
    title: item.snippet.title,
    thumbnail_url: item.snippet.thumbnails?.default?.url || null,
    uploads_playlist_id: item.contentDetails.relatedPlaylists.uploads
  };
}

async function ytOEmbed(videoId) {
  const url = `https://www.youtube.com/oembed?format=json&url=https%3A//www.youtube.com/watch%3Fv%3D${videoId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// ---------- op handlers ----------

const OPS = {
  // No-op used by the client to confirm a PIN before entering parent mode.
  // Verification already happened above; if we got here the PIN is good.
  async verify_pin() {
    return {};
  },

  async set_parent_pin({ new_pin }) {
    if (!new_pin || String(new_pin).length < 4) throw new Error('new_pin missing or too short');
    const { error } = await supabase.rpc('coop_set_parent_pin', { p_pin: String(new_pin) });
    if (error) throw error;
    return {};
  },

  async set_kid_pin({ profile_id, pin }) {
    if (!profile_id || !pin) throw new Error('profile_id and pin required');
    const { error } = await supabase.rpc('coop_set_kid_pin', {
      p_profile_id: profile_id,
      p_pin: String(pin)
    });
    if (error) throw error;
    return {};
  },

  async clear_kid_pin({ profile_id }) {
    if (!profile_id) throw new Error('profile_id required');
    const { error } = await supabase.rpc('coop_clear_kid_pin', {
      p_profile_id: profile_id
    });
    if (error) throw error;
    return {};
  },

  async add_profile({ name, avatar, color, sort_order = 0 }) {
    if (!name || !avatar || !color) throw new Error('name, avatar, color required');
    const { data, error } = await supabase
      .from('coop_profiles')
      .insert({ name, avatar, color, sort_order })
      .select()
      .single();
    if (error) throw error;
    return { profile: data };
  },

  async edit_profile({ profile_id, name, avatar, color, sort_order }) {
    if (!profile_id) throw new Error('profile_id required');
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (avatar !== undefined) patch.avatar = avatar;
    if (color !== undefined) patch.color = color;
    if (sort_order !== undefined) patch.sort_order = sort_order;
    const { data, error } = await supabase
      .from('coop_profiles')
      .update(patch)
      .eq('id', profile_id)
      .select()
      .single();
    if (error) throw error;
    return { profile: data };
  },

  async delete_profile({ profile_id }) {
    if (!profile_id) throw new Error('profile_id required');
    const { error } = await supabase
      .from('coop_profiles')
      .delete()
      .eq('id', profile_id);
    if (error) throw error;
    return {};
  },

  async add_channel({ input, profile_ids = [] }) {
    if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not set');
    const ref = parseChannelRef(input);
    if (!ref) throw new Error('Could not parse channel input');
    const ch = await ytChannelLookup(ref);
    const { error: chErr } = await supabase.from('coop_channels').upsert({
      id: ch.id,
      handle: ch.handle,
      title: ch.title,
      thumbnail_url: ch.thumbnail_url,
      uploads_playlist_id: ch.uploads_playlist_id
    });
    if (chErr) throw chErr;
    if (profile_ids.length) {
      const rows = profile_ids.map(pid => ({ profile_id: pid, channel_id: ch.id }));
      const { error: pcErr } = await supabase.from('coop_profile_channels').upsert(rows);
      if (pcErr) throw pcErr;
    }
    return { channel: ch };
  },

  async remove_channel({ channel_id }) {
    if (!channel_id) throw new Error('channel_id required');
    // Two-step: delete non-oneoff videos first; then delete the channel.
    // Any remaining coop_videos rows are is_oneoff=true and get channel_id
    // nulled via the ON DELETE SET NULL FK — the one-off approval survives.
    const { error: vidErr } = await supabase
      .from('coop_videos')
      .delete()
      .eq('channel_id', channel_id)
      .eq('is_oneoff', false);
    if (vidErr) throw vidErr;
    const { error: chErr } = await supabase
      .from('coop_channels')
      .delete()
      .eq('id', channel_id);
    if (chErr) throw chErr;
    return {};
  },

  async set_profile_channels({ profile_id, channel_ids }) {
    if (!profile_id || !Array.isArray(channel_ids)) {
      throw new Error('profile_id and channel_ids[] required');
    }
    const { error: delErr } = await supabase
      .from('coop_profile_channels')
      .delete()
      .eq('profile_id', profile_id);
    if (delErr) throw delErr;
    if (channel_ids.length) {
      const rows = channel_ids.map(cid => ({ profile_id, channel_id: cid }));
      const { error: insErr } = await supabase.from('coop_profile_channels').insert(rows);
      if (insErr) throw insErr;
    }
    return {};
  },

  async add_oneoff_video({ input, profile_ids = [] }) {
    const videoId = parseVideoId(input);
    if (!videoId) throw new Error('Could not parse video input');
    const oembed = await ytOEmbed(videoId);
    if (!oembed) throw new Error('Video not found via oEmbed');
    const { error: vidErr } = await supabase.from('coop_videos').upsert({
      id: videoId,
      title: oembed.title,
      thumbnail_url: oembed.thumbnail_url,
      channel_title: oembed.author_name,
      is_oneoff: true
    }, { onConflict: 'id', ignoreDuplicates: false });
    // Note: this upsert will set is_oneoff=true even if the row existed
    // and was not previously a oneoff — that's the intended flag-flip.
    // On the reverse path (sync's upsert), is_oneoff is NOT in the
    // update column list.
    if (vidErr) throw vidErr;
    if (profile_ids.length) {
      const rows = profile_ids.map(pid => ({ profile_id: pid, video_id: videoId }));
      const { error: pvErr } = await supabase.from('coop_profile_videos').upsert(rows);
      if (pvErr) throw pvErr;
    }
    return { video_id: videoId };
  },

  async remove_oneoff_video({ video_id }) {
    if (!video_id) throw new Error('video_id required');
    // Drop the joins first.
    const { error: pvErr } = await supabase
      .from('coop_profile_videos')
      .delete()
      .eq('video_id', video_id);
    if (pvErr) throw pvErr;
    // Look up the row to decide whether to keep or delete.
    const { data: row } = await supabase
      .from('coop_videos')
      .select('channel_id')
      .eq('id', video_id)
      .maybeSingle();
    if (row && row.channel_id === null) {
      // External one-off — nothing else references this video; delete it.
      await supabase.from('coop_videos').delete().eq('id', video_id);
    } else {
      // Belongs to a channel — clear the oneoff flag but keep the row.
      await supabase.from('coop_videos').update({ is_oneoff: false }).eq('id', video_id);
    }
    return {};
  },

  async hide_video({ profile_id, video_id }) {
    if (!profile_id || !video_id) throw new Error('profile_id and video_id required');
    const { error } = await supabase
      .from('coop_profile_hidden_videos')
      .upsert({ profile_id, video_id });
    if (error) throw error;
    return {};
  },

  async unhide_video({ profile_id, video_id }) {
    if (!profile_id || !video_id) throw new Error('profile_id and video_id required');
    const { error } = await supabase
      .from('coop_profile_hidden_videos')
      .delete()
      .eq('profile_id', profile_id)
      .eq('video_id', video_id);
    if (error) throw error;
    return {};
  },

  async add_blocklist_keyword({ keyword }) {
    if (!keyword) throw new Error('keyword required');
    const kw = String(keyword).trim().toLowerCase();
    if (!kw) throw new Error('keyword empty after normalize');
    const { error } = await supabase
      .from('coop_blocklist_keywords')
      .upsert({ keyword: kw }, { onConflict: 'keyword', ignoreDuplicates: true });
    if (error) throw error;
    return { keyword: kw };
  },

  async remove_blocklist_keyword({ keyword }) {
    if (!keyword) throw new Error('keyword required');
    const { error } = await supabase
      .from('coop_blocklist_keywords')
      .delete()
      .eq('keyword', String(keyword).trim().toLowerCase());
    if (error) throw error;
    return {};
  },

  async set_hide_shorts({ hide_shorts }) {
    if (typeof hide_shorts !== 'boolean') throw new Error('hide_shorts must be boolean');
    const { error } = await supabase
      .from('coop_public_settings')
      .update({ hide_shorts, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
    return { hide_shorts };
  },

  async seed_starter_channels({ rc_profile_id, brody_profile_id }) {
    if (!rc_profile_id || !brody_profile_id) {
      throw new Error('rc_profile_id and brody_profile_id required');
    }
    // Handles are @-form (no leading @ needed in ref.handle).
    const both = [
      'Bluey',           // official Bluey
      'Numberblocks',
      'ArtforKidsHub',
      'CosmicKidsYoga',
      'LEGO'
    ];
    const brodyOnly = ['DisneyJunior', 'officialAlphablocks'];
    const rcOnly = [
      'MarvelHQ',
      'SciShowKids',
      'NatGeoKids',
      'minecraft',           // official Minecraft
      'minecrafteducation'   // Minecraft Education
    ];

    const results = { added: [], failed: [] };
    async function resolveAndInsert(handle, profileIds) {
      try {
        const ch = await ytChannelLookup({ handle });
        await supabase.from('coop_channels').upsert({
          id: ch.id,
          handle,
          title: ch.title,
          thumbnail_url: ch.thumbnail_url,
          uploads_playlist_id: ch.uploads_playlist_id
        });
        const rows = profileIds.map(pid => ({ profile_id: pid, channel_id: ch.id }));
        await supabase.from('coop_profile_channels').upsert(rows);
        results.added.push({ handle, title: ch.title, id: ch.id });
      } catch (e) {
        results.failed.push({ handle, error: e.message });
      }
    }
    for (const h of both) await resolveAndInsert(h, [rc_profile_id, brody_profile_id]);
    for (const h of brodyOnly) await resolveAndInsert(h, [brody_profile_id]);
    for (const h of rcOnly) await resolveAndInsert(h, [rc_profile_id]);
    return results;
  }
};

// ---------- handler ----------

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Server env missing' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }
  const { pin, op, payload = {} } = body || {};
  if (!pin || !op) return json(400, { ok: false, error: 'pin and op required' });

  // Verify PIN. coop_verify_parent_pin handles the 5-strike / 15-min lockout
  // in the DB — no separate counter needed here.
  const { data: ok, error: verifyErr } = await supabase.rpc('coop_verify_parent_pin', {
    p_pin: String(pin)
  });
  if (verifyErr) return json(500, { ok: false, error: 'Verify failed' });
  if (ok !== true) {
    // Fetch lockout_until for Retry-After if applicable.
    const { data: s } = await supabase
      .from('coop_settings')
      .select('lockout_until')
      .eq('id', 1)
      .maybeSingle();
    const headers = {};
    if (s && s.lockout_until) {
      const secs = Math.max(1, Math.floor((new Date(s.lockout_until) - new Date()) / 1000));
      headers['Retry-After'] = String(secs);
    }
    return json(401, { ok: false, error: 'Invalid PIN' }, headers);
  }

  const handler = OPS[op];
  if (!handler) return json(400, { ok: false, error: `Unknown op: ${op}` });

  try {
    const result = await handler(payload);
    return json(200, { ok: true, ...result });
  } catch (e) {
    return json(400, { ok: false, error: e.message || String(e) });
  }
};
