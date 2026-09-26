// ------------------------------------------------------------------------
// coop/js/parent.js
//
// Parent mode, iOS Settings-style. Every screen here is scoped under
// `.p-app` (see style.css) and uses grouped-inset lists, iOS toggle
// switches, segmented controls, bottom sheets, and iOS system colors.
//
// All writes go through parent-write via writer.js.
// ------------------------------------------------------------------------

import { h, icon, toast } from './dom.js';
import { avatarSvg, PACKS } from './avatars.js';
import * as data from './data.js';
import * as writer from './writer.js';

// ---------- iOS-flavoured icons (thinner strokes than kid ICONS) ----------
const P_ICONS = {
  chevron:   '<polyline points="9 6 15 12 9 18" stroke-width="2.5"/>',
  back:      '<polyline points="15 6 9 12 15 18" stroke-width="2.5"/>',
  plus:      '<path d="M12 5v14M5 12h14" stroke-width="2.5"/>',
  minus:     '<path d="M5 12h14" stroke-width="2.5"/>',
  x:         '<path d="M6 6l12 12M18 6L6 18" stroke-width="2.5"/>',
  refresh:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0 0 20.5 15"/>'
};
function pIcon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ---------- Curated accent swatches for kids ----------
export const KID_ACCENTS = [
  { hex: '#A9D3BE', name: 'Sage' },
  { hex: '#9CC8E8', name: 'Sky' },
  { hex: '#F5C6A5', name: 'Peach' },
  { hex: '#F0B5C4', name: 'Rose' },
  { hex: '#C6B8E5', name: 'Lilac' },
  { hex: '#B7E3D6', name: 'Mint' },
  { hex: '#F3DFA2', name: 'Butter' },
  { hex: '#F2A79B', name: 'Coral' }
];

// ---------- Base shell ----------
// Wraps a screen: `.p-app` root with a sticky nav bar that grows a
// bottom border once the content scrolls. `back` shows a "< Label"
// button that navigates via onBack.
function shell({ title, back, onBack, action, actionLabel, actionDestructive }) {
  const root = h('div', { class: 'p-app' });
  const navbarTitle = h('div', { class: 'p-navbar-title' }, title || '');
  const navbar = h('div', { class: 'p-navbar' },
    back ? h('button', {
      class: 'p-navbar-back',
      onclick: onBack,
      'aria-label': `Back to ${back}`
    }, h('span', { html: pIcon(P_ICONS.back), style: { display: 'inline-flex' } }), h('span', {}, back)) : h('div', { style: { width: '44px' } }),
    navbarTitle,
    action ? h('button', {
      class: 'p-navbar-action' + (actionDestructive ? ' destructive' : ''),
      onclick: action
    }, actionLabel || 'Action') : h('div', { style: { width: '44px' } })
  );
  const scroll = h('div', { class: 'p-scroll' });
  root.append(navbar, scroll);

  // Toggle scrolled state on the navbar.
  root.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', root.scrollTop > 8);
  }, { passive: true });
  // Because .p-scroll is the container, the window doesn't scroll — the
  // root does. Give the root overflow: auto:
  root.style.overflowY = 'auto';
  root.style.height = '100vh';
  root.style.height = '100dvh';

  return { root, scroll, navbar };
}

// ---------- Cell / group / section builders ----------
function group(cells) {
  return h('div', { class: 'p-group' }, ...cells.filter(Boolean));
}
function section({ header, footer, children }) {
  return h('section', { class: 'p-section' },
    header ? h('div', { class: 'p-section-header' }, header) : null,
    ...(Array.isArray(children) ? children : [children]),
    footer ? h('div', { class: 'p-section-footer' }, footer) : null
  );
}
function cell({ title, sub, value, onclick, chevron, destructive, disabled, right, avatar, avatarSpec }) {
  const attrs = {
    class: 'p-cell' + (destructive ? ' destructive' : ''),
    type: 'button'
  };
  if (onclick && !disabled) attrs.onclick = onclick;
  if (disabled) attrs.disabled = 'disabled';
  return h('button', attrs,
    avatar || (avatarSpec ? h('div', { class: 'p-cell-avatar' }, h('div', { class: 'avatar-img', html: avatarSvg(avatarSpec) })) : null),
    h('div', { class: 'p-cell-label' },
      h('div', { class: 'p-cell-title' }, title || ''),
      sub ? h('div', { class: 'p-cell-sub' }, sub) : null
    ),
    right || (value !== undefined && value !== null ? h('div', { class: 'p-cell-value' }, String(value)) : null),
    chevron !== false ? h('div', { class: 'p-cell-chevron', html: pIcon(P_ICONS.chevron) }) : null
  );
}
function toggleCell({ title, sub, checked, onChange, disabled }) {
  const tog = h('input', { class: 'p-toggle', type: 'checkbox' });
  tog.checked = !!checked;
  if (disabled) tog.disabled = true;
  tog.addEventListener('change', () => onChange(tog.checked));
  return h('div', { class: 'p-cell' },
    h('div', { class: 'p-cell-label' },
      h('div', { class: 'p-cell-title' }, title),
      sub ? h('div', { class: 'p-cell-sub' }, sub) : null
    ),
    tog
  );
}
function segmentedCell({ title, options, value, onChange }) {
  const seg = h('div', { class: 'p-segmented' });
  function draw() {
    seg.innerHTML = '';
    for (const [val, label] of options) {
      seg.appendChild(h('button', {
        type: 'button',
        class: value === val ? 'active' : '',
        onclick: () => { value = val; draw(); onChange(val); }
      }, label));
    }
  }
  draw();
  return h('div', { class: 'p-cell' },
    h('div', { class: 'p-cell-label' }, h('div', { class: 'p-cell-title' }, title)),
    seg
  );
}

// ---------- Bottom sheet ----------
function openSheet({ title, cancel = 'Cancel', done, onDone, body, onOpen }) {
  const backdrop = h('div', { class: 'p-sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } });
  const sheet = h('div', { class: 'p-sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'p-sheet-handle' }),
    h('div', { class: 'p-sheet-header' },
      h('button', { class: 'p-sheet-cancel', onclick: () => close() }, cancel),
      h('div', { class: 'p-sheet-title' }, title || ''),
      done ? h('button', { class: 'p-sheet-done', onclick: () => onDone && onDone(close) }, done) : h('div', { style: { minWidth: '60px' } })
    ),
    h('div', { class: 'p-sheet-body' }, body)
  );
  function close() { backdrop.remove(); sheet.remove(); }
  document.body.append(backdrop, sheet);
  if (onOpen) onOpen(close);
  return { close };
}
function openConfirm({ title, message, destructive = 'Delete', cancel = 'Cancel', onConfirm }) {
  return openSheet({
    title,
    cancel,
    body: h('div', {},
      message ? h('p', { style: { color: '#8E8E93', fontSize: '15px', marginBottom: '16px' } }, message) : null,
      h('button', {
        class: 'p-btn destructive',
        onclick: () => { onConfirm(); }
      }, destructive)
    )
  });
}

// ==========================================================================
// PARENT HOME
// ==========================================================================
export async function renderParentHome(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Parent',
    back: 'Kids',
    onBack: () => go('profileSelect'),
    action: () => go('parentSettings'),
    actionLabel: 'Done'
  });
  rootEl.appendChild(root);

  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Parent'));

  // Load counts in parallel.
  const [profiles, channels, blocklist, hideShorts, oneoffs] = await Promise.all([
    data.fetchProfiles().catch(() => []),
    data.fetchAllChannels().catch(() => []),
    data.fetchBlocklist().catch(() => []),
    data.fetchPublicSettings().then(s => s?.hide_shorts).catch(() => null),
    data.supabase.from('coop_videos').select('id', { count: 'exact', head: true }).eq('is_oneoff', true).then(r => r.count || 0).catch(() => 0)
  ]);

  scroll.appendChild(section({
    children: group([
      cell({
        title: 'Kids',
        value: `${profiles.length}`,
        onclick: () => go('parentKids')
      }),
      cell({
        title: 'Channels',
        value: `${channels.length}`,
        onclick: () => go('parentChannels')
      }),
      cell({
        title: 'Videos',
        value: `${oneoffs} one-off${oneoffs === 1 ? '' : 's'}`,
        onclick: () => go('parentVideos')
      }),
      cell({
        title: 'Blocklist',
        value: `${blocklist.length}`,
        onclick: () => go('parentBlocklist')
      }),
      cell({
        title: 'Settings',
        value: hideShorts ? 'Shorts hidden' : 'Shorts visible',
        onclick: () => go('parentSettings')
      })
    ])
  }));
}

// ==========================================================================
// KIDS LIST
// ==========================================================================
export async function renderKids(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Kids',
    back: 'Parent',
    onBack: () => go('parentHome'),
    action: () => openAddKidSheet(go),
    actionLabel: 'Add'
  });
  rootEl.appendChild(root);

  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Kids'));
  const profiles = await data.fetchProfiles().catch(() => []);

  if (!profiles.length) {
    scroll.appendChild(section({
      children: group([
        cell({
          title: 'Add a kid',
          onclick: () => openAddKidSheet(go),
          chevron: false,
          right: h('span', { class: 'p-cell-plus', html: pIcon(P_ICONS.plus) })
        })
      ])
    }));
    return;
  }

  scroll.appendChild(section({
    children: group(profiles.map(p => cell({
      title: p.name,
      sub: `${p.nav_style === 'rail' ? 'Rail' : 'Sidebar'} · ${p.tile_size === 'large' ? 'Large' : 'Regular'} tiles`,
      avatarSpec: p.avatar,
      onclick: () => go('parentKidDetail', { profileId: p.id })
    })))
  }));
}

function openAddKidSheet(go) {
  let name = '';
  const input = h('input', { class: 'p-input', type: 'text', placeholder: 'Kid\'s name', oninput: (e) => name = e.target.value });
  openSheet({
    title: 'Add a kid',
    done: 'Add',
    onDone: async (close) => {
      if (!name.trim()) { toast('Enter a name'); return; }
      try {
        const res = await writer.addProfile({
          name: name.trim(),
          avatar: 'animals:fox',
          color: '#A9D3BE',
          sort_order: 999
        });
        // Then set default theme fields via edit_profile
        await writer.editProfile({
          profile_id: res.profile.id,
          accent_color: '#A9D3BE',
          nav_style: 'sidebar',
          tile_size: 'regular'
        });
        close();
        go('parentKidDetail', { profileId: res.profile.id });
      } catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', {}, h('div', { class: 'p-field-label' }, 'Name'), input),
    onOpen: () => setTimeout(() => input.focus(), 100)
  });
}

// ==========================================================================
// KID DETAIL
// ==========================================================================
export async function renderKidDetail(rootEl, go, profileId) {
  const profiles = await data.fetchProfiles().catch(() => []);
  const p = profiles.find(x => x.id === profileId);
  if (!p) return go('parentKids');

  const { root, scroll } = shell({
    title: p.name,
    back: 'Kids',
    onBack: () => go('parentKids')
  });
  rootEl.appendChild(root);
  scroll.appendChild(h('div', { class: 'p-title-large' }, p.name));

  const [allChannels, mineChannels, hasPin] = await Promise.all([
    data.fetchAllChannels().catch(() => []),
    data.fetchChannelIdsForProfile(profileId).catch(() => new Set()),
    data.hasKidPin(profileId).catch(() => false)
  ]);
  const mine = new Set(mineChannels);

  // Basics
  scroll.appendChild(section({
    header: 'Basics',
    children: group([
      cell({
        title: 'Name',
        value: p.name,
        onclick: () => openEditNameSheet(p, go)
      }),
      cell({
        title: 'Avatar',
        avatarSpec: p.avatar,
        onclick: () => openAvatarSheet(p, go)
      }),
      // Accent swatch row rendered as its own cell body
      h('div', { class: 'p-cell', style: { flexDirection: 'column', alignItems: 'stretch', padding: '14px 16px' } },
        h('div', { class: 'p-cell-title', style: { marginBottom: '10px' } }, 'Accent color'),
        h('div', { class: 'p-swatches' }, ...KID_ACCENTS.map(sw => h('button', {
          type: 'button',
          class: 'p-swatch' + (p.accent_color?.toLowerCase() === sw.hex.toLowerCase() ? ' selected' : ''),
          style: { background: sw.hex },
          title: sw.name,
          onclick: async () => {
            try {
              await writer.editProfile({ profile_id: profileId, accent_color: sw.hex });
              toast('Saved');
              go('parentKidDetail', { profileId });
            } catch (e) { toast('Error: ' + e.message); }
          }
        })))
      )
    ])
  }));

  // Navigation (iPad-only nudge in footer)
  scroll.appendChild(section({
    header: 'Layout',
    footer: 'Navigation style only affects tablet-sized screens; iPhone always uses the bottom tab bar.',
    children: group([
      segmentedCell({
        title: 'Navigation',
        options: [['sidebar', 'Sidebar'], ['rail', 'Rail']],
        value: p.nav_style,
        onChange: async (v) => {
          try { await writer.editProfile({ profile_id: profileId, nav_style: v }); toast('Saved'); }
          catch (e) { toast('Error: ' + e.message); }
        }
      }),
      segmentedCell({
        title: 'Tile size',
        options: [['regular', 'Regular'], ['large', 'Large']],
        value: p.tile_size,
        onChange: async (v) => {
          try { await writer.editProfile({ profile_id: profileId, tile_size: v }); toast('Saved'); }
          catch (e) { toast('Error: ' + e.message); }
        }
      })
    ])
  }));

  // PIN
  scroll.appendChild(section({
    header: 'PIN',
    footer: hasPin ? 'This kid must enter their PIN before their profile opens.' : 'No PIN — anyone can open this profile.',
    children: group([
      cell({
        title: hasPin ? 'Change PIN' : 'Set PIN',
        onclick: () => openKidPinSheet(profileId, go)
      }),
      hasPin ? cell({
        title: 'Remove PIN',
        destructive: true,
        chevron: false,
        onclick: () => openConfirm({
          title: 'Remove PIN?',
          message: 'Anyone will be able to open this profile.',
          destructive: 'Remove',
          onConfirm: async () => {
            try { await writer.clearKidPin(profileId); toast('PIN removed'); go('parentKidDetail', { profileId }); }
            catch (e) { toast('Error: ' + e.message); }
          }
        })
      }) : null
    ])
  }));

  // Channels
  scroll.appendChild(section({
    header: 'Channels',
    footer: 'Toggle which of the shared library this kid sees.',
    children: group(allChannels.length
      ? allChannels.map(c => toggleCell({
          title: c.title,
          sub: c.handle ? '@' + c.handle : c.id,
          checked: mine.has(c.id),
          onChange: async (checked) => {
            const ids = new Set(mine);
            if (checked) ids.add(c.id); else ids.delete(c.id);
            try {
              await writer.setProfileChannels(profileId, [...ids]);
              mine.clear(); ids.forEach(x => mine.add(x));
            } catch (e) { toast('Error: ' + e.message); }
          }
        }))
      : [cell({ title: 'No channels yet', disabled: true, chevron: false })])
  }));

  // Destructive
  scroll.appendChild(section({
    children: group([
      cell({
        title: 'Delete profile',
        destructive: true,
        chevron: false,
        onclick: () => openConfirm({
          title: `Delete ${p.name}?`,
          message: 'The shared channel + video library isn\'t affected; only this profile\'s visibility and hidden lists.',
          destructive: 'Delete',
          onConfirm: async () => {
            try { await writer.deleteProfile(profileId); toast('Deleted'); go('parentKids'); }
            catch (e) { toast('Error: ' + e.message); }
          }
        })
      })
    ])
  }));
}

function openEditNameSheet(profile, go) {
  let name = profile.name;
  const input = h('input', { class: 'p-input', type: 'text', value: name, oninput: (e) => name = e.target.value });
  openSheet({
    title: 'Name',
    done: 'Save',
    onDone: async (close) => {
      if (!name.trim()) { toast('Enter a name'); return; }
      try {
        await writer.editProfile({ profile_id: profile.id, name: name.trim() });
        close(); go('parentKidDetail', { profileId: profile.id });
      } catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', {}, h('div', { class: 'p-field-label' }, 'Name'), input),
    onOpen: () => setTimeout(() => input.focus(), 100)
  });
}

function openAvatarSheet(profile, go) {
  let currentPack = (profile.avatar || 'animals:fox').split(':')[0];
  let chosen = profile.avatar;
  const tabs = h('div', { class: 'p-pack-tabs' });
  const grid = h('div', { class: 'p-avatar-grid' });
  function draw() {
    tabs.innerHTML = '';
    for (const p of PACKS) tabs.appendChild(h('button', {
      type: 'button',
      class: currentPack === p.id ? 'active' : '',
      onclick: () => { currentPack = p.id; draw(); }
    }, p.label));
    grid.innerHTML = '';
    const pack = PACKS.find(x => x.id === currentPack) || PACKS[0];
    for (const a of pack.avatars) {
      const spec = `${pack.id}:${a.id}`;
      grid.appendChild(h('button', {
        type: 'button',
        class: 'p-avatar-chip' + (spec === chosen ? ' selected' : ''),
        title: a.label || a.id,
        onclick: () => { chosen = spec; draw(); }
      }, h('div', { class: 'avatar-img', html: avatarSvg(spec) })));
    }
  }
  draw();
  openSheet({
    title: 'Choose avatar',
    done: 'Save',
    onDone: async (close) => {
      try {
        await writer.editProfile({ profile_id: profile.id, avatar: chosen });
        close(); go('parentKidDetail', { profileId: profile.id });
      } catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', { class: 'p-avatar-picker' }, tabs, grid)
  });
}

function openKidPinSheet(profileId, go) {
  let pin = '';
  const display = h('div', { class: 'k-pin-display' });
  function draw() {
    display.innerHTML = '';
    for (let i = 0; i < 4; i++) display.appendChild(h('div', { class: 'k-pin-dot' + (i < pin.length ? ' filled' : '') }));
  }
  draw();
  const numpad = h('div', { class: 'k-numpad', style: { margin: '0 auto', maxWidth: '320px' } });
  const press = (d) => { if (pin.length < 4) { pin += d; draw(); } };
  for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = ''; draw(); } }, 'Clear'));
  numpad.appendChild(h('button', { type: 'button', onclick: () => press('0') }, '0'));
  numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = pin.slice(0, -1); draw(); }, html: '⌫' }));
  openSheet({
    title: 'Set kid PIN',
    done: 'Save',
    onDone: async (close) => {
      if (pin.length !== 4) { toast('Enter 4 digits'); return; }
      try { await writer.setKidPin(profileId, pin); toast('PIN saved'); close(); go('parentKidDetail', { profileId }); }
      catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', { style: { textAlign: 'center', padding: '8px 0 16px' } }, display, numpad)
  });
}

// ==========================================================================
// CHANNELS
// ==========================================================================
export async function renderChannels(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Channels',
    back: 'Parent',
    onBack: () => go('parentHome'),
    action: () => openAddChannelSheet(go),
    actionLabel: 'Add'
  });
  rootEl.appendChild(root);
  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Channels'));

  const [channels, profiles] = await Promise.all([
    data.fetchAllChannels().catch(() => []),
    data.fetchProfiles().catch(() => [])
  ]);
  // Build channel_id → [kid names] map from coop_profile_channels
  const { data: pcRows } = await data.supabase.from('coop_profile_channels').select('profile_id, channel_id');
  const nameByPid = Object.fromEntries(profiles.map(p => [p.id, p.name]));
  const kidsPerChan = new Map();
  for (const r of pcRows || []) {
    if (!kidsPerChan.has(r.channel_id)) kidsPerChan.set(r.channel_id, []);
    kidsPerChan.get(r.channel_id).push(nameByPid[r.profile_id] || '?');
  }

  if (!channels.length) {
    scroll.appendChild(section({
      children: group([
        cell({ title: 'Add a channel',
          right: h('span', { class: 'p-cell-plus', html: pIcon(P_ICONS.plus) }),
          onclick: () => openAddChannelSheet(go),
          chevron: false })
      ])
    }));
    return;
  }

  scroll.appendChild(section({
    footer: 'Swipe or open a channel to remove it.',
    children: group(channels.map(c => {
      const kids = kidsPerChan.get(c.id) || [];
      const synced = c.last_synced_at ? relTime(c.last_synced_at) : 'never';
      return cell({
        title: c.title,
        sub: `${kids.length ? kids.join(', ') : 'No kids'} · synced ${synced}`,
        avatar: h('div', { class: 'p-cell-avatar', style: c.thumbnail_url ? { background: `#2A2A2C center/cover url("${c.thumbnail_url}")` } : {} }),
        onclick: () => openChannelActionsSheet(c, go)
      });
    }))
  }));
}

function relTime(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h_ = Math.floor(m / 60); if (h_ < 24) return `${h_}h ago`;
  const d = Math.floor(h_ / 24); return `${d}d ago`;
}

function openChannelActionsSheet(c, go) {
  openSheet({
    title: c.title,
    body: h('div', {},
      h('button', {
        class: 'p-btn destructive',
        onclick: () => {
          openConfirm({
            title: `Remove ${c.title}?`,
            message: 'The channel and its synced videos will be deleted. One-off approved videos stay.',
            destructive: 'Remove',
            onConfirm: async () => {
              try { await writer.removeChannel(c.id); toast('Removed'); go('parentChannels'); }
              catch (e) { toast('Error: ' + e.message); }
            }
          });
        }
      }, 'Remove channel')
    )
  });
}

function openAddChannelSheet(go) {
  let inputValue = '';
  const input = h('input', { class: 'p-input', type: 'text', placeholder: '@handle, UC… ID, or channel URL', oninput: (e) => inputValue = e.target.value });
  const previewBox = h('div');
  const bodyEl = h('div', {},
    h('div', { class: 'p-field-label' }, 'Channel'),
    input,
    previewBox
  );
  let resolved = null;
  let profileSelection = new Set(); // profile ids to add to
  async function refreshPreview() {
    previewBox.innerHTML = '';
    if (!inputValue.trim()) return;
    previewBox.appendChild(h('div', { style: { color: '#8E8E93', fontSize: '13px', padding: '8px 0' } }, 'Looking up…'));
    try {
      const res = await writer.resolveChannel(inputValue.trim());
      resolved = res.channel;
      const profs = await data.fetchProfiles().catch(() => []);
      profileSelection = new Set(profs.map(p => p.id)); // default: add to all
      previewBox.innerHTML = '';
      previewBox.appendChild(h('div', { class: 'p-preview' },
        h('div', { class: 'p-preview-avatar', style: resolved.thumbnail_url ? { background: `#48484A center/cover url("${resolved.thumbnail_url}")` } : {} }),
        h('div', { class: 'p-preview-info' },
          h('div', { class: 'p-preview-title' }, resolved.title),
          h('div', { class: 'p-preview-sub' }, [
            resolved.custom_url,
            resolved.subscribers != null ? `${resolved.subscribers.toLocaleString()} subs` : null,
            resolved.uploads_ok === false ? '⚠ empty uploads' : null
          ].filter(Boolean).join(' · '))
        )
      ));
      previewBox.appendChild(h('div', { class: 'p-field-label' }, 'Approve for'));
      const kidsBox = h('div', { class: 'p-group' });
      for (const p of profs) {
        kidsBox.appendChild(toggleCell({
          title: p.name,
          checked: true,
          onChange: (checked) => { if (checked) profileSelection.add(p.id); else profileSelection.delete(p.id); }
        }));
      }
      previewBox.appendChild(kidsBox);
    } catch (e) {
      resolved = null;
      previewBox.innerHTML = '';
      previewBox.appendChild(h('div', { style: { color: '#FF453A', fontSize: '14px', padding: '8px 0' } }, 'Not found: ' + e.message));
    }
  }
  let dbTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(dbTimer); dbTimer = setTimeout(refreshPreview, 400);
  });
  openSheet({
    title: 'Add channel',
    done: 'Add',
    onDone: async (close) => {
      if (!resolved) { toast('Enter a valid channel first'); return; }
      try {
        await writer.addChannel(resolved.id, [...profileSelection]);
        toast('Added'); close(); go('parentChannels');
      } catch (e) { toast('Error: ' + e.message); }
    },
    body: bodyEl,
    onOpen: () => setTimeout(() => input.focus(), 100)
  });
}

// ==========================================================================
// VIDEOS (one-offs + hidden)
// ==========================================================================
export async function renderVideos(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Videos',
    back: 'Parent',
    onBack: () => go('parentHome'),
    action: () => openAddVideoSheet(go),
    actionLabel: 'Add'
  });
  rootEl.appendChild(root);
  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Videos'));

  const profiles = await data.fetchProfiles().catch(() => []);
  const nameByPid = Object.fromEntries(profiles.map(p => [p.id, p.name]));

  // One-offs (any video with is_oneoff = true)
  const { data: oneoffRows } = await data.supabase.from('coop_videos')
    .select('id, title, thumbnail_url, channel_title')
    .eq('is_oneoff', true)
    .order('synced_at', { ascending: false });
  const oneoffs = oneoffRows || [];

  // Who sees which one-off (from coop_profile_videos)
  const { data: pvRows } = await data.supabase.from('coop_profile_videos').select('profile_id, video_id');
  const kidsPerVid = new Map();
  for (const r of pvRows || []) {
    if (!kidsPerVid.has(r.video_id)) kidsPerVid.set(r.video_id, []);
    kidsPerVid.get(r.video_id).push(nameByPid[r.profile_id] || '?');
  }

  // Hidden (per-profile)
  const { data: hiddenRows } = await data.supabase.from('coop_profile_hidden_videos').select('profile_id, video_id');
  const hiddenByVid = new Map();
  for (const r of hiddenRows || []) {
    if (!hiddenByVid.has(r.video_id)) hiddenByVid.set(r.video_id, []);
    hiddenByVid.get(r.video_id).push(r.profile_id);
  }

  scroll.appendChild(section({
    header: `One-off approved (${oneoffs.length})`,
    footer: 'Videos parents approved outside a channel.',
    children: group(oneoffs.length
      ? oneoffs.map(v => {
          const kids = kidsPerVid.get(v.id) || [];
          return cell({
            title: v.title,
            sub: `${v.channel_title || ''} · ${kids.length ? kids.join(', ') : 'nobody'}`,
            avatar: h('div', { class: 'p-cell-avatar', style: v.thumbnail_url ? { background: `#2A2A2C center/cover url("${v.thumbnail_url}")`, borderRadius: '6px' } : {} }),
            onclick: () => openConfirm({
              title: 'Remove video?',
              destructive: 'Remove',
              onConfirm: async () => {
                try { await writer.removeOneoffVideo(v.id); toast('Removed'); go('parentVideos'); }
                catch (e) { toast('Error: ' + e.message); }
              }
            })
          });
        })
      : [cell({ title: 'No one-off videos yet', disabled: true, chevron: false })])
  }));

  const hiddenCount = hiddenRows?.length || 0;
  scroll.appendChild(section({
    header: `Hidden per kid (${hiddenCount})`,
    footer: hiddenCount ? 'Tap to unhide.' : 'Nothing is hidden right now.',
    children: group(hiddenCount
      ? [...hiddenByVid.entries()].map(([videoId, pids]) => cell({
          title: videoId,
          sub: pids.map(pid => nameByPid[pid] || pid).join(', '),
          onclick: () => openConfirm({
            title: 'Unhide for all listed kids?',
            destructive: 'Unhide',
            onConfirm: async () => {
              try { for (const pid of pids) await writer.unhideVideo(pid, videoId); toast('Unhidden'); go('parentVideos'); }
              catch (e) { toast('Error: ' + e.message); }
            }
          })
        }))
      : [cell({ title: 'Nothing hidden', disabled: true, chevron: false })])
  }));
}

function openAddVideoSheet(go) {
  let url = '';
  const input = h('input', { class: 'p-input', type: 'text', placeholder: 'https://youtube.com/watch?v=…', oninput: (e) => url = e.target.value });
  const kidsBox = h('div', { class: 'p-group' });
  let profileSelection = new Set();
  data.fetchProfiles().then(profs => {
    profileSelection = new Set(profs.map(p => p.id));
    kidsBox.innerHTML = '';
    for (const p of profs) {
      kidsBox.appendChild(toggleCell({
        title: p.name,
        checked: true,
        onChange: (checked) => { if (checked) profileSelection.add(p.id); else profileSelection.delete(p.id); }
      }));
    }
  });
  openSheet({
    title: 'Add video',
    done: 'Add',
    onDone: async (close) => {
      if (!url.trim()) { toast('Paste a URL'); return; }
      try {
        await writer.addOneoffVideo(url.trim(), [...profileSelection]);
        toast('Added'); close(); go('parentVideos');
      } catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', {},
      h('div', { class: 'p-field-label' }, 'YouTube URL'),
      input,
      h('div', { class: 'p-field-label' }, 'Approve for'),
      kidsBox
    ),
    onOpen: () => setTimeout(() => input.focus(), 100)
  });
}

// ==========================================================================
// BLOCKLIST
// ==========================================================================
export async function renderBlocklist(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Blocklist',
    back: 'Parent',
    onBack: () => go('parentHome'),
    action: () => openAddKeywordSheet(go),
    actionLabel: 'Add'
  });
  rootEl.appendChild(root);
  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Blocklist'));

  const kws = await data.fetchBlocklist().catch(() => []);
  scroll.appendChild(section({
    footer: 'Case-insensitive, whole-word match on video titles. Applies at sync and at display.',
    children: group(kws.length
      ? kws.map(k => cell({
          title: k.keyword,
          destructive: false,
          chevron: false,
          right: h('span', { style: { color: '#FF453A', fontSize: '17px' } }, 'Remove'),
          onclick: () => openConfirm({
            title: `Remove "${k.keyword}"?`,
            destructive: 'Remove',
            onConfirm: async () => {
              try { await writer.removeBlocklistKeyword(k.keyword); toast('Removed'); go('parentBlocklist'); }
              catch (e) { toast('Error: ' + e.message); }
            }
          })
        }))
      : [cell({ title: 'No keywords', disabled: true, chevron: false })])
  }));
}

function openAddKeywordSheet(go) {
  let keyword = '';
  const input = h('input', { class: 'p-input', type: 'text', placeholder: 'e.g. Milo', oninput: (e) => keyword = e.target.value });
  openSheet({
    title: 'Add keyword',
    done: 'Add',
    onDone: async (close) => {
      if (!keyword.trim()) { toast('Enter a keyword'); return; }
      try { await writer.addBlocklistKeyword(keyword.trim()); toast('Added'); close(); go('parentBlocklist'); }
      catch (e) { toast('Error: ' + e.message); }
    },
    body: h('div', {}, h('div', { class: 'p-field-label' }, 'Keyword'), input),
    onOpen: () => setTimeout(() => input.focus(), 100)
  });
}

// ==========================================================================
// SETTINGS
// ==========================================================================
export async function renderSettings(rootEl, go) {
  const { root, scroll } = shell({
    title: 'Settings',
    back: 'Parent',
    onBack: () => go('parentHome')
  });
  rootEl.appendChild(root);
  scroll.appendChild(h('div', { class: 'p-title-large' }, 'Settings'));

  const settings = await data.fetchPublicSettings().catch(() => ({ hide_shorts: true }));
  // Latest sync across all channels
  const { data: syncRow } = await data.supabase.from('coop_channels')
    .select('last_synced_at').order('last_synced_at', { ascending: false, nullsFirst: false }).limit(1);
  const lastSync = syncRow?.[0]?.last_synced_at ? relTime(syncRow[0].last_synced_at) : 'never';

  scroll.appendChild(section({
    header: 'Feed',
    footer: 'YouTube Shorts (≤ 60 s) are always hidden by default across every kid.',
    children: group([
      toggleCell({
        title: 'Hide Shorts',
        checked: !!settings.hide_shorts,
        onChange: async (checked) => {
          try { await writer.setHideShorts(checked); toast('Saved'); }
          catch (e) { toast('Error: ' + e.message); }
        }
      })
    ])
  }));

  scroll.appendChild(section({
    header: 'Playback',
    footer: 'When on, videos end at a chooser screen (three next-newest tiles + a Back tile). When off, the app returns straight to where the kid was.',
    children: group([
      toggleCell({
        title: 'Show Up Next after videos',
        checked: settings.show_up_next !== false,
        onChange: async (checked) => {
          try { await writer.setShowUpNext(checked); toast('Saved'); }
          catch (e) { toast('Error: ' + e.message); }
        }
      })
    ])
  }));

  scroll.appendChild(section({
    header: 'Sync',
    footer: `Automatic sync every 6 h. Last synced ${lastSync}.`,
    children: group([
      cell({
        title: 'Sync now',
        chevron: false,
        right: h('span', { style: { color: 'var(--p-tint)' } }, 'Run'),
        onclick: async () => {
          toast('Syncing…');
          try {
            const pin = writer.getCachedPin ? writer.getCachedPin() : null;
            const body = pin ? { pin } : {};
            const res = await fetch('/.netlify/functions/sync-now', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: sessionStorage.getItem('coop_parent_pin') || '' })
            });
            const j = await res.json();
            if (!res.ok || j.ok === false) throw new Error(j.error || 'sync failed');
            toast(`Synced ${j.videos_upserted || 0} videos`);
            go('parentSettings');
          } catch (e) { toast('Error: ' + e.message); }
        }
      })
    ])
  }));

  scroll.appendChild(section({
    header: 'Parent PIN',
    children: group([
      cell({
        title: 'Change parent PIN',
        onclick: () => openChangeParentPinSheet()
      })
    ])
  }));

  scroll.appendChild(section({
    children: group([
      cell({
        title: 'Sign out of Parent Mode',
        destructive: true,
        chevron: false,
        onclick: () => {
          writer.clearParentPin();
          go('profileSelect');
        }
      })
    ])
  }));
}

function openChangeParentPinSheet() {
  let stage = 1, first = '', second = '';
  const display = h('div', { class: 'k-pin-display' });
  function draw(cur) {
    display.innerHTML = '';
    for (let i = 0; i < 4; i++) display.appendChild(h('div', { class: 'k-pin-dot' + (i < cur.length ? ' filled' : '') }));
  }
  const numpad = h('div', { class: 'k-numpad', style: { margin: '0 auto', maxWidth: '320px' } });
  function bindNumpad() {
    numpad.innerHTML = '';
    const press = (d) => {
      const cur = stage === 1 ? first : second;
      if (cur.length >= 4) return;
      if (stage === 1) first += d; else second += d;
      draw(stage === 1 ? first : second);
    };
    for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
    numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { if (stage === 1) first = ''; else second = ''; draw(stage === 1 ? first : second); } }, 'Clear'));
    numpad.appendChild(h('button', { type: 'button', onclick: () => press('0') }, '0'));
    numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { if (stage === 1) first = first.slice(0, -1); else second = second.slice(0, -1); draw(stage === 1 ? first : second); }, html: '⌫' }));
  }
  bindNumpad();
  draw(first);

  const title = h('div', { style: { color: '#8E8E93', fontSize: '13px', marginBottom: '12px', textAlign: 'center' } }, 'New PIN');
  openSheet({
    title: 'Change parent PIN',
    done: 'Save',
    onDone: async (close) => {
      if (stage === 1) {
        if (first.length !== 4) { toast('Enter 4 digits'); return; }
        stage = 2; title.textContent = 'Confirm PIN'; draw(second);
      } else {
        if (first !== second) { toast('PINs did not match'); stage = 1; first = ''; second = ''; title.textContent = 'New PIN'; draw(first); return; }
        try {
          await writer.setParentPinOp(first);
          writer.setParentPin(first);
          toast('PIN updated'); close();
        } catch (e) { toast('Error: ' + e.message); }
      }
    },
    body: h('div', { style: { textAlign: 'center', padding: '4px 0 16px' } }, title, display, numpad)
  });
}
