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

import { AVATAR_META, avatarSvg, KID_COLORS, DEFAULT_AVATAR_ID } from './avatars.js';
import * as data from './data.js';
import * as writer from './writer.js';
import { createPlayer, destroyPlayer } from './youtube.js';

// ---------- tiny helpers ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
    else if (k.startsWith('on') && typeof attrs[k] === 'function') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === 'html') el.innerHTML = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}
function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
const ICONS = {
  back:  '<path d="M15 18l-6-6 6-6"/>',
  home:  '<path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2z"/>',
  lock:  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus:  '<path d="M12 5v14M5 12h14"/>',
  gear:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  play:  '<polygon points="5 3 19 12 5 21"/>'
};
function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function confirmDialog(title, msg, onYes) {
  const modal = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === modal) modal.remove(); } },
    h('div', { class: 'modal' },
      h('h3', {}, title),
      h('p', { style: { marginBottom: '20px', color: 'var(--text-muted)' } }, msg),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-secondary', style: { flex: 1 }, onclick: () => modal.remove() }, 'Cancel'),
        h('button', { class: 'btn btn-danger', style: { flex: 1 }, onclick: () => { modal.remove(); onYes(); } }, 'Yes')
      )
    )
  );
  document.body.appendChild(modal);
}
function loadingBlock(msg = 'Loading…') {
  return h('div', { class: 'empty-state' }, h('div', { class: 'big-emoji' }, '⏳'), h('p', {}, msg));
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
  else if (['kidHome', 'kidPin'].includes(s)) go('profileSelect');
  else if (s === 'parentPin' || s === 'parentHome') go('profileSelect');
  else go('profileSelect');
}

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

// --- Profile Select ---
Screens.profileSelect = async (root) => {
  const screen = h('div', { class: 'screen screen-scroll' });
  root.appendChild(screen);
  screen.appendChild(loadingBlock());

  let profiles;
  try { profiles = await data.fetchProfiles(); }
  catch (e) { screen.innerHTML = ''; screen.appendChild(h('p', {}, 'Could not load profiles: ' + e.message)); return; }

  screen.innerHTML = '';
  screen.append(h('h1', { class: 'profile-select-title' }, profiles.length ? "Who's watching?" : "Let's add a profile"));
  const grid = h('div', { class: 'profile-grid' });
  for (const p of profiles) {
    const cdef = KID_COLORS.find(c => c.color === p.color) || KID_COLORS[0];
    const tile = h('button', { class: 'profile-tile', onclick: async () => {
      const hasPin = await data.hasKidPin(p.id).catch(() => false);
      if (hasPin) go('kidPin', { profileId: p.id });
      else go('kidHome', { profileId: p.id });
    }});
    tile.append(
      h('div', { class: 'profile-avatar', style: { background: cdef.soft, borderColor: cdef.color } },
        h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })),
      h('div', { class: 'profile-name' }, p.name)
    );
    grid.appendChild(tile);
  }
  if (!profiles.length) {
    grid.appendChild(h('button', {
      class: 'add-profile-tile',
      onclick: () => go('parentPin', { nextScreen: 'profileEdit', nextParams: { profileId: null } })
    }, h('div', { style: { fontSize: '40px' } }, '+'), h('div', {}, 'Add a profile')));
  }
  screen.appendChild(grid);
  root.appendChild(h('button', {
    class: 'parent-mode-btn', onclick: () => go('parentPin'), title: 'Parent Mode', html: icon(ICONS.lock)
  }));
};

// --- Kid PIN ---
Screens.kidPin = async (root, { profileId }) => {
  const profiles = await data.fetchProfiles();
  const p = profiles.find(x => x.id === profileId);
  if (!p) return go('profileSelect');
  const screen = h('div', { class: 'screen screen-centered' });
  const cdef = KID_COLORS.find(c => c.color === p.color) || KID_COLORS[0];
  screen.append(
    h('button', { class: 'back-btn', style: { position: 'absolute', top: '20px', left: '20px' }, onclick: () => go('profileSelect'), html: icon(ICONS.back) }),
    h('div', { class: 'profile-avatar', style: { background: cdef.soft, borderColor: cdef.color, marginBottom: '16px' } },
      h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })),
    h('h2', { style: { marginBottom: '8px' } }, `Hi, ${p.name}!`),
    h('p', { style: { color: 'var(--text-muted)', marginBottom: '28px' } }, 'Enter your secret code'),
    makePinEntry({ length: 4, onComplete: async (pin, onFail) => {
      const ok = await data.verifyKidPin(profileId, pin).catch(() => false);
      if (ok) go('kidHome', { profileId });
      else { toast("That's not the right code"); onFail(); }
    }})
  );
  root.appendChild(screen);
};

// --- Kid Home ---
Screens.kidHome = async (root, { profileId }) => {
  const profiles = await data.fetchProfiles();
  const p = profiles.find(x => x.id === profileId);
  if (!p) return go('profileSelect');

  const cdef = KID_COLORS.find(c => c.color === p.color) || KID_COLORS[0];
  const screen = h('div', { class: 'screen screen-scroll' });
  screen.append(
    h('div', { class: 'kid-header' },
      h('div', { class: 'avatar', style: { background: cdef.soft, borderColor: cdef.color } },
        h('div', { class: 'avatar-img', html: avatarSvg(p.avatar) })),
      h('div', { class: 'greeting' },
        h('div', { class: 'hi' }, 'HI THERE'),
        h('div', { class: 'name' }, p.name)
      ),
      h('button', { class: 'home-btn', onclick: () => go('profileSelect'), title: 'Home', html: icon(ICONS.home) })
    )
  );
  const contentEl = h('div');
  screen.appendChild(contentEl);
  root.appendChild(screen);
  contentEl.appendChild(loadingBlock());

  let videos;
  try { videos = await data.fetchFeedForProfile(profileId); }
  catch (e) { contentEl.innerHTML = ''; contentEl.appendChild(h('p', {}, 'Error: ' + e.message)); return; }

  contentEl.innerHTML = '';
  if (!videos.length) {
    contentEl.appendChild(h('div', { class: 'empty-state' },
      h('div', { class: 'big-emoji' }, '🌱'),
      h('h3', { style: { marginBottom: '8px' } }, 'No videos yet'),
      h('p', {}, 'Ask a grown-up to add some videos for you.')));
    return;
  }
  const grid = h('div', { class: 'video-grid' });
  for (const v of videos) {
    grid.appendChild(h('button', {
      class: 'video-tile',
      onclick: () => go('videoPlayer', { profileId, videoId: v.id, title: v.title })
    },
      h('div', { class: 'video-thumb', style: { backgroundImage: `url(${v.thumbnail_url})` } },
        h('div', { class: 'video-play-icon', html: icon(ICONS.play) })
      ),
      h('div', { class: 'video-info' }, h('div', { class: 'video-title' }, v.title))
    ));
  }
  contentEl.appendChild(grid);
};

// --- Video Player ---
let ytPlayer = null;
Screens.videoPlayer = async (root, { profileId, videoId, title }) => {
  const wrap = h('div', { class: 'player-screen' });
  wrap.appendChild(h('div', { class: 'player-topbar' },
    h('button', { class: 'back-btn', onclick: () => { destroyPlayer(ytPlayer); ytPlayer = null; go('kidHome', { profileId }); }, html: icon(ICONS.back) }),
    h('div', { class: 'title' }, title || 'Video')));
  const frameWrap = h('div', { class: 'player-frame-wrap' });
  frameWrap.appendChild(h('div', { id: 'yt-player' }));
  wrap.appendChild(frameWrap);
  root.appendChild(wrap);
  destroyPlayer(ytPlayer);
  ytPlayer = await createPlayer('yt-player', videoId, {
    onEnded: () => { destroyPlayer(ytPlayer); ytPlayer = null; go('kidHome', { profileId }); }
  });
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
    : { name: '', avatar: DEFAULT_AVATAR_ID, color: KID_COLORS[0].color, pin: '', sort_order: (profiles.length || 0) };
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
  const avatarGrid = h('div', { class: 'avatar-grid' });
  function renderAvatars() {
    avatarGrid.innerHTML = '';
    for (const id of AVATAR_META) {
      avatarGrid.appendChild(h('button', {
        class: 'avatar-chip' + (id === draft.avatar ? ' selected' : ''),
        onclick: () => { draft.avatar = id; renderAvatars(); }
      }, h('div', { class: 'avatar-img', html: avatarSvg(id) })));
    }
  }
  renderAvatars();
  card.appendChild(avatarGrid);

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
    try {
      let profileIdOut;
      if (isNew) {
        const res = await writer.addProfile({ name: draft.name.trim(), avatar: draft.avatar, color: draft.color, sort_order: draft.sort_order });
        profileIdOut = res.profile?.id;
      } else {
        await writer.editProfile({ profile_id: p.id, name: draft.name.trim(), avatar: draft.avatar, color: draft.color });
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
        h('input', { class: 'input', id: 'add-chan-input', placeholder: 'https://youtube.com/@Bluey' }),
        h('button', { class: 'btn btn-primary', onclick: async (ev) => {
          const input = document.getElementById('add-chan-input');
          const val = input.value.trim();
          if (!val) return;
          const btn = ev.currentTarget;
          btn.disabled = true; btn.textContent = '…';
          try {
            const res = await writer.addChannel(val, [profileId]);
            toast(`Added ${res.channel?.title || 'channel'}`);
            input.value = ''; renderContent();
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
