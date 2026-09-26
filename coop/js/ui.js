// ------------------------------------------------------------------------
// coop/js/ui.js
//
// Screens + rendering. Ported from the original single-file kids-videos
// app. All state is fetched from Supabase (via data.js) or written via
// parent-write (via writer.js). This file never talks to the DB or the
// YouTube API directly.
//
// The user has flagged this file as a placeholder — the look and screens
// are expected to change. The data/writer/blocklist/youtube modules should
// stay stable through those redesigns.
// ------------------------------------------------------------------------

import { AVATAR_META, avatarSvg, KID_COLORS, DEFAULT_AVATAR_ID, PACKS } from './avatars.js';
import * as data from './data.js';
import * as writer from './writer.js';
import { createPlayer, destroyPlayer } from './youtube.js';
import { h, icon, ICONS, toast, confirmDialog, loadingBlock } from './dom.js';
import * as kid from './kid.js';

// Preset accent pairs for the kid theme picker. Extendable — the parent
// can still type an arbitrary hex + pick a text color. Ordering keeps
// the two current kids' defaults first.
const ACCENT_PRESETS = [
  { name: 'Sage',    accent: '#A9D3BE', onAccent: '#14231C' },
  { name: 'Sky',     accent: '#9CC8E8', onAccent: '#0F1E2A' },
  { name: 'Peach',   accent: '#F5C6A5', onAccent: '#3A200F' },
  { name: 'Rose',    accent: '#F0B5C4', onAccent: '#3A1421' },
  { name: 'Lilac',   accent: '#C6B8E5', onAccent: '#241A3D' },
  { name: 'Mint',    accent: '#B7E3D6', onAccent: '#0F2A22' },
  { name: 'Butter',  accent: '#F3DFA2', onAccent: '#3A2F0A' },
  { name: 'Coral',   accent: '#F2A79B', onAccent: '#3A160E' }
];

// Preview modal shown between `resolve_channel` and `add_channel`. Handles
// alone aren't safe — @-handles can point at lookalikes — so the parent
// eyeballs title, custom URL, subscriber count, and the uploads probe
// before we commit.
function confirmChannelAdd(channel, onConfirm) {
  const subs = channel.subscribers != null ? channel.subscribers.toLocaleString() : '—';
  const modal = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === modal) modal.remove(); } });
  modal.appendChild(
    h('div', { class: 'modal' },
      h('h3', {}, 'Add this channel?'),
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' } },
        channel.thumbnail_url ? h('img', { src: channel.thumbnail_url, style: { width: '48px', height: '48px', borderRadius: '50%' } }) : null,
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: '700', fontSize: '18px', wordBreak: 'break-word' } }, channel.title || '(no title)'),
          h('div', { style: { fontSize: '13px', color: 'var(--text-muted)' } }, channel.custom_url || 'no custom URL')
        )
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '14px', marginBottom: '16px' } },
        h('div', { style: { color: 'var(--text-muted)' } }, 'ID'),
        h('div', { style: { fontFamily: 'monospace' } }, channel.id),
        h('div', { style: { color: 'var(--text-muted)' } }, 'Subscribers'),
        h('div', {}, subs),
        h('div', { style: { color: 'var(--text-muted)' } }, 'Country'),
        h('div', {}, channel.country || '—'),
        h('div', { style: { color: 'var(--text-muted)' } }, 'Uploads'),
        h('div', { style: { color: channel.uploads_ok === false ? 'var(--danger)' : 'inherit' } },
          channel.uploads_ok === false ? '⚠ playlist returned 404 — likely no accessible videos' : 'reachable')
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-secondary', style: { flex: 1 }, onclick: () => modal.remove() }, 'Cancel'),
        h('button', { class: 'btn btn-primary', style: { flex: 1 }, onclick: () => { modal.remove(); onConfirm(); } }, 'Add')
      )
    )
  );
  document.body.appendChild(modal);
}

// ---------- numpad ----------

function makePinEntry(opts) {
  const len = opts.length || 4;
  let pin = '';
  const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' } });
  const display = h('div', { class: 'pin-display' });
  function redraw() {
    display.innerHTML = '';
    for (let i = 0; i < len; i++) {
      display.appendChild(h('div', { class: 'pin-dot' + (i < pin.length ? ' filled' : '') }));
    }
  }
  redraw();
  wrap.appendChild(display);
  const numpad = h('div', { class: 'numpad' });
  const press = (d) => {
    if (pin.length < len) { pin += d; redraw(); }
    if (pin.length === len) {
      setTimeout(() => opts.onComplete(pin, () => {
        pin = ''; redraw();
        display.classList.add('pin-error');
        setTimeout(() => display.classList.remove('pin-error'), 400);
      }), 120);
    }
  };
  const backspace = () => { pin = pin.slice(0, -1); redraw(); };
  for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { onclick: () => press(String(n)) }, String(n)));
  numpad.appendChild(h('button', { class: 'numpad-action', onclick: () => { pin = ''; redraw(); } }, 'Clear'));
  numpad.appendChild(h('button', { onclick: () => press('0') }, '0'));
  numpad.appendChild(h('button', { class: 'numpad-action', onclick: backspace, html: '⌫' }));
  wrap.appendChild(numpad);
  return wrap;
}

// ---------- routing ----------

let current = { screen: null, params: {} };
export function go(screen, params = {}) {
  current = { screen, params };
  render().catch(err => {
    console.error(err);
    toast('Error: ' + (err.message || err));
  });
}
function back() {
  const s = current.screen;
  if (['profileEdit', 'contentManage'].includes(s)) go('parentHome');
  else if (['kidHome', 'kidAllVideos', 'kidChannel', 'kidSearch', 'kidPin'].includes(s)) go('profileSelect');
  else if (s === 'parentPin' || s === 'parentHome') go('profileSelect');
  else go('profileSelect');
}

// The kid screens use their own theming (see js/kid.js + .k-app in
// style.css) and don't need the warm --profile-color hooks.
const KID_SCREENS = new Set(['kidHome', 'kidAllVideos', 'kidChannel', 'kidSearch']);

async function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (!current.screen) current.screen = 'profileSelect';

  // Apply per-profile color if we know it
  const pid = current.params.profileId;
  const profile = pid ? (await data.fetchProfiles()).find(p => p.id === pid) : null;
  if (profile) {
    const cdef = KID_COLORS.find(c => c.color === profile.color) || KID_COLORS[0];
    document.documentElement.style.setProperty('--profile-color', cdef.color);
    document.documentElement.style.setProperty('--profile-color-soft', cdef.soft);
  } else {
    document.documentElement.style.setProperty('--profile-color', KID_COLORS[0].color);
    document.documentElement.style.setProperty('--profile-color-soft', KID_COLORS[0].soft);
  }

  const fn = Screens[current.screen];
  if (fn) await fn(app, current.params); else await Screens.profileSelect(app, {});
}

// ============================================================
// SCREENS
// ============================================================
const Screens = {};

// --- Profile Select (dark, kid-themed) ---
Screens.profileSelect = async (root) => {
  const page = h('div', { class: 'k-page centered profile-select' });
  root.appendChild(page);
  page.appendChild(h('div', { style: { color: 'var(--k-fg-muted)' } }, 'Loading…'));

  let profiles;
  try { profiles = await data.fetchProfiles(); }
  catch (e) { page.innerHTML = ''; page.appendChild(h('p', {}, 'Could not load profiles: ' + e.message)); return; }

  // Check each kid's PIN presence in parallel — small N, cheap.
  const pinFlags = await Promise.all(profiles.map(p => data.hasKidPin(p.id).catch(() => false)));

  page.innerHTML = '';
  page.append(h('h1', { class: 'k-profile-select-title' },
    profiles.length ? "Who's watching?" : "Let's add a profile"));

  const grid = h('div', { class: 'k-profile-grid' });
  profiles.forEach((p, i) => {
    const accent = p.accent_color || '#A9D3BE';
    const hasPin = pinFlags[i];
    const tile = h('button', {
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
    );
    grid.appendChild(tile);
  });
  if (!profiles.length) {
    grid.appendChild(h('button', {
      class: 'k-profile-tile',
      style: { '--tile-accent': '#9CC8E8' },
      onclick: () => go('parentPin', { nextScreen: 'profileEdit', nextParams: { profileId: null } })
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

// --- Kid PIN (dark, per-kid accent) ---
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
  function renderDots() {
    pinDisplay.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      pinDisplay.appendChild(h('div', { class: 'k-pin-dot' + (i < pin.length ? ' filled' : '') }));
    }
  }
  function fail() {
    pin = ''; renderDots();
    pinDisplay.classList.add('k-pin-shake');
    setTimeout(() => pinDisplay.classList.remove('k-pin-shake'), 400);
  }
  async function submitIfFull() {
    if (pin.length !== 4) return;
    const ok = await data.verifyKidPin(profileId, pin).catch(() => false);
    if (ok) go('kidHome', { profileId });
    else { toast("That's not the right code"); fail(); }
  }
  const numpad = h('div', { class: 'k-numpad' });
  const press = (d) => { if (pin.length < 4) { pin += d; renderDots(); if (pin.length === 4) setTimeout(submitIfFull, 120); } };
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

async function kidScreen(root, profileId, method, extraArg) {
  const profile = (await data.fetchProfiles()).find(x => x.id === profileId);
  if (!profile) return go('profileSelect');
  if (extraArg !== undefined) await kid[method](root, profile, extraArg, go);
  else await kid[method](root, profile, go);
}

// --- Video Player ---
// Return-to: caller provides { screen, params } via `returnTo`; player's
// back button and onEnded honor it. Falls back to kidHome for older callers.
let ytPlayer = null;
Screens.videoPlayer = async (root, { profileId, videoId, title, returnTo }) => {
  const goBack = () => {
    destroyPlayer(ytPlayer); ytPlayer = null;
    if (returnTo && returnTo.screen) go(returnTo.screen, returnTo.params || {});
    else go('kidHome', { profileId });
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
  ytPlayer = await createPlayer('yt-player', videoId, { onEnded: goBack });
};

// --- Parent PIN ---
Screens.parentPin = (root, params = {}) => {
  const screen = h('div', { class: 'screen screen-centered' });
  screen.append(
    h('button', { class: 'back-btn', style: { position: 'absolute', top: '20px', left: '20px' }, onclick: () => go('profileSelect'), html: icon(ICONS.back) }),
    h('div', { style: { fontSize: '56px', marginBottom: '12px' } }, '🔒'),
    h('h2', { style: { marginBottom: '8px' } }, 'Parent Mode'),
    h('p', { style: { color: 'var(--text-muted)', marginBottom: '28px' } }, 'Enter your Parent Code'),
    makePinEntry({ length: 4, onComplete: async (pin, onFail) => {
      writer.setParentPin(pin);
      try {
        await writer.verifyParentPin();
        if (params.nextScreen) go(params.nextScreen, params.nextParams || {});
        else go('parentHome');
      } catch (e) {
        if (e.status === 401 && e.retryAfter) {
          const mins = Math.ceil(Number(e.retryAfter) / 60);
          toast(`Too many wrong tries — locked for ${mins} min`, 3500);
        } else {
          toast('Wrong code');
        }
        onFail();
      }
    }})
  );
  root.appendChild(screen);
};

// --- Parent Home ---
Screens.parentHome = async (root) => {
  const screen = h('div', { class: 'screen screen-scroll' });
  screen.append(
    h('div', { class: 'parent-header' },
      h('button', { class: 'back-btn', onclick: () => go('profileSelect'), html: icon(ICONS.back) }),
      h('div', { class: 'title' }, 'Parent Settings')
    )
  );
  root.appendChild(screen);
  const contentEl = h('div');
  screen.appendChild(contentEl);
  contentEl.appendChild(loadingBlock());

  let profiles, settings, blocklist;
  try {
    [profiles, settings, blocklist] = await Promise.all([
      data.fetchProfiles(), data.fetchPublicSettings(), data.fetchBlocklist()
    ]);
  } catch (e) { contentEl.innerHTML = ''; contentEl.appendChild(h('p', {}, 'Error: ' + e.message)); return; }
  contentEl.innerHTML = '';

  // Profiles card
  const profilesCard = h('div', { class: 'card' },
    h('div', { class: 'card-header' },
      h('h3', {}, 'Kid Profiles'),
      h('button', { class: 'btn btn-primary', onclick: () => go('profileEdit', { profileId: null }), html: icon(ICONS.plus) + ' Add' })),
    ...(profiles.length ? profiles.map(p => {
      const cdef = KID_COLORS.find(c => c.color === p.color) || KID_COLORS[0];
      return h('div', { class: 'list-row' },
        h('div', { class: 'avatar-sm', style: { background: cdef.soft, borderColor: cdef.color } },
          h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })),
        h('div', { class: 'info' }, h('div', { class: 'primary' }, p.name)),
        h('button', { class: 'btn btn-secondary', onclick: () => go('contentManage', { profileId: p.id }) }, 'Content'),
        h('button', { class: 'btn btn-secondary btn-icon', onclick: () => go('profileEdit', { profileId: p.id }), html: icon(ICONS.gear) })
      );
    }) : [h('p', { style: { color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' } }, 'No profiles yet. Add one to get started.')])
  );
  contentEl.appendChild(profilesCard);

  // Shorts toggle
  const shortsCard = h('div', { class: 'card' },
    h('h3', { style: { marginBottom: '8px' } }, 'YouTube Shorts'),
    h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' } },
      settings.hide_shorts ? 'Shorts are hidden from feeds.' : 'Shorts are visible in feeds.'),
    h('button', { class: 'btn btn-secondary', onclick: async (ev) => {
      const target = !settings.hide_shorts;
      ev.currentTarget.disabled = true;
      try { await writer.setHideShorts(target); toast('Saved'); go('parentHome'); }
      catch (e) { toast('Error: ' + e.message); ev.currentTarget.disabled = false; }
    }}, settings.hide_shorts ? 'Show Shorts' : 'Hide Shorts')
  );
  contentEl.appendChild(shortsCard);

  // Blocklist
  const blocklistCard = h('div', { class: 'card' },
    h('h3', { style: { marginBottom: '8px' } }, 'Word Blocklist'),
    h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' } },
      'Video titles containing any of these words as a whole word are hidden. Case-insensitive.'),
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
      h('input', { class: 'input', id: 'blk-input', placeholder: 'e.g. Milo' }),
      h('button', { class: 'btn btn-primary', onclick: async () => {
        const val = document.getElementById('blk-input').value.trim();
        if (!val) return;
        try { await writer.addBlocklistKeyword(val); toast('Added'); go('parentHome'); }
        catch (e) { toast('Error: ' + e.message); }
      }}, 'Add')),
    ...(blocklist.length ? blocklist.map(k =>
      h('div', { class: 'list-row' },
        h('div', { class: 'info' }, h('div', { class: 'primary' }, k.keyword)),
        h('button', { class: 'btn btn-danger btn-icon', onclick: async () => {
          try { await writer.removeBlocklistKeyword(k.keyword); toast('Removed'); go('parentHome'); }
          catch (e) { toast('Error: ' + e.message); }
        }, html: icon(ICONS.trash) })
      )
    ) : [h('p', { style: { color: 'var(--text-muted)', textAlign: 'center', padding: '8px' } }, 'Empty.')])
  );
  contentEl.appendChild(blocklistCard);

  // Change parent PIN
  contentEl.appendChild(h('div', { class: 'card' },
    h('h3', { style: { marginBottom: '12px' } }, 'Parent Code'),
    h('button', { class: 'btn btn-secondary', onclick: () => changeParentPin() }, 'Change Parent Code')
  ));
};

function changeParentPin() {
  let newPin = '';
  const modal = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === modal) modal.remove(); } });
  const inner = h('div', { class: 'modal' });
  modal.appendChild(inner);
  function stage1() {
    inner.innerHTML = '';
    inner.append(
      h('h3', {}, 'New Parent Code'),
      h('p', { style: { color: 'var(--text-muted)', marginBottom: '20px' } }, 'Enter a new 4-digit code'),
      makePinEntry({ length: 4, onComplete: (pin) => { newPin = pin; stage2(); } }),
      h('button', { class: 'btn btn-ghost', style: { marginTop: '20px' }, onclick: () => modal.remove() }, 'Cancel')
    );
  }
  function stage2() {
    inner.innerHTML = '';
    inner.append(
      h('h3', {}, 'Confirm'),
      h('p', { style: { color: 'var(--text-muted)', marginBottom: '20px' } }, 'Enter it again'),
      makePinEntry({ length: 4, onComplete: async (pin, onFail) => {
        if (pin !== newPin) { toast("Didn't match"); onFail(); return; }
        try {
          await writer.setParentPinOp(pin);
          writer.setParentPin(pin);  // update cached PIN so future ops still work
          modal.remove(); toast('Parent code updated');
        } catch (e) { toast('Error: ' + e.message); onFail(); }
      }}),
      h('button', { class: 'btn btn-ghost', style: { marginTop: '20px' }, onclick: () => modal.remove() }, 'Cancel')
    );
  }
  stage1();
  document.body.appendChild(modal);
}

// --- Profile Edit / Add ---
Screens.profileEdit = async (root, { profileId }) => {
  const profiles = await data.fetchProfiles();
  const p = profileId ? profiles.find(x => x.id === profileId) : null;
  const isNew = !p;
  const draft = p
    ? { ...p, pin: '' }   // never prefill kid PIN — anon can't see it
    : {
        name: '', avatar: DEFAULT_AVATAR_ID, color: KID_COLORS[0].color,
        pin: '', sort_order: (profiles.length || 0),
        accent_color: ACCENT_PRESETS[0].accent, on_accent_text: ACCENT_PRESETS[0].onAccent,
        nav_style: 'sidebar', tile_size: 'regular'
      };
  const hasPin = p ? await data.hasKidPin(p.id).catch(() => false) : false;

  const screen = h('div', { class: 'screen screen-scroll' });
  screen.append(
    h('div', { class: 'parent-header' },
      h('button', { class: 'back-btn', onclick: () => go('parentHome'), html: icon(ICONS.back) }),
      h('div', { class: 'title' }, isNew ? 'New Profile' : 'Edit Profile'))
  );

  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'field' },
    h('label', {}, 'Name'),
    h('input', { class: 'input', type: 'text', id: 'edit-name', value: draft.name, placeholder: "Kid's name", oninput: (e) => draft.name = e.target.value })));

  card.appendChild(h('div', { class: 'field' }, h('label', {}, 'Avatar')));
  // Which pack to show. Default: pack of the current avatar; else animals.
  let currentPack = (() => {
    const spec = draft.avatar || DEFAULT_AVATAR_ID;
    const idx = spec.indexOf(':');
    return idx >= 0 ? spec.slice(0, idx) : 'animals';
  })();
  const packTabs = h('div', { class: 'pack-tabs' });
  const packGrid = h('div', { class: 'pack-grid' });
  function renderPackTabs() {
    packTabs.innerHTML = '';
    for (const p of PACKS) {
      packTabs.appendChild(h('button', {
        type: 'button',
        class: currentPack === p.id ? 'active' : '',
        onclick: () => { currentPack = p.id; renderPackTabs(); renderPackGrid(); }
      }, p.label));
    }
  }
  function renderPackGrid() {
    packGrid.innerHTML = '';
    const pack = PACKS.find(x => x.id === currentPack) || PACKS[0];
    for (const a of pack.avatars) {
      const spec = `${pack.id}:${a.id}`;
      packGrid.appendChild(h('button', {
        type: 'button',
        class: 'avatar-chip' + (spec === draft.avatar ? ' selected' : ''),
        title: a.label || a.id,
        onclick: () => { draft.avatar = spec; renderPackGrid(); }
      }, h('div', { class: 'avatar-img', html: avatarSvg(spec) })));
    }
  }
  renderPackTabs();
  renderPackGrid();
  card.appendChild(packTabs);
  card.appendChild(packGrid);

  card.appendChild(h('div', { class: 'field', style: { marginTop: '16px' } }, h('label', {}, 'Color')));
  const colorGrid = h('div', { class: 'color-grid' });
  function renderColors() {
    colorGrid.innerHTML = '';
    for (const c of KID_COLORS) {
      colorGrid.appendChild(h('button', {
        class: 'color-chip' + (c.color === draft.color ? ' selected' : ''),
        style: { background: c.color }, title: c.name,
        onclick: () => { draft.color = c.color; renderColors(); }
      }));
    }
  }
  renderColors();
  card.appendChild(colorGrid);

  // Kid theme (accent + on-accent) — swatch row + custom-hex escape hatch.
  card.appendChild(h('div', { class: 'field', style: { marginTop: '20px' } },
    h('label', {}, 'Kid theme accent'),
    h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' } },
      'Accent color used in the kid view for the Play button, "New from" label, and selected nav item.')));
  const accentRow = h('div', { class: 'color-grid' });
  function renderAccents() {
    accentRow.innerHTML = '';
    for (const preset of ACCENT_PRESETS) {
      const selected = preset.accent.toLowerCase() === (draft.accent_color || '').toLowerCase();
      accentRow.appendChild(h('button', {
        class: 'color-chip' + (selected ? ' selected' : ''),
        style: { background: preset.accent }, title: preset.name,
        onclick: () => {
          draft.accent_color = preset.accent;
          draft.on_accent_text = preset.onAccent;
          renderAccents();
          const hex = document.getElementById('edit-accent-hex');
          if (hex) hex.value = preset.accent;
        }
      }));
    }
  }
  renderAccents();
  card.appendChild(accentRow);
  card.appendChild(h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
    h('input', {
      class: 'input', id: 'edit-accent-hex', type: 'text',
      value: draft.accent_color || '', placeholder: '#RRGGBB',
      style: { maxWidth: '160px' },
      oninput: (e) => {
        const v = e.target.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) draft.accent_color = v;
      }
    }),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
      // Toggle on-accent between near-black and off-white.
      draft.on_accent_text = draft.on_accent_text === '#EAF0EE' ? '#14231C' : '#EAF0EE';
      toast('Text-on-accent: ' + draft.on_accent_text);
    }}, 'Flip text color')
  ));

  // Nav style
  card.appendChild(h('div', { class: 'field', style: { marginTop: '20px' } }, h('label', {}, 'Navigation')));
  const navSeg = h('div', { class: 'segmented', style: { display: 'flex', width: '100%' } });
  function renderNav() {
    navSeg.innerHTML = '';
    for (const opt of [['sidebar', 'Sidebar'], ['rail', 'Rail']]) {
      const [val, label] = opt;
      navSeg.appendChild(h('button', {
        type: 'button',
        class: draft.nav_style === val ? 'active' : '',
        onclick: () => { draft.nav_style = val; renderNav(); }
      }, label));
    }
  }
  renderNav();
  card.appendChild(navSeg);

  // Tile size
  card.appendChild(h('div', { class: 'field', style: { marginTop: '20px' } }, h('label', {}, 'Tile size')));
  const tileSeg = h('div', { class: 'segmented', style: { display: 'flex', width: '100%' } });
  function renderTile() {
    tileSeg.innerHTML = '';
    for (const opt of [['regular', 'Regular'], ['large', 'Large']]) {
      const [val, label] = opt;
      tileSeg.appendChild(h('button', {
        type: 'button',
        class: draft.tile_size === val ? 'active' : '',
        onclick: () => { draft.tile_size = val; renderTile(); }
      }, label));
    }
  }
  renderTile();
  card.appendChild(tileSeg);

  card.appendChild(h('div', { class: 'field', style: { marginTop: '20px' } },
    h('label', {}, hasPin ? "Kid's Secret Code — set" : "Kid's Secret Code (optional)"),
    h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' } },
      hasPin ? 'A PIN is set. Type 4 digits to change it, or clear it.' : 'A 4-digit code only this kid knows. Leave blank to skip.'),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('input', { class: 'input', id: 'edit-pin', type: 'tel', inputmode: 'numeric', maxlength: '4', pattern: '[0-9]*', placeholder: '4 digits',
        oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); draft.pin = e.target.value; }
      }),
      hasPin ? h('button', { class: 'btn btn-ghost', onclick: async () => {
        try { await writer.clearKidPin(p.id); toast('PIN cleared'); go('profileEdit', { profileId: p.id }); }
        catch (e) { toast('Error: ' + e.message); }
      }}, 'Clear PIN') : null
    )
  ));
  screen.appendChild(card);

  const actions = h('div', { class: 'btn-row', style: { marginTop: '8px' } });
  actions.appendChild(h('button', { class: 'btn btn-primary', style: { flex: 1 }, onclick: async () => {
    if (!draft.name.trim()) { toast('Please enter a name'); return; }
    if (draft.pin && draft.pin.length !== 4) { toast('PIN must be 4 digits (or empty)'); return; }
    // Basic hex sanity on client — server enforces the same via CHECK constraints.
    const HEX = /^#[0-9A-Fa-f]{6}$/;
    if (!HEX.test(draft.accent_color || '')) { toast('Accent color must be #RRGGBB'); return; }
    if (!HEX.test(draft.on_accent_text || '')) { toast('On-accent text color must be #RRGGBB'); return; }
    try {
      let profileIdOut;
      if (isNew) {
        const res = await writer.addProfile({
          name: draft.name.trim(), avatar: draft.avatar, color: draft.color, sort_order: draft.sort_order
        });
        profileIdOut = res.profile?.id;
        // add_profile op doesn't take theme fields — apply via edit_profile.
        await writer.editProfile({
          profile_id: profileIdOut,
          accent_color: draft.accent_color, on_accent_text: draft.on_accent_text,
          nav_style: draft.nav_style, tile_size: draft.tile_size
        });
      } else {
        await writer.editProfile({
          profile_id: p.id,
          name: draft.name.trim(), avatar: draft.avatar, color: draft.color,
          accent_color: draft.accent_color, on_accent_text: draft.on_accent_text,
          nav_style: draft.nav_style, tile_size: draft.tile_size
        });
        profileIdOut = p.id;
      }
      if (draft.pin) await writer.setKidPin(profileIdOut, draft.pin);
      toast(isNew ? 'Profile created' : 'Saved');
      if (isNew) go('contentManage', { profileId: profileIdOut });
      else go('parentHome');
    } catch (e) { toast('Error: ' + e.message); }
  }}, isNew ? 'Create Profile' : 'Save'));
  if (!isNew) {
    actions.appendChild(h('button', { class: 'btn btn-danger btn-icon', onclick: () => {
      confirmDialog('Delete profile?', `This removes ${p.name}. Approved channels and videos stay in the library and can be assigned to other kids.`, async () => {
        try { await writer.deleteProfile(p.id); toast('Deleted'); go('parentHome'); }
        catch (e) { toast('Error: ' + e.message); }
      });
    }, html: icon(ICONS.trash) }));
  }
  screen.appendChild(actions);
  root.appendChild(screen);
};

// --- Content Manage (per profile) ---
Screens.contentManage = async (root, { profileId }) => {
  const profiles = await data.fetchProfiles();
  const p = profiles.find(x => x.id === profileId);
  if (!p) return go('parentHome');
  let tab = 'channels';

  const screen = h('div', { class: 'screen screen-scroll' });
  screen.appendChild(h('div', { class: 'parent-header' },
    h('button', { class: 'back-btn', onclick: () => go('parentHome'), html: icon(ICONS.back) }),
    h('div', { class: 'title' }, `${p.name}'s Content`)));
  const tabsEl = h('div', { class: 'tabs' });
  const contentEl = h('div');
  screen.appendChild(tabsEl);
  screen.appendChild(contentEl);
  root.appendChild(screen);

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const t of ['channels', 'videos']) {
      const label = { channels: 'Channels', videos: 'Videos' }[t];
      tabsEl.appendChild(h('button', {
        class: 'tab' + (tab === t ? ' active' : ''),
        onclick: () => { tab = t; renderTabs(); renderContent(); }
      }, label));
    }
  }
  renderTabs();

  async function renderContent() {
    contentEl.innerHTML = '';
    contentEl.appendChild(loadingBlock());
    if (tab === 'channels') await renderChannels();
    if (tab === 'videos') await renderVideos();
  }

  async function renderChannels() {
    const channels = await data.fetchChannelsForProfile(profileId).catch(() => []);
    contentEl.innerHTML = '';
    contentEl.appendChild(h('div', { class: 'card' },
      h('h3', { style: { marginBottom: '8px' } }, 'Add a Channel'),
      h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' } },
        'Paste a channel URL or @handle. Approved for this profile.'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('input', { class: 'input', id: 'add-chan-input', placeholder: '@handle, UC… ID, or channel URL' }),
        h('button', { class: 'btn btn-primary', onclick: async (ev) => {
          const input = document.getElementById('add-chan-input');
          const val = input.value.trim();
          if (!val) return;
          const btn = ev.currentTarget;
          btn.disabled = true; btn.textContent = '…';
          try {
            const { channel } = await writer.resolveChannel(val);
            confirmChannelAdd(channel, async () => {
              try {
                await writer.addChannel(channel.id, [profileId]);
                toast(`Added ${channel.title}`);
                input.value = ''; renderContent();
              } catch (e) { toast('Error: ' + e.message, 3500); }
            });
          } catch (e) { toast('Error: ' + e.message, 3500); }
          finally { btn.disabled = false; btn.textContent = 'Add'; }
        }}, 'Add'))
    ));
    if (!channels.length) {
      contentEl.appendChild(h('p', { style: { color: 'var(--text-muted)', textAlign: 'center', padding: '20px' } }, 'No channels approved yet.'));
      return;
    }
    for (const ch of channels) {
      contentEl.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'avatar-sm', style: { background: `center/cover url(${ch.thumbnail_url || ''})` } }),
        h('div', { class: 'info' }, h('div', { class: 'primary' }, ch.title), h('div', { class: 'secondary' }, ch.handle || ch.id)),
        h('button', { class: 'btn btn-danger btn-icon', onclick: () => {
          confirmDialog('Remove channel?',
            `Remove ${ch.title} everywhere and delete its synced videos? One-off approved videos stay.`,
            async () => {
              try { await writer.removeChannel(ch.id); toast('Removed'); renderContent(); }
              catch (e) { toast('Error: ' + e.message); }
            });
        }, html: icon(ICONS.trash) })));
    }
  }

  async function renderVideos() {
    // fetch one-off approvals for this profile (the writer flow adds them via join)
    const oneoffIds = await data.fetchOneoffVideoIdsForProfile(profileId).catch(() => new Set());
    contentEl.innerHTML = '';
    contentEl.appendChild(h('div', { class: 'card' },
      h('h3', { style: { marginBottom: '8px' } }, 'Add Videos'),
      h('p', { style: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' } },
        'Paste one YouTube URL at a time. Approved for this profile.'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('input', { class: 'input', id: 'add-vid-input', placeholder: 'https://youtube.com/watch?v=...' }),
        h('button', { class: 'btn btn-primary', onclick: async (ev) => {
          const input = document.getElementById('add-vid-input');
          const val = input.value.trim();
          if (!val) return;
          const btn = ev.currentTarget;
          btn.disabled = true; btn.textContent = '…';
          try {
            await writer.addOneoffVideo(val, [profileId]);
            input.value = ''; toast('Added'); renderContent();
          } catch (e) { toast('Error: ' + e.message, 3500); }
          finally { btn.disabled = false; btn.textContent = 'Add'; }
        }}, 'Add'))));
    if (!oneoffIds.size) {
      contentEl.appendChild(h('p', { style: { color: 'var(--text-muted)', textAlign: 'center', padding: '20px' } }, 'No individual videos approved yet.'));
      return;
    }
    // For each one-off, show a row (query full row from coop_videos)
    const { data: rows } = await data.supabase.from('coop_videos')
      .select('id, title, thumbnail_url, channel_title')
      .in('id', [...oneoffIds]);
    for (const v of rows || []) {
      contentEl.appendChild(h('div', { class: 'list-row' },
        h('div', { class: 'avatar-sm', style: { background: `center/cover url(${v.thumbnail_url || ''})`, width: '64px', height: '36px', borderRadius: '8px' } }),
        h('div', { class: 'info' },
          h('div', { class: 'primary', style: { display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, v.title),
          h('div', { class: 'secondary' }, v.channel_title || '')),
        h('button', { class: 'btn btn-danger btn-icon', onclick: async () => {
          try { await writer.removeOneoffVideo(v.id); toast('Removed'); renderContent(); }
          catch (e) { toast('Error: ' + e.message); }
        }, html: icon(ICONS.trash) })));
    }
  }

  renderContent();
};

// ---------- Bootstrap ----------
go('profileSelect');
