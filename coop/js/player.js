// ------------------------------------------------------------------------
// coop/js/player.js
//
// Seamless in-app YouTube player. Lives as a single overlay attached to
// document.body and reused between videos — no per-open teardown, no
// black frame between tap and playback.
//
// Design summary:
//   - warmup() at app start loads the IFrame API and creates ONE hidden
//     YT.Player. Subsequent openPlayer() calls just loadVideoById()
//     synchronously from the tap handler (so iOS grants sound).
//   - openPlayer({sourceElement, thumbnailUrl, ...}) animates a
//     background thumbnail from the tile's rect to fullscreen (FLIP,
//     ~300 ms, gentle ease). Thumbnail stays over the iframe until
//     YT.PlayerState.PLAYING fires — then it crossfades out.
//   - Custom controls (accent-colored back, play/pause, scrubber) are
//     rendered on our own overlay, above a full-cover transparent tap
//     shield that blocks every YouTube UI element (title, channel,
//     "Watch on YouTube", share). Tap the shield to toggle controls;
//     controls auto-hide after 3 s of playback.
//   - Closing (back button or swipe-down) reverses the zoom into the
//     source tile's rect.
//   - Video end + Up Next on: fade three next-newest tiles + a Back
//     tile IN over the paused final frame. No route change.
//   - Resume position saved to localStorage per (profile, video) on
//     PAUSED / periodic tick / ENDED-clear.
//   - Respects prefers-reduced-motion by swapping the zoom for a fade.
// ------------------------------------------------------------------------

import { h, icon, ICONS } from './dom.js';
import * as data from './data.js';

// ---------- lifecycle state ----------
let apiReady = null;
let ytPlayer = null;
let YT_NS = null;

let container = null;
let thumb = null;
let iframeWrap = null;
let iframeSlot = null;
let tapShield = null;
let controls = null;
let backBtn = null;
let playPauseBtn = null;
let scrubTrack = null;
let scrubFill = null;
let scrubThumb = null;
let timeLabel = null;
let fallbackPlay = null;   // giant Play button shown if iOS blocks autoplay
let upNextOverlay = null;

let current = null;        // active video context (see openPlayer)
let controlsVisible = false;
let controlsHideTimer = null;
let progressTimer = null;
let userSeeking = false;
let saveTimer = null;
let openInFlight = false;  // during open animation

const REDUCED = () => window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

// ---------- resume position ----------
function posKey(profileId, videoId) { return `coop_pos_${profileId}_${videoId}`; }
function readResumePos(profileId, videoId) {
  try {
    const raw = localStorage.getItem(posKey(profileId, videoId));
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 3 ? n : 0;   // ignore tiny values
  } catch { return 0; }
}
function writeResumePos(profileId, videoId, seconds) {
  try { localStorage.setItem(posKey(profileId, videoId), String(Math.floor(seconds))); }
  catch { /* private mode */ }
}
function clearResumePos(profileId, videoId) {
  try { localStorage.removeItem(posKey(profileId, videoId)); } catch {}
}

// ---------- warmup: load API + create hidden player ----------
export function warmup() {
  if (apiReady) return apiReady;
  ensureDom();
  apiReady = new Promise(resolve => {
    const done = (YT) => {
      YT_NS = YT;
      ytPlayer = new YT.Player(iframeSlot, {
        width: '100%', height: '100%',
        playerVars: {
          controls: 0, rel: 0, iv_load_policy: 3,
          playsinline: 1, fs: 0, disablekb: 1,
          modestbranding: 1
        },
        events: {
          onReady: () => resolve(YT),
          onStateChange: handleStateChange,
          onError: () => {
            // Silent — fallback play button is already shown if we're
            // stuck; back button always closes.
          }
        }
      });
    };
    if (window.YT && window.YT.Player) done(window.YT);
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); done(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return apiReady;
}

// ---------- DOM ----------
function ensureDom() {
  if (container) return;

  thumb = h('div', { class: 'k-player-thumb', 'aria-hidden': 'true' });
  iframeSlot = h('div', { id: 'k-player-slot' });   // YT.Player replaces this
  tapShield = h('div', { class: 'k-player-shield', 'aria-hidden': 'true' });
  iframeWrap = h('div', { class: 'k-player-video' }, iframeSlot, tapShield);

  fallbackPlay = h('button', {
    class: 'k-player-fallback',
    type: 'button',
    'aria-label': 'Play',
    onclick: (e) => { e.stopPropagation(); tryPlay(true); }
  }, h('span', { html: icon(ICONS.play) }));

  backBtn = h('button', {
    class: 'k-player-back',
    type: 'button',
    'aria-label': 'Close player',
    onclick: (e) => { e.stopPropagation(); close(); }
  }, h('span', { html: icon(ICONS.back) }));

  playPauseBtn = h('button', {
    class: 'k-player-playpause',
    type: 'button',
    'aria-label': 'Play/Pause',
    onclick: (e) => { e.stopPropagation(); togglePlay(); }
  });
  playPauseBtn.innerHTML = icon(ICONS.play);

  scrubFill = h('div', { class: 'k-player-scrub-fill' });
  scrubThumb = h('div', { class: 'k-player-scrub-thumb' });
  scrubTrack = h('div', { class: 'k-player-scrub' }, scrubFill, scrubThumb);
  installScrubHandlers();

  timeLabel = h('div', { class: 'k-player-time' }, '0:00 / 0:00');

  controls = h('div', { class: 'k-player-controls', 'aria-hidden': 'true' },
    backBtn,
    h('div', { class: 'k-player-bottom' },
      playPauseBtn,
      h('div', { class: 'k-player-bottom-line' }, scrubTrack, timeLabel)
    )
  );

  upNextOverlay = h('div', { class: 'k-player-upnext', 'aria-hidden': 'true' });

  container = h('div', { class: 'k-player', 'aria-hidden': 'true', 'role': 'dialog' },
    iframeWrap, thumb, fallbackPlay, controls, upNextOverlay
  );
  document.body.appendChild(container);

  // Tap on the video area toggles controls. Controls' buttons stop
  // propagation so their taps don't also toggle.
  tapShield.addEventListener('click', () => {
    if (upNextOverlay.classList.contains('shown')) return;
    controlsVisible ? hideControls() : showControls();
  });

  installSwipe();
}

// ---------- open ----------
export function openPlayer(opts) {
  // opts: { profile, videoId, title, thumbnailUrl, channelId, sourceElement, returnTo }
  ensureDom();

  current = {
    profileId: opts.profile?.id,
    profile: opts.profile,
    videoId: opts.videoId,
    title: opts.title,
    thumbnailUrl: opts.thumbnailUrl,
    channelId: opts.channelId,
    returnTo: opts.returnTo,
    sourceElement: opts.sourceElement || null,
    sourceRect: opts.sourceElement ? opts.sourceElement.getBoundingClientRect() : null
  };

  // Accent theming.
  const accent = opts.profile?.accent_color || '#A9D3BE';
  const onAccent = opts.profile?.on_accent_text || '#14231C';
  container.style.setProperty('--accent', accent);
  container.style.setProperty('--on-accent', onAccent);

  // Reset overlays and thumb.
  upNextOverlay.classList.remove('shown');
  upNextOverlay.innerHTML = '';
  upNextOverlay.setAttribute('aria-hidden', 'true');
  fallbackPlay.classList.remove('shown');
  thumb.style.opacity = '1';
  thumb.style.backgroundImage = opts.thumbnailUrl ? `url("${opts.thumbnailUrl}")` : 'linear-gradient(180deg,#1A2230,#0F1620)';

  // Show container (display: flex).
  container.setAttribute('aria-hidden', 'false');
  container.classList.add('open');
  document.documentElement.style.overflow = 'hidden';

  // Animate open.
  openInFlight = true;
  if (current.sourceRect && !REDUCED()) animateFromRect(current.sourceRect);
  else fadeInContainer();

  // Try to start playback SYNCHRONOUSLY from the tap handler so iOS
  // grants sound. If the API isn't ready yet (first ever open),
  // schedule + show fallback so the kid can tap to play.
  const startAt = current.profileId ? readResumePos(current.profileId, current.videoId) : 0;
  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    try {
      ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt });
    } catch { showFallbackPlay(); }
  } else {
    // API still loading. Queue play + expose fallback.
    warmup().then(() => {
      if (!current || current.videoId !== opts.videoId) return;
      try { ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt }); }
      catch { showFallbackPlay(); }
    });
    showFallbackPlay();
  }

  showControls();
  scheduleAutoHide(3500);
}

function fadeInContainer() {
  container.style.opacity = '0';
  container.offsetWidth;
  container.style.transition = 'opacity 200ms ease-out';
  container.style.opacity = '1';
  requestAnimationFrame(() => setTimeout(() => { openInFlight = false; container.style.transition = ''; }, 220));
}

function animateFromRect(rect) {
  // FLIP: start with a transform that makes the fullscreen thumb look
  // like the source tile, then transition to identity.
  const vw = window.innerWidth, vh = window.innerHeight;
  const sx = rect.width / vw;
  const sy = rect.height / vh;
  const dx = rect.left, dy = rect.top;
  thumb.style.transformOrigin = 'top left';
  thumb.style.transition = 'none';
  thumb.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  // Also fade the iframe/tap shield in so the first frame doesn't flash.
  iframeWrap.style.opacity = '0';
  controls.style.opacity = '0';
  // Force reflow, then animate.
  thumb.offsetWidth;
  const dur = 300;
  const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
  thumb.style.transition = `transform ${dur}ms ${ease}`;
  thumb.style.transform = 'none';
  iframeWrap.style.transition = `opacity ${dur}ms ${ease}`;
  iframeWrap.style.opacity = '1';
  controls.style.transition = `opacity ${dur}ms ${ease}`;
  controls.style.opacity = '1';
  setTimeout(() => {
    thumb.style.transition = '';
    iframeWrap.style.transition = '';
    controls.style.transition = '';
    openInFlight = false;
  }, dur + 20);
}

// ---------- close ----------
function close() {
  if (!container.classList.contains('open')) return;
  stopProgressTimer();
  hideControls();
  savePosNow();

  const rect = getCurrentSourceRect();
  const doFinish = () => {
    container.classList.remove('open');
    container.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    // Reset styles for next open.
    thumb.style.transform = '';
    thumb.style.transition = '';
    thumb.style.opacity = '1';
    iframeWrap.style.opacity = '';
    controls.style.opacity = '';
    upNextOverlay.classList.remove('shown');
    upNextOverlay.innerHTML = '';
    // Stop playback so audio doesn't linger.
    try { ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo(); } catch {}
    current = null;
  };

  if (rect && !REDUCED()) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = rect.width / vw;
    const sy = rect.height / vh;
    const dx = rect.left, dy = rect.top;
    // Bring the thumb back on top of the (soon-to-fade) iframe.
    thumb.style.opacity = '1';
    thumb.style.transition = 'none';
    thumb.style.transformOrigin = 'top left';
    thumb.style.transform = 'none';
    thumb.offsetWidth;
    const dur = 260;
    const ease = 'cubic-bezier(0.4, 0, 0.6, 1)';
    thumb.style.transition = `transform ${dur}ms ${ease}, opacity 120ms ease-in ${dur - 100}ms`;
    thumb.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    thumb.style.opacity = '0.001';
    iframeWrap.style.transition = `opacity ${dur}ms ${ease}`;
    iframeWrap.style.opacity = '0';
    controls.style.transition = `opacity 120ms ease-out`;
    controls.style.opacity = '0';
    setTimeout(doFinish, dur + 20);
  } else {
    container.style.transition = 'opacity 180ms ease-out';
    container.style.opacity = '0';
    setTimeout(() => { container.style.opacity = ''; container.style.transition = ''; doFinish(); }, 200);
  }
}
function getCurrentSourceRect() {
  if (!current || !current.sourceElement) return null;
  try {
    const r = current.sourceElement.getBoundingClientRect();
    // If the element was removed / is 0 area, treat as no rect.
    if (r.width === 0 || r.height === 0) return null;
    return r;
  } catch { return null; }
}

// ---------- controls ----------
function showControls() {
  controls.classList.add('visible');
  controls.setAttribute('aria-hidden', 'false');
  controlsVisible = true;
}
function hideControls() {
  controls.classList.remove('visible');
  controls.setAttribute('aria-hidden', 'true');
  controlsVisible = false;
}
function scheduleAutoHide(ms = 3000) {
  clearTimeout(controlsHideTimer);
  controlsHideTimer = setTimeout(() => {
    if (isPlaying()) hideControls();
  }, ms);
}
function isPlaying() {
  try { return YT_NS && ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT_NS.PlayerState.PLAYING; }
  catch { return false; }
}
function togglePlay() {
  if (!ytPlayer) return;
  try {
    if (isPlaying()) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
    // Reflect state in the button icon a beat later.
    setTimeout(updatePlayPauseIcon, 100);
  } catch {}
}
function updatePlayPauseIcon() {
  playPauseBtn.innerHTML = icon(isPlaying() ? ICONS.pause || '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>' : ICONS.play);
}
function showFallbackPlay() {
  fallbackPlay.classList.add('shown');
  fallbackPlay.setAttribute('aria-hidden', 'false');
}
function hideFallbackPlay() {
  fallbackPlay.classList.remove('shown');
  fallbackPlay.setAttribute('aria-hidden', 'true');
}
function tryPlay(fromUser) {
  hideFallbackPlay();
  if (!ytPlayer) return;
  try { ytPlayer.playVideo(); } catch {}
  if (fromUser) { showControls(); scheduleAutoHide(); }
}

// ---------- scrubber ----------
function installScrubHandlers() {
  const setFromEvent = (evt) => {
    const rect = scrubTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (evt.touches?.[0]?.clientX ?? evt.clientX) - rect.left));
    const frac = rect.width ? x / rect.width : 0;
    const duration = safeDuration();
    if (!duration) return;
    const t = frac * duration;
    const pct = `${(frac * 100).toFixed(2)}%`;
    scrubFill.style.width = pct;
    if (scrubThumb) scrubThumb.style.left = pct;
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(duration)}`;
    return t;
  };
  const start = (evt) => {
    userSeeking = true;
    setFromEvent(evt);
    if (evt.cancelable) evt.preventDefault();
  };
  const move = (evt) => {
    if (!userSeeking) return;
    setFromEvent(evt);
    if (evt.cancelable) evt.preventDefault();
  };
  const end = (evt) => {
    if (!userSeeking) return;
    const t = setFromEvent(evt);
    userSeeking = false;
    if (typeof t === 'number' && ytPlayer && ytPlayer.seekTo) {
      try { ytPlayer.seekTo(t, true); } catch {}
    }
    scheduleAutoHide();
  };
  scrubTrack.addEventListener('mousedown', start);
  scrubTrack.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
}
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}
function safeDuration() {
  try { return (ytPlayer && ytPlayer.getDuration && ytPlayer.getDuration()) || 0; } catch { return 0; }
}
function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (userSeeking) return;
    const t = (() => { try { return ytPlayer.getCurrentTime() || 0; } catch { return 0; } })();
    const d = safeDuration();
    const frac = d ? Math.min(1, t / d) : 0;
    const pct = `${(frac * 100).toFixed(2)}%`;
    scrubFill.style.width = pct;
    if (scrubThumb) scrubThumb.style.left = pct;
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
  }, 250);
  // Save resume position every ~5 s while playing.
  clearInterval(saveTimer);
  saveTimer = setInterval(savePosNow, 5000);
}
function stopProgressTimer() {
  clearInterval(progressTimer); progressTimer = null;
  clearInterval(saveTimer); saveTimer = null;
}
function savePosNow() {
  if (!current) return;
  try {
    const t = ytPlayer.getCurrentTime();
    const d = safeDuration();
    if (Number.isFinite(t) && t > 3 && d && t < d - 3) {
      writeResumePos(current.profileId, current.videoId, t);
    }
  } catch {}
}

// ---------- YT state changes ----------
function handleStateChange(e) {
  if (!YT_NS) return;
  const S = YT_NS.PlayerState;
  switch (e.data) {
    case S.PLAYING:
      hideFallbackPlay();
      // Crossfade the thumbnail out — we're on the first frame.
      if (thumb.style.opacity !== '0') {
        thumb.style.transition = 'opacity 260ms ease-out';
        thumb.style.opacity = '0';
      }
      startProgressTimer();
      updatePlayPauseIcon();
      scheduleAutoHide();
      break;
    case S.PAUSED:
      updatePlayPauseIcon();
      showControls();
      savePosNow();
      break;
    case S.ENDED:
      stopProgressTimer();
      // Clear resume for this video since it's finished.
      if (current) clearResumePos(current.profileId, current.videoId);
      onEnded();
      break;
    case S.BUFFERING:
      // no-op — keep thumb visible if we haven't played yet.
      break;
    case S.CUED:
      updatePlayPauseIcon();
      break;
  }
}

async function onEnded() {
  if (!current) return;
  // Fetch show_up_next from public settings.
  let showUpNext = true;
  try { showUpNext = (await data.fetchPublicSettings()).show_up_next !== false; } catch {}
  if (!showUpNext) { close(); return; }

  // Load 3 next-newest for the same channel (feed-filtered).
  let picks = [];
  try {
    if (current.channelId) {
      const feed = await data.fetchFeedForChannel(current.profileId, current.channelId);
      picks = feed.filter(v => v.id !== current.videoId).slice(0, 3);
    }
  } catch {}

  renderUpNextOverlay(picks);
}

function renderUpNextOverlay(picks) {
  upNextOverlay.innerHTML = '';
  const grid = h('div', { class: 'k-player-upnext-grid' });
  for (const v of picks) {
    grid.appendChild(h('button', {
      type: 'button',
      class: 'k-player-upnext-tile',
      onclick: (ev) => { ev.stopPropagation(); openInternal(v); }
    },
      h('div', { class: 'k-player-upnext-thumb', style: v.thumbnail_url ? { backgroundImage: `url("${v.thumbnail_url}")` } : {} },
        h('div', { class: 'k-player-upnext-play', html: icon(ICONS.play) })
      ),
      h('div', { class: 'k-player-upnext-title' }, v.title || '')
    ));
  }
  grid.appendChild(h('button', {
    type: 'button',
    class: 'k-player-upnext-tile back',
    onclick: (ev) => { ev.stopPropagation(); close(); }
  },
    h('div', { class: 'k-player-upnext-thumb back-thumb' },
      h('div', { class: 'k-player-upnext-back-icon', html: icon(ICONS.back) })
    ),
    h('div', { class: 'k-player-upnext-title' }, picks.length ? 'Back' : 'Close')
  ));
  upNextOverlay.appendChild(grid);
  upNextOverlay.classList.add('shown');
  upNextOverlay.setAttribute('aria-hidden', 'false');
  hideControls();
}

// Internal: switch to a new video without closing/reopening the player.
function openInternal(v) {
  if (!current) return;
  upNextOverlay.classList.remove('shown');
  upNextOverlay.innerHTML = '';
  // Update thumbnail crossfade.
  thumb.style.transition = 'none';
  thumb.style.opacity = '1';
  thumb.style.backgroundImage = v.thumbnail_url ? `url("${v.thumbnail_url}")` : '';
  thumb.offsetWidth;
  thumb.style.transition = 'opacity 260ms ease-out';
  // Update current context.
  current.videoId = v.id;
  current.title = v.title;
  current.thumbnailUrl = v.thumbnail_url;
  current.channelId = v.channel_id || current.channelId;
  const startAt = readResumePos(current.profileId, current.videoId) || 0;
  try { ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt }); }
  catch { showFallbackPlay(); }
  showControls();
  scheduleAutoHide();
}

// ---------- swipe-down to close ----------
function installSwipe() {
  let startY = null, startX = null, startedOnControl = false;
  container.addEventListener('touchstart', (e) => {
    if (openInFlight) return;
    if (upNextOverlay.classList.contains('shown')) return;
    startedOnControl = !!e.target.closest('.k-player-controls, .k-player-fallback, .k-player-upnext, .k-player-back');
    if (startedOnControl) return;
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    container.style.transition = '';
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (startedOnControl || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > 60) { return; }
    if (e.cancelable) e.preventDefault();
    // Drag the whole overlay down slightly, with rubber-band.
    const t = Math.min(1, dy / 400);
    container.style.transform = `translateY(${dy * 0.6}px)`;
    container.style.opacity = String(1 - t * 0.5);
  }, { passive: false });
  container.addEventListener('touchend', (e) => {
    if (startedOnControl || startY == null) { startY = null; return; }
    const dy = (e.changedTouches[0]?.clientY ?? 0) - startY;
    startY = null; startX = null;
    if (dy > 120) {
      container.style.transform = '';
      container.style.opacity = '';
      close();
    } else {
      container.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
      container.style.transform = '';
      container.style.opacity = '';
      setTimeout(() => { container.style.transition = ''; }, 200);
    }
  });
}
