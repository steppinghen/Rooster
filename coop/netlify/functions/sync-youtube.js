// ------------------------------------------------------------------------
// coop/netlify/functions/sync-youtube.js
//
// Scheduled function — runs every 6 hours. For each approved channel:
//   1. playlistItems.list on the channel's uploads playlist (top 50).
//   2. videos.list in batches of 50 for duration + livestream flags.
//   3. Probe /shorts/{id} for videos where is_short IS NULL (one time only;
//      falls back to duration <= 60s if the probe fails).
//   4. Match the current blocklist against each title.
//   5. Upsert into coop_videos. The upsert never overwrites is_oneoff
//      (it's not in the returning update set) and never re-touches
//      is_short on a row that already has a value.
//   6. Disappearance sweep: any DB row for the channel not in step 1
//      gets one more videos.list check — missing from the response means
//      the video is private/deleted, flag availability='unavailable'.
//
// Never calls search.list. Ever. Search is Supabase-only.
// ------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { compile as compileBlocklist, matches as matchesBlocklist } from '../../js/blocklist.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Every 6 hours. Netlify scheduled function config.
export const config = { schedule: '0 */6 * * *' };

// ---------- helpers ----------

// Parse ISO 8601 duration (PT#H#M#S). Returns integer seconds.
function parseIsoDuration(d) {
  if (!d) return null;
  const m = d.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, days, h, min, s] = m;
  return (+(days || 0)) * 86400 + (+(h || 0)) * 3600 + (+(min || 0)) * 60 + +(s || 0);
}

async function yt(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: YOUTUBE_API_KEY })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube ${endpoint} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function probeShort(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual'
    });
    // 200 → is a Short. Any 3xx → redirected to /watch, not a Short.
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
    return null;   // caller falls back
  } catch {
    return null;   // caller falls back
  }
}

async function fetchAllPages(endpoint, baseParams, itemsCap = 50) {
  // For playlistItems.list — we cap at 50 (single page) per plan; kept as
  // a helper in case we need more later.
  const data = await yt(endpoint, { ...baseParams, maxResults: itemsCap });
  return data.items || [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- per-channel sync ----------

async function syncChannel(channel, blocklistRegex) {
  const stats = { channel_id: channel.id, upserted: 0, marked_unavailable: 0, errors: [] };

  // 1. Uploads playlist page.
  let items;
  try {
    items = await fetchAllPages('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: channel.uploads_playlist_id
    });
  } catch (e) {
    stats.errors.push(`playlistItems: ${e.message}`);
    return stats;
  }

  const ids = items
    .map(it => it.contentDetails?.videoId)
    .filter(Boolean);
  if (ids.length === 0) return stats;

  // 2. videos.list in batches of 50.
  const detailsById = new Map();
  for (const batch of chunk(ids, 50)) {
    try {
      const data = await yt('videos', {
        part: 'contentDetails,snippet,liveStreamingDetails',
        id: batch.join(',')
      });
      for (const v of data.items || []) detailsById.set(v.id, v);
    } catch (e) {
      stats.errors.push(`videos.list: ${e.message}`);
    }
  }

  // 3. Look up existing is_short state (so we don't re-probe).
  const { data: existing } = await supabase
    .from('coop_videos')
    .select('id, is_short, is_oneoff')
    .in('id', ids);
  const existingById = new Map((existing || []).map(r => [r.id, r]));

  // 4. Build upsert rows.
  const rows = [];
  for (const id of ids) {
    const v = detailsById.get(id);
    if (!v) continue;   // API dropped it — will be caught in disappearance sweep
    const title = v.snippet?.title || '';
    const duration_seconds = parseIsoDuration(v.contentDetails?.duration);
    const live = v.snippet?.liveBroadcastContent;
    const is_live = live === 'live';
    const is_upcoming = live === 'upcoming';
    const blocked_by_keyword = matchesBlocklist(title, blocklistRegex);

    const existingRow = existingById.get(id);
    let is_short = existingRow ? existingRow.is_short : null;
    if (is_short === null) {
      is_short = await probeShort(id);
      if (is_short === null) {
        // fallback: duration-only
        is_short = duration_seconds != null && duration_seconds <= 60;
      }
    }

    rows.push({
      id,
      channel_id: channel.id,
      title,
      thumbnail_url: v.snippet?.thumbnails?.medium?.url
                  || v.snippet?.thumbnails?.default?.url
                  || null,
      channel_title: v.snippet?.channelTitle || channel.title,
      published_at: v.snippet?.publishedAt || null,
      duration_seconds,
      is_short,
      is_live,
      is_upcoming,
      availability: 'available',
      blocked_by_keyword,
      // is_oneoff intentionally omitted from the row — the upsert's
      // onConflict update ignores it, so an existing is_oneoff=true row
      // keeps its flag. For NEW rows, DB default is false.
      synced_at: new Date().toISOString()
    });
  }

  if (rows.length) {
    // supabase-js upsert with default onConflict on the PK.
    const { error } = await supabase.from('coop_videos').upsert(rows, {
      onConflict: 'id',
      ignoreDuplicates: false
    });
    if (error) stats.errors.push(`upsert: ${error.message}`);
    else stats.upserted = rows.length;
  }

  // 6. Disappearance sweep. Any DB row for this channel not in the fresh
  // playlist page might have been removed. Do one more videos.list on
  // those. IDs the API doesn't return at all are unavailable.
  const { data: dbForChannel } = await supabase
    .from('coop_videos')
    .select('id')
    .eq('channel_id', channel.id);
  const dbIds = new Set((dbForChannel || []).map(r => r.id));
  const freshIds = new Set(ids);
  const missing = [...dbIds].filter(x => !freshIds.has(x));
  if (missing.length) {
    const stillThere = new Set();
    for (const batch of chunk(missing, 50)) {
      try {
        const data = await yt('videos', { part: 'id', id: batch.join(',') });
        for (const v of data.items || []) stillThere.add(v.id);
      } catch (e) {
        stats.errors.push(`missing check: ${e.message}`);
      }
    }
    const gone = missing.filter(id => !stillThere.has(id));
    if (gone.length) {
      const { error } = await supabase
        .from('coop_videos')
        .update({ availability: 'unavailable' })
        .in('id', gone);
      if (error) stats.errors.push(`unavailable update: ${error.message}`);
      else stats.marked_unavailable = gone.length;
    }
  }

  // 7. Timestamp the channel.
  await supabase
    .from('coop_channels')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', channel.id);

  return stats;
}

// ---------- entry point ----------

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !YOUTUBE_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Server env missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const { data: channels, error: chErr } = await supabase
    .from('coop_channels')
    .select('id, title, uploads_playlist_id');
  if (chErr) {
    return new Response(JSON.stringify({ ok: false, error: chErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const { data: kws } = await supabase.from('coop_blocklist_keywords').select('keyword');
  const blocklistRegex = compileBlocklist((kws || []).map(k => k.keyword));

  const perChannel = [];
  for (const ch of channels || []) {
    perChannel.push(await syncChannel(ch, blocklistRegex));
  }
  const summary = {
    ok: true,
    channels_synced: perChannel.length,
    videos_upserted: perChannel.reduce((n, s) => n + s.upserted, 0),
    marked_unavailable: perChannel.reduce((n, s) => n + s.marked_unavailable, 0),
    per_channel: perChannel
  };
  return new Response(JSON.stringify(summary), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
