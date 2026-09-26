// ------------------------------------------------------------------------
// coop/js/ui.js
//
// Router + entry screens (profileSelect, kidPin, parentPin, videoPlayer).
// Kid screens live in js/kid.js; parent screens live in js/parent.js.
// This file never talks to Supabase or YouTube directly.
// ------------------------------------------------------------------------

import { avatarSvg, PACKS, DEFAULT_AVATAR_ID } from './avatars.js';
import * as data from './data.js';
import * as writer from './writer.js';
import { createPlayer, destroyPlayer } from './youtube.js';
import { h, icon, ICONS, toast } from './dom.js';
import * as kid from './kid.js';
import * as parent from './parent.js';

// --- Routing ---
let current = { screen: null, params: {} };
export function go(screen, params = {}) {
  current = { screen, params };
  render().catch(err => {
    console.error(err);
    toast('Error: ' + (err.message || err));
  });
}

// Theme-color: dark for kid + entry screens (default #1A2230),
// iOS-black for parent screens (#000000). Keeps the iOS status-bar
// overlay matched to whatever page is showing.
const PARENT_SCREENS = new Set([
  'parentPin', 'parentHome', 'parentKids', 'parentKidDetail',
  'parentChannels', 'parentVideos', 'parentBlocklist', 'parentSettings'
]);
const THEME_COLORS = { dark: '#1A2230', black: '#000000' };
function setThemeColor(hex) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.getAttribute('content') !== hex) meta.setAttribute('content', hex);
}

async function render() {
  const appEl = document.getElementById('app');
  appEl.innerHTML = '';
  if (!current.screen) current.screen = 'profileSelect';
  setThemeColor(PARENT_SCREENS.has(current.screen) ? THEME_COLORS.black : THEME_COLORS.dark);

  const fn = Screens[current.screen];
  if (fn) await fn(appEl, current.params);
  else await Screens.profileSelect(appEl, {});
}

// ============================================================
// SCREENS
// ============================================================
const Screens = {};

// --- Profile Select (dark kid page) ---
Screens.profileSelect = async (root) => {
  const page = h('div', { class: 'k-page centered profile-select' });
  root.appendChild(page);
  page.appendChild(h('div', { style: { color: 'var(--k-fg-muted)' } }, 'Loading…'));

  let profiles;
  try { profiles = await data.fetchProfiles(); }
  catch (e) { page.innerHTML = ''; page.appendChild(h('p', {}, 'Could not load profiles: ' + e.message)); return; }
  const pinFlags = await Promise.all(profiles.map(p => data.hasKidPin(p.id).catch(() => false)));

  page.innerHTML = '';
  page.append(h('h1', { class: 'k-profile-select-title' },
    profiles.length ? "Who's watching?" : "Let's add a profile"));

  const grid = h('div', { class: 'k-profile-grid' });
  profiles.forEach((p, i) => {
    const accent = p.accent_color || '#A9D3BE';
    const hasPin = pinFlags[i];
    grid.appendChild(h('button', {
      class: 'k-profile-tile',
      style: { '--tile-accent': accent },
      onclick: () => {
        if (hasPin) go('kidPin', { profileId: p.id });
        else go('kidHome', { profileId: p.id });
      }
    },
      h('div', { class: 'k-profile-avatar-wrap' },
        h('div', { class: 'k-profile-avatar' },
          h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })
        ),
        hasPin ? h('div', { class: 'k-profile-lock-badge', 'aria-label': 'PIN required', html: icon(ICONS.lock) }) : null
      ),
      h('div', { class: 'k-profile-name' }, p.name)
    ));
  });
  if (!profiles.length) {
    grid.appendChild(h('button', {
      class: 'k-profile-tile',
      style: { '--tile-accent': '#9CC8E8' },
      onclick: () => go('parentPin', { nextScreen: 'parentKids' })
    },
      h('div', { class: 'k-profile-avatar-wrap' },
        h('div', { class: 'k-profile-avatar',
          style: { border: '3px dashed rgba(255,255,255,0.25)', color: 'var(--k-fg-muted)', fontSize: '48px' } },
          h('div', {}, '+')
        )
      ),
      h('div', { class: 'k-profile-name' }, 'Add a profile')));
  }
  page.appendChild(grid);
  root.appendChild(h('button', {
    class: 'k-parent-mode-btn',
    onclick: () => go('parentPin'),
    title: 'Parent Mode',
    'aria-label': 'Parent Mode',
    html: icon(ICONS.lock)
  }));
};

// --- Kid PIN (per-kid accent) ---
Screens.kidPin = async (root, { profileId }) => {
  const profiles = await data.fetchProfiles();
  const p = profiles.find(x => x.id === profileId);
  if (!p) return go('profileSelect');
  const accent = p.accent_color || '#A9D3BE';
  const onAccent = p.on_accent_text || '#14231C';
  const page = h('div', {
    class: 'k-page centered kid-pin',
    style: { '--accent': accent, '--on-accent': onAccent }
  });
  root.appendChild(h('button', {
    class: 'k-back-fab',
    onclick: () => go('profileSelect'),
    'aria-label': 'Back to profile select',
    html: icon(ICONS.back)
  }));

  const pinDisplay = h('div', { class: 'k-pin-display' });
  let pin = '';
  const renderDots = () => {
    pinDisplay.innerHTML = '';
    for (let i = 0; i < 4; i++) pinDisplay.appendChild(h('div', { class: 'k-pin-dot' + (i < pin.length ? ' filled' : '') }));
  };
  const fail = () => {
    pin = ''; renderDots();
    pinDisplay.classList.add('k-pin-shake');
    setTimeout(() => pinDisplay.classList.remove('k-pin-shake'), 400);
  };
  const submit = async () => {
    if (pin.length !== 4) return;
    const ok = await data.verifyKidPin(profileId, pin).catch(() => false);
    if (ok) { try { sessionStorage.setItem('coop_kid_pin_' + profileId, pin); } catch {} go('kidHome', { profileId }); }
    else { toast("That's not the right code"); fail(); }
  };
  const numpad = h('div', { class: 'k-numpad' });
  const press = (d) => { if (pin.length < 4) { pin += d; renderDots(); if (pin.length === 4) setTimeout(submit, 120); } };
  for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = ''; renderDots(); } }, 'Clear'));
  numpad.appendChild(h('button', { type: 'button', onclick: () => press('0') }, '0'));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = pin.slice(0, -1); renderDots(); }, html: '⌫' }));
  renderDots();

  page.append(
    h('div', { class: 'k-pin-avatar' }, h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })),
    h('div', { class: 'k-pin-title' }, `Hi, ${p.name}!`),
    h('div', { class: 'k-pin-subtitle' }, 'Enter your secret code'),
    pinDisplay,
    numpad
  );
  root.appendChild(page);
};

// --- Kid screens (delegated to kid.js) ---
Screens.kidHome       = async (root, { profileId }) => kidScreen(root, profileId, 'renderHome');
Screens.kidAllVideos  = async (root, { profileId }) => kidScreen(root, profileId, 'renderAllVideos');
Screens.kidSearch     = async (root, { profileId }) => kidScreen(root, profileId, 'renderSearch');
Screens.kidChannel    = async (root, { profileId, channelId }) =>
  kidScreen(root, profileId, 'renderChannel', channelId);
Screens.kidMe         = async (root, { profileId }) => kidScreen(root, profileId, 'renderMe');
Screens.kidUpNext     = async (root, params) => {
  const profile = (await data.fetchProfiles()).find(x => x.id === params.profileId);
  if (!profile) return go('profileSelect');
  await kid.renderUpNext(root, profile, params, go);
};

async function kidScreen(root, profileId, method, extraArg) {
  const profile = (await data.fetchProfiles()).find(x => x.id === profileId);
  if (!profile) return go('profileSelect');
  if (extraArg !== undefined) await kid[method](root, profile, extraArg, go);
  else await kid[method](root, profile, go);
}

// --- Video Player ---
// On video end: if the Show Up Next setting is on AND we know the
// video's channel, route to the Up Next screen; otherwise fall back to
// the caller's returnTo (or kidHome). The back button always uses
// returnTo — Up Next is only for natural end-of-video transitions.
let ytPlayer = null;
Screens.videoPlayer = async (root, { profileId, videoId, title, returnTo, channelId }) => {
  const settings = await data.fetchPublicSettings().catch(() => ({}));
  const showUpNext = settings.show_up_next !== false;

  const goHome = () => {
    if (returnTo && returnTo.screen) go(returnTo.screen, returnTo.params || {});
    else go('kidHome', { profileId });
  };
  const goBack = () => { destroyPlayer(ytPlayer); ytPlayer = null; goHome(); };
  const onEnded = () => {
    destroyPlayer(ytPlayer); ytPlayer = null;
    if (showUpNext && channelId) {
      go('kidUpNext', { profileId, channelId, watchedVideoId: videoId, returnTo });
    } else {
      goHome();
    }
  };

  const wrap = h('div', { class: 'player-screen' });
  wrap.appendChild(h('div', { class: 'player-topbar' },
    h('button', { class: 'back-btn', onclick: goBack, html: icon(ICONS.back) }),
    h('div', { class: 'title' }, title || 'Video')));
  const frameWrap = h('div', { class: 'player-frame-wrap' });
  frameWrap.appendChild(h('div', { id: 'yt-player' }));
  wrap.appendChild(frameWrap);
  root.appendChild(wrap);
  destroyPlayer(ytPlayer);
  ytPlayer = await createPlayer('yt-player', videoId, { onEnded });
};

// --- Parent PIN (dark, iOS style) ---
Screens.parentPin = (root, params = {}) => {
  const wrap = h('div', { class: 'p-app pin' });
  root.appendChild(wrap);
  root.appendChild(h('button', {
    class: 'k-back-fab',
    onclick: () => go('profileSelect'),
    'aria-label': 'Back',
    html: icon(ICONS.back)
  }));

  const display = h('div', { class: 'k-pin-display' });
  let pin = '';
  const draw = () => {
    display.innerHTML = '';
    for (let i = 0; i < 4; i++) display.appendChild(h('div', { class: 'k-pin-dot' + (i < pin.length ? ' filled' : '') }));
  };
  const fail = () => { pin = ''; draw(); display.classList.add('k-pin-shake'); setTimeout(() => display.classList.remove('k-pin-shake'), 400); };
  const submit = async () => {
    if (pin.length !== 4) return;
    writer.setParentPin(pin);
    try {
      await writer.verifyParentPin();
      if (params.nextScreen) go(params.nextScreen, params.nextParams || {});
      else go('parentHome');
    } catch (e) {
      if (e.status === 401 && e.retryAfter) {
        const mins = Math.ceil(Number(e.retryAfter) / 60);
        toast(`Too many wrong tries — locked for ${mins} min`, 3500);
      } else toast('Wrong code');
      fail();
    }
  };
  const numpad = h('div', { class: 'k-numpad' });
  const press = (d) => { if (pin.length < 4) { pin += d; draw(); if (pin.length === 4) setTimeout(submit, 120); } };
  for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = ''; draw(); } }, 'Clear'));
  numpad.appendChild(h('button', { type: 'button', onclick: () => press('0') }, '0'));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = pin.slice(0, -1); draw(); }, html: '⌫' }));
  draw();

  wrap.append(
    h('div', { class: 'p-pin-title' }, 'Parent Mode'),
    h('div', { class: 'p-pin-sub' }, 'Enter your parent code'),
    display,
    numpad
  );
};

// --- Parent screens (delegated to parent.js) ---
Screens.parentHome      = async (root) => parent.renderParentHome(root, go);
Screens.parentKids      = async (root) => parent.renderKids(root, go);
Screens.parentKidDetail = async (root, { profileId }) => parent.renderKidDetail(root, go, profileId);
Screens.parentChannels  = async (root) => parent.renderChannels(root, go);
Screens.parentVideos    = async (root) => parent.renderVideos(root, go);
Screens.parentBlocklist = async (root) => parent.renderBlocklist(root, go);
Screens.parentSettings  = async (root) => parent.renderSettings(root, go);

// ---------- Bootstrap ----------
go('profileSelect');
