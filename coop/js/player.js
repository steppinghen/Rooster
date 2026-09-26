// ------------------------------------------------------------------------
// coop/js/player.js
//
// Seamless in-app YouTube player.
//
// Opening: fade to dark (200 ms) → kid's avatar centered with an SVG
// accent ring that draws itself around it (~600 ms) → when both the
// player fires PLAYING and 600 ms have elapsed, fade avatar+ring out
// and the video in (~250 ms). If the video doesn't start after ~2 s
// the ring gently pulses until it does. Same intro is used when the
// kid taps an Up Next pick.
//
// Pause masking: whenever state ≠ PLAYING after the video has once
// started, mask only the edges of the player so YouTube's pause chrome
// (title, "Watch on YouTube", share, suggestions) is hidden while the
// real paused video frame stays visible in the middle. Portrait puts
// solid black over the letterbox bars; landscape fades dark strips
// over the top/bottom edges plus a very light overall dim. Our own
// big centered Play button covers YouTube's center pause flash.
//
// Controls: big centered Play/Pause in the kid's accent, back FAB
// top-left, bottom bar with progress + time + ±10 s + CC. Tap the
// screen to show/hide; auto-hide after 3 s while playing. Scrubbing
// uses pointer events with touch-action: none and a 44 px hit area.
// Double-tap left/right third seeks ±10 s with a brief hint. CC uses
// loadModule('captions') + setOption; per-kid preference is stored on
// device.
//
// Close: fade out to the previous screen (no shrink). Swipe down also
// closes. Resume position saved per (profile, video) in localStorage.
// prefers-reduced-motion swaps ring draw for a plain fade.
// ------------------------------------------------------------------------

import { h, icon, ICONS } from './dom.js';
import { avatarSvg } from './avatars.js';
import * as data from './data.js';
import { attachLongPress, openBlockSheet } from './kidBlock.js';

// ---------- module state ----------
let apiReady = null;
let ytPlayer = null;
let YT_NS = null;

let container = null;
let iframeWrap = null, iframeSlot = null;
let tapShield = null;
let introThumb = null;          // thumbnail behind intro (pre-first-play only)
let maskTop = null;             // pause: covers YouTube UI at top edge / letterbox
let maskBottom = null;          // pause: covers YouTube UI at bottom edge / letterbox
let maskDim = null;             // pause: very light dim across the frame (landscape only)
let intro = null;               // opening animation (avatar + ring)
let introAvatar = null;
let introRing = null;
let controls = null;
let backBtn = null;
let centerPP = null;            // big centered play/pause
let scrubTrack = null, scrubFill = null, scrubThumb = null;
let timeLabel = null;
let skipBackBtn = null;
let skipFwdBtn = null;
let ccBtn = null;
let hintLabel = null;           // "−10" / "+10" flash
let upNextOverlay = null;
let fallbackPlay = null;

let current = null;             // { profile, profileId, videoId, title, thumbnailUrl, channelId, returnTo, hasStarted, playingResolver }
let controlsVisible = false;
let controlsHideTimer = null;
let progressTimer = null;
let saveTimer = null;
let userSeeking = false;
let scrubberPointerId = null;
let ccOn = false;
let ccAvailable = false;
let openInFlight = false;
let lastTap = { t: 0, x: 0 };

const REDUCED = () => window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
const RING_CIRCUMFERENCE = 327;   // 2π·52, matches the CSS

// ---------- resume position ----------
function posKey(p, v) { return `coop_pos_${p}_${v}`; }
function readResumePos(p, v) {
  try {
    const raw = localStorage.getItem(posKey(p, v));
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 3 ? n : 0;
  } catch { return 0; }
}
function writeResumePos(p, v, s) {
  try { localStorage.setItem(posKey(p, v), String(Math.floor(s))); } catch {}
}
function clearResumePos(p, v) { try { localStorage.removeItem(posKey(p, v)); } catch {} }

// ---------- CC preference ----------
function ccKey(p) { return `coop_cc_${p}`; }
function readCcPref(p) { try { return localStorage.getItem(ccKey(p)) === 'on'; } catch { return false; } }
function writeCcPref(p, on) { try { localStorage.setItem(ccKey(p), on ? 'on' : 'off'); } catch {} }

// ---------- warmup ----------
export function warmup() {
  if (apiReady) return apiReady;
  ensureDom();
  apiReady = new Promise((resolve) => {
    const done = (YT) => {
      YT_NS = YT;
      ytPlayer = new YT.Player(iframeSlot, {
        width: '100%', height: '100%',
        playerVars: {
          controls: 0, rel: 0, iv_load_policy: 3,
          playsinline: 1, fs: 0, disablekb: 1,
          modestbranding: 1, cc_load_policy: 0
        },
        events: {
          onReady: () => resolve(YT),
          onStateChange: handleStateChange,
          onError: () => {}
        }
      });
    };
    if (window.YT && window.YT.Player) done(window.YT);
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); done(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return apiReady;
}

// ---------- DOM ----------
function ensureDom() {
  if (container) return;

  iframeSlot = h('div', { id: 'k-player-slot' });
  tapShield = h('div', { class: 'k-player-shield', 'aria-hidden': 'true' });
  iframeWrap = h('div', { class: 'k-player-video' }, iframeSlot);

  // Pause masking. Portrait: solid black covers the letterbox bars so
  // YouTube's title / share / suggestions don't peek through. Landscape:
  // gradient strips at top/bottom + a very light overall dim. See
  // style.css for the orientation-specific rules.
  maskTop = h('div', { class: 'k-player-mask-top', 'aria-hidden': 'true' });
  maskBottom = h('div', { class: 'k-player-mask-bottom', 'aria-hidden': 'true' });
  maskDim = h('div', { class: 'k-player-mask-dim', 'aria-hidden': 'true' });

  // Intro thumbnail — only shown while the video hasn't started yet,
  // never after first playback.
  introThumb = h('div', { class: 'k-player-intro-thumb', 'aria-hidden': 'true' });

  // Intro overlay — avatar + drawn accent ring. Shown during opening
  // and any time the video hasn't started yet.
  introAvatar = h('div', { class: 'k-intro-avatar' });
  introRing = h('div', { class: 'k-intro-ring-wrap' },
    // SVG with a single circle whose stroke-dashoffset is animated by CSS.
    // r=52, cx/cy=60 → circumference ≈ 327.
    Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), {}) // placeholder; replaced below
  );
  // Rebuild the ring properly (needed to keep the SVG in the right namespace).
  {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('class', 'k-intro-ring');
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60'); circle.setAttribute('r', '52');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'var(--accent)');
    circle.setAttribute('stroke-width', '4');
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(circle);
    introRing.innerHTML = '';
    introRing.appendChild(svg);
  }
  intro = h('div', { class: 'k-player-intro', 'aria-hidden': 'true' },
    introRing, introAvatar
  );

  fallbackPlay = h('button', {
    class: 'k-player-fallback', type: 'button', 'aria-label': 'Play',
    onclick: (e) => { e.stopPropagation(); tryPlay(true); }
  }, h('span', { html: icon(ICONS.play) }));

  backBtn = h('button', {
    class: 'k-player-back', type: 'button', 'aria-label': 'Close player',
    onclick: (e) => { e.stopPropagation(); close(); }
  }, h('span', { html: icon(ICONS.back) }));

  centerPP = h('button', {
    class: 'k-player-center-pp', type: 'button', 'aria-label': 'Play/Pause',
    onclick: (e) => { e.stopPropagation(); togglePlay(); }
  });
  centerPP.innerHTML = icon(ICONS.play);

  scrubFill = h('div', { class: 'k-player-scrub-fill' });
  scrubThumb = h('div', { class: 'k-player-scrub-thumb' });
  scrubTrack = h('div', { class: 'k-player-scrub', 'aria-label': 'Seek', role: 'slider' }, scrubFill, scrubThumb);
  installScrubHandlers();

  timeLabel = h('div', { class: 'k-player-time' }, '0:00 / 0:00');

  skipBackBtn = h('button', {
    class: 'k-player-skip', type: 'button', 'aria-label': 'Skip back 10 seconds',
    onclick: (e) => { e.stopPropagation(); skipBy(-10); scheduleAutoHide(); }
  }, '−10');
  skipFwdBtn = h('button', {
    class: 'k-player-skip', type: 'button', 'aria-label': 'Skip forward 10 seconds',
    onclick: (e) => { e.stopPropagation(); skipBy(10); scheduleAutoHide(); }
  }, '+10');
  ccBtn = h('button', {
    class: 'k-player-cc', type: 'button', 'aria-label': 'Captions',
    onclick: (e) => { e.stopPropagation(); toggleCc(); }
  }, 'CC');

  const bottomLine = h('div', { class: 'k-player-bottom-line' },
    timeLabel,
    h('div', { style: { flex: '1' } }),
    skipBackBtn, skipFwdBtn, ccBtn
  );
  const bottomBar = h('div', { class: 'k-player-bottom' }, scrubTrack, bottomLine);

  controls = h('div', { class: 'k-player-controls', 'aria-hidden': 'true' },
    backBtn, centerPP, bottomBar
  );

  hintLabel = h('div', { class: 'k-player-hint', 'aria-hidden': 'true' });
  upNextOverlay = h('div', { class: 'k-player-upnext', 'aria-hidden': 'true' });

  container = h('div', { class: 'k-player', 'aria-hidden': 'true', role: 'dialog' },
    iframeWrap, introThumb, maskTop, maskBottom, maskDim, intro, tapShield, controls, hintLabel, fallbackPlay, upNextOverlay
  );
  document.body.appendChild(container);

  // Tap shield handles taps on the video area (below controls in z-index
  // — see CSS — so it never covers our own controls).
  tapShield.addEventListener('click', onShieldClick);

  // Long-press inside the video area → block-video sheet for the
  // currently playing video.
  attachLongPress(tapShield, () => {
    if (!current) return;
    openBlockSheet(
      { id: current.videoId, title: current.title, thumbnail_url: current.thumbnailUrl },
      () => close()
    );
  });

  installSwipe();
}

// ---------- open ----------
export function openPlayer(opts) {
  ensureDom();

  current = {
    profile: opts.profile,
    profileId: opts.profile?.id,
    videoId: opts.videoId,
    title: opts.title,
    thumbnailUrl: opts.thumbnailUrl,
    channelId: opts.channelId,
    returnTo: opts.returnTo,
    hasStarted: false,
    playingResolver: null,
    introStart: performance.now()
  };

  // Theme.
  const accent = opts.profile?.accent_color || '#A9D3BE';
  const onAccent = opts.profile?.on_accent_text || '#14231C';
  container.style.setProperty('--accent', accent);
  container.style.setProperty('--on-accent', onAccent);

  // Reset transient UI.
  upNextOverlay.classList.remove('shown');
  upNextOverlay.innerHTML = '';
  fallbackPlay.classList.remove('shown');
  hintLabel.classList.remove('shown');
  ccOn = false; ccAvailable = false;
  updateCcButton();

  // Intro: avatar + ring, thumbnail behind (dimmed).
  introAvatar.innerHTML = `<div class="avatar-img">${avatarSvg(opts.profile?.avatar || 'animals:fox')}</div>`;
  intro.classList.remove('showing', 'pulsing');
  introThumb.style.backgroundImage = opts.thumbnailUrl ? `url("${opts.thumbnailUrl}")` : '';
  introThumb.style.opacity = '1';
  // Ensure the pause-mask is off during the intro.
  container.classList.remove('paused-mask');

  // Container fades in from black.
  container.setAttribute('aria-hidden', 'false');
  container.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  container.style.opacity = '0';
  container.offsetWidth;
  container.style.transition = 'opacity 200ms ease-out';
  container.style.opacity = '1';
  // Video wrap starts invisible; we crossfade it in once PLAYING.
  iframeWrap.style.opacity = '0';
  intro.classList.add('showing');
  // Kick the ring drawing on the next frame.
  requestAnimationFrame(() => intro.classList.add('draw'));

  // Kick a pulse if playback stalls beyond ~2 s.
  setTimeout(() => {
    if (current && !current.hasStarted) intro.classList.add('pulsing');
  }, 2000);

  // Start playback synchronously so iOS grants sound.
  const startAt = current.profileId ? readResumePos(current.profileId, current.videoId) : 0;
  const playingPromise = new Promise(r => { current.playingResolver = r; });
  const minDelay = new Promise(r => setTimeout(r, 600));

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    try { ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt }); }
    catch { showFallbackPlay(); }
  } else {
    warmup().then(() => {
      if (!current || current.videoId !== opts.videoId) return;
      try { ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt }); }
      catch { showFallbackPlay(); }
    });
    showFallbackPlay();
  }

  // Reveal the video once BOTH the min delay has elapsed AND PLAYING fires.
  openInFlight = true;
  Promise.all([playingPromise, minDelay]).then(() => {
    if (!current) return;
    revealVideo();
  });

  // Controls hidden during intro; auto-shown briefly after reveal.
}

function revealVideo() {
  if (!current) return;
  openInFlight = false;
  // Fade video in and intro (+ thumbnail behind it) out.
  iframeWrap.style.transition = 'opacity 250ms ease-out';
  iframeWrap.style.opacity = '1';
  intro.style.transition = 'opacity 250ms ease-out';
  intro.style.opacity = '0';
  introThumb.style.transition = 'opacity 250ms ease-out';
  introThumb.style.opacity = '0';
  setTimeout(() => {
    intro.classList.remove('showing', 'pulsing', 'draw');
    intro.style.opacity = '';
    intro.style.transition = '';
    iframeWrap.style.transition = '';
    introThumb.style.transition = '';
  }, 280);
  // Apply CC preference if any.
  const wantCc = current.profileId ? readCcPref(current.profileId) : false;
  if (wantCc) setTimeout(() => turnCcOn(), 400);
  // Detect CC availability shortly after.
  setTimeout(refreshCcAvailability, 1200);
  showControls();
  scheduleAutoHide();
}

// ---------- close ----------
function close() {
  if (!container.classList.contains('open')) return;
  stopProgressTimer();
  hideControls();
  savePosNow();
  const done = () => {
    container.classList.remove('open');
    container.classList.remove('paused-mask');
    container.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    // Reset styles for next open.
    container.style.opacity = ''; container.style.transition = '';
    iframeWrap.style.opacity = ''; iframeWrap.style.transition = '';
    intro.style.opacity = ''; intro.style.transition = '';
    intro.classList.remove('showing', 'pulsing', 'draw');
    introThumb.style.opacity = '0'; introThumb.style.transition = '';
    upNextOverlay.classList.remove('shown'); upNextOverlay.innerHTML = '';
    try { ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo(); } catch {}
    current = null;
  };
  // Fade out only — no shrink animation.
  container.style.transition = 'opacity 180ms ease-out';
  container.style.opacity = '0';
  setTimeout(done, 200);
}

// ---------- controls visibility ----------
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
  controlsHideTimer = setTimeout(() => { if (isPlaying()) hideControls(); }, ms);
}
function isPlaying() {
  try { return YT_NS && ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT_NS.PlayerState.PLAYING; }
  catch { return false; }
}
function updatePlayPauseIcon() {
  centerPP.innerHTML = icon(isPlaying() ? ICONS.pause : ICONS.play);
}
function togglePlay() {
  if (!ytPlayer) return;
  try {
    if (isPlaying()) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
    setTimeout(updatePlayPauseIcon, 80);
  } catch {}
}
function showFallbackPlay() {
  fallbackPlay.classList.add('shown');
}
function hideFallbackPlay() {
  fallbackPlay.classList.remove('shown');
}
function tryPlay() {
  hideFallbackPlay();
  if (!ytPlayer) return;
  try { ytPlayer.playVideo(); } catch {}
  showControls(); scheduleAutoHide();
}

// ---------- tap / double-tap on the video area ----------
function onShieldClick(e) {
  if (upNextOverlay.classList.contains('shown')) return;
  const now = Date.now();
  const x = e.clientX ?? 0;
  const w = window.innerWidth;
  // Always toggle first (so a single tap feels instant); a second tap
  // within 300 ms undoes the toggle and additionally seeks — net effect
  // is no controls flicker for a double-tap seek.
  controlsVisible ? hideControls() : showControls();
  scheduleAutoHide();
  if (now - lastTap.t < 300 && Math.abs(x - lastTap.x) < 80) {
    // Double tap
    controlsVisible ? hideControls() : showControls();   // undo
    if (x < w / 3) { skipBy(-10); flashHint('−10'); }
    else if (x > w * 2 / 3) { skipBy(10); flashHint('+10'); }
    lastTap = { t: 0, x: 0 };
  } else {
    lastTap = { t: now, x };
  }
}
function skipBy(delta) {
  if (!ytPlayer) return;
  try {
    const t = Math.max(0, ytPlayer.getCurrentTime() + delta);
    ytPlayer.seekTo(t, true);
  } catch {}
}
function flashHint(text) {
  hintLabel.textContent = text;
  hintLabel.classList.remove('shown');
  hintLabel.offsetWidth;
  hintLabel.classList.add('shown');
  setTimeout(() => hintLabel.classList.remove('shown'), 700);
}

// ---------- scrubber (pointer events, iPhone-friendly) ----------
function installScrubHandlers() {
  scrubTrack.style.touchAction = 'none';
  const setFromEvent = (evt) => {
    const rect = scrubTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (evt.clientX ?? 0) - rect.left));
    const frac = rect.width ? x / rect.width : 0;
    const duration = safeDuration();
    const t = frac * duration;
    const pct = `${(frac * 100).toFixed(2)}%`;
    scrubFill.style.width = pct;
    scrubThumb.style.left = pct;
    timeLabel.textContent = `${fmt(t, duration >= 3600)} / ${fmt(duration, duration >= 3600)}`;
    return t;
  };
  scrubTrack.addEventListener('pointerdown', (evt) => {
    evt.preventDefault();
    try { scrubTrack.setPointerCapture(evt.pointerId); } catch {}
    scrubberPointerId = evt.pointerId;
    userSeeking = true;
    const t = setFromEvent(evt);
    if (ytPlayer && ytPlayer.seekTo && Number.isFinite(t)) {
      try { ytPlayer.seekTo(t, false); } catch {}
    }
  });
  scrubTrack.addEventListener('pointermove', (evt) => {
    if (!userSeeking || evt.pointerId !== scrubberPointerId) return;
    const t = setFromEvent(evt);
    if (ytPlayer && ytPlayer.seekTo && Number.isFinite(t)) {
      try { ytPlayer.seekTo(t, false); } catch {}
    }
  });
  const endSeek = (evt) => {
    if (!userSeeking || (scrubberPointerId != null && evt.pointerId !== scrubberPointerId)) return;
    const t = setFromEvent(evt);
    userSeeking = false;
    scrubberPointerId = null;
    if (ytPlayer && ytPlayer.seekTo && Number.isFinite(t)) {
      try { ytPlayer.seekTo(t, true); } catch {}
    }
    scheduleAutoHide();
  };
  scrubTrack.addEventListener('pointerup', endSeek);
  scrubTrack.addEventListener('pointercancel', endSeek);
}
function fmt(sec, long) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (long) return `${h}:${String(m).padStart(2,'0')}:${ss}`;
  return `${Math.floor(s / 60)}:${ss}`;
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
    scrubThumb.style.left = pct;
    timeLabel.textContent = `${fmt(t, d >= 3600)} / ${fmt(d, d >= 3600)}`;
  }, 250);
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
    if (Number.isFinite(t) && t > 3 && d && t < d - 3) writeResumePos(current.profileId, current.videoId, t);
  } catch {}
}

// ---------- captions ----------
function refreshCcAvailability() {
  let list = [];
  try { list = ytPlayer.getOption('captions', 'tracklist') || []; } catch { list = []; }
  ccAvailable = Array.isArray(list) && list.length > 0;
  updateCcButton();
}
function updateCcButton() {
  if (!ccBtn) return;
  ccBtn.classList.toggle('on', !!ccOn);
  ccBtn.style.display = ccAvailable ? '' : 'none';
}
function turnCcOn() {
  if (!ytPlayer) return;
  try {
    ytPlayer.loadModule('captions');
    ytPlayer.setOption('captions', 'track', { languageCode: 'en' });
    ccOn = true;
  } catch { ccOn = false; }
  updateCcButton();
}
function turnCcOff() {
  if (!ytPlayer) return;
  try { ytPlayer.unloadModule('captions'); } catch {}
  ccOn = false;
  updateCcButton();
}
function toggleCc() {
  if (!current) return;
  if (ccOn) turnCcOff(); else turnCcOn();
  writeCcPref(current.profileId, ccOn);
}

// ---------- YT state ----------
function handleStateChange(e) {
  if (!YT_NS) return;
  const S = YT_NS.PlayerState;
  switch (e.data) {
    case S.PLAYING:
      hideFallbackPlay();
      if (current) {
        current.hasStarted = true;
        if (current.playingResolver) { current.playingResolver(); current.playingResolver = null; }
      }
      hidePauseMask();
      startProgressTimer();
      updatePlayPauseIcon();
      scheduleAutoHide();
      // Recheck CC availability after PLAYING (tracklist may populate late).
      setTimeout(refreshCcAvailability, 800);
      break;
    case S.PAUSED:
      if (current && current.hasStarted) showPauseMask();
      updatePlayPauseIcon();
      showControls();
      savePosNow();
      break;
    case S.BUFFERING:
      if (current && current.hasStarted) showPauseMask();
      break;
    case S.CUED:
      if (current && current.hasStarted) showPauseMask();
      break;
    case S.ENDED:
      stopProgressTimer();
      if (current) clearResumePos(current.profileId, current.videoId);
      showPauseMask();
      onEnded();
      break;
  }
}
// The mask hides YouTube's pause chrome (title, share, watch-on-yt,
// suggestions). Paused frame stays visible in the middle; only the
// edges are covered. See style.css for portrait/landscape behaviour.
function showPauseMask() { container.classList.add('paused-mask'); }
function hidePauseMask() { container.classList.remove('paused-mask'); }

// ---------- Up Next after ENDED ----------
async function onEnded() {
  if (!current) return;
  let showUpNext = true;
  try { showUpNext = (await data.fetchPublicSettings()).show_up_next !== false; } catch {}
  if (!showUpNext) { close(); return; }
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
    const tile = h('button', {
      type: 'button', class: 'k-player-upnext-tile',
      onclick: (ev) => { ev.stopPropagation(); openInternal(v); }
    },
      h('div', { class: 'k-player-upnext-thumb', style: v.thumbnail_url ? { backgroundImage: `url("${v.thumbnail_url}")` } : {} },
        h('div', { class: 'k-player-upnext-play', html: icon(ICONS.play) })
      ),
      h('div', { class: 'k-player-upnext-title' }, v.title || '')
    );
    attachLongPress(tile, () => openBlockSheet(v, () => tile.remove()));
    grid.appendChild(tile);
  }
  grid.appendChild(h('button', {
    type: 'button', class: 'k-player-upnext-tile back',
    onclick: (ev) => { ev.stopPropagation(); close(); }
  },
    h('div', { class: 'k-player-upnext-thumb back-thumb' },
      h('div', { class: 'k-player-upnext-back-icon', html: icon(ICONS.back) })
    ),
    h('div', { class: 'k-player-upnext-title' }, picks.length ? 'Back' : 'Close')
  ));
  upNextOverlay.appendChild(grid);
  upNextOverlay.classList.add('shown');
  hideControls();
}

// Kid taps an Up Next pick — reuse the intro (avatar+ring) for the
// transition instead of jumping straight into the new video.
function openInternal(v) {
  if (!current) return;
  upNextOverlay.classList.remove('shown');
  upNextOverlay.innerHTML = '';
  hideControls();
  current.videoId = v.id;
  current.title = v.title;
  current.thumbnailUrl = v.thumbnail_url;
  current.channelId = v.channel_id || current.channelId;
  current.hasStarted = false;
  current.playingResolver = null;
  current.introStart = performance.now();

  // Hide the old video, show the intro again.
  iframeWrap.style.transition = 'opacity 180ms ease-out';
  iframeWrap.style.opacity = '0';
  container.classList.remove('paused-mask');
  introThumb.style.backgroundImage = v.thumbnail_url ? `url("${v.thumbnail_url}")` : '';
  introThumb.style.opacity = '1';
  introThumb.style.transition = '';
  intro.classList.remove('showing', 'pulsing', 'draw');
  intro.style.opacity = '';
  // Force reflow, then re-run the animation.
  intro.offsetWidth;
  intro.classList.add('showing');
  requestAnimationFrame(() => intro.classList.add('draw'));
  setTimeout(() => { if (current && !current.hasStarted) intro.classList.add('pulsing'); }, 2000);

  const startAt = readResumePos(current.profileId, current.videoId) || 0;
  const playingPromise = new Promise(r => { current.playingResolver = r; });
  const minDelay = new Promise(r => setTimeout(r, 600));
  try { ytPlayer.loadVideoById({ videoId: current.videoId, startSeconds: startAt }); }
  catch { showFallbackPlay(); }
  Promise.all([playingPromise, minDelay]).then(() => { if (current) revealVideo(); });
}

// ---------- swipe-to-close ----------
function installSwipe() {
  let startY = null, startX = null, startedOnControl = false;
  container.addEventListener('touchstart', (e) => {
    if (openInFlight) return;
    if (upNextOverlay.classList.contains('shown')) return;
    startedOnControl = !!e.target.closest('.k-player-controls, .k-player-fallback, .k-player-upnext, .k-player-back, .k-player-scrub');
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
    if (dy <= 0 || dx > 60) return;
    if (e.cancelable) e.preventDefault();
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
