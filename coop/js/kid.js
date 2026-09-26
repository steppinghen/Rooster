// ------------------------------------------------------------------------
// coop/js/kid.js
//
// The kid-side UI. Reads only via data.js; writes never happen here.
// Screens exported: renderHome, renderAllVideos, renderChannel, renderSearch.
//
// Every render:
//   1. Wraps content in a `.k-app` root with the kid's --accent + --on-accent
//      CSS custom properties and layout classes (nav-sidebar/nav-rail,
//      tile-regular/tile-large).
//   2. Draws the persistent nav column (sidebar or rail per profile).
//   3. Renders the content into `.k-content` inside the same root.
//
// The ui.js dispatcher passes a `go(screen, params)` callback into each
// renderer so kid.js doesn't import from ui.js (avoids circular ESM).
// ------------------------------------------------------------------------

import { h, icon, ICONS, toast } from './dom.js';
import { avatarSvg, PACKS } from './avatars.js';
import * as data from './data.js';
import * as player from './player.js';
import { attachLongPress, openBlockSheet } from './kidBlock.js';

const PAGE_SIZE = 24;

// The 8 curated accent swatches. The kid Me screen and the parent-mode
// Accent picker use this same list, and kid-update validates against it.
const KID_ACCENT_SWATCHES = [
  { hex: '#A9D3BE', name: 'Sage' },
  { hex: '#9CC8E8', name: 'Sky' },
  { hex: '#F5C6A5', name: 'Peach' },
  { hex: '#F0B5C4', name: 'Rose' },
  { hex: '#C6B8E5', name: 'Lilac' },
  { hex: '#B7E3D6', name: 'Mint' },
  { hex: '#F3DFA2', name: 'Butter' },
  { hex: '#F2A79B', name: 'Coral' }
];

// POST /.netlify/functions/kid-update — narrow endpoint gated by the
// kid's PIN (if any). Only avatar / accent_color are accepted server-side.
async function callKidUpdate(profileId, patch) {
  const pin = sessionStorage.getItem('coop_kid_pin_' + profileId) || undefined;
  const res = await fetch('/.netlify/functions/kid-update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId, pin, ...patch })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok !== true) throw new Error(body.error || `HTTP ${res.status}`);
  return body.profile;
}

// ---------- kid-app root + nav ----------

function makeAppRoot(profile, currentScreen) {
  const root = h('div', {
    class: `k-app nav-${profile.nav_style || 'sidebar'} tile-${profile.tile_size || 'regular'}`,
    style: {
      '--accent': profile.accent_color || '#A9D3BE',
      '--on-accent': profile.on_accent_text || '#14231C'
    }
  });
  return root;
}

function navItem({ id, label, iconPath, active, onclick, ariaLabel }) {
  const attrs = {
    class: 'k-nav-item' + (active ? ' active' : ''),
    onclick,
    'aria-label': ariaLabel || label,
    type: 'button'
  };
  if (active) attrs['aria-current'] = 'page';
  return h('button', attrs, h('span', { html: icon(iconPath), style: { display: 'inline-flex' } }), label ? h('span', {}, label) : null);
}

async function renderSidebar(profile, currentScreen, go) {
  const channels = await data.fetchChannelsForProfile(profile.id).catch(() => []);
  const item = (screen, label, iconPath) => navItem({
    id: screen,
    label,
    iconPath,
    active: currentScreen === screen,
    onclick: () => go(screen, { profileId: profile.id })
  });
  return h('nav', { class: 'k-nav sidebar', 'aria-label': `${profile.name} navigation` },
    h('div', { class: 'k-nav-header' },
      h('button', {
        class: 'k-nav-avatar',
        onclick: () => go('kidMe', { profileId: profile.id }),
        'aria-label': 'Me'
      }, h('div', { class: 'avatar-img', html: avatarSvg(profile.avatar) })),
      h('div', { class: 'k-nav-name' }, profile.name),
      // Kept: separate text link so sidebar users still have an
      // obvious way to switch kids (avatar now opens Me).
      h('button', {
        class: 'k-nav-switch',
        onclick: () => go('profileSelect')
      }, 'Switch kid')
    ),
    h('div', { class: 'k-nav-items' },
      item('kidSearch',    'Search',     ICONS.search),
      item('kidHome',      'Home',       ICONS.home),
      item('kidAllVideos', 'All videos', ICONS.grid)
    ),
    channels.length ? h('div', { class: 'k-nav-divider' }) : null,
    channels.length ? h('div', { class: 'k-nav-channels-label' }, 'My channels') : null,
    channels.length ? h('div', { class: 'k-nav-channels-scroll' },
      ...channels.map(c => h('button', {
        class: 'k-nav-channel',
        onclick: () => go('kidChannel', { profileId: profile.id, channelId: c.id })
      },
        h('div', {
          class: 'k-nav-channel-avatar',
          style: c.thumbnail_url ? { backgroundImage: `url("${c.thumbnail_url}")` } : {}
        }),
        h('span', {}, c.title)
      ))
    ) : null
  );
}

function renderRail(profile, currentScreen, go) {
  const item = (screen, label, iconPath) => navItem({
    id: screen,
    label: null,
    iconPath,
    active: currentScreen === screen,
    onclick: () => go(screen, { profileId: profile.id }),
    ariaLabel: label
  });
  return h('nav', { class: 'k-nav rail', 'aria-label': `${profile.name} navigation` },
    h('div', { class: 'k-nav-header' },
      h('button', {
        class: 'k-nav-avatar',
        onclick: () => go('kidMe', { profileId: profile.id }),
        'aria-label': 'Me'
      }, h('div', { class: 'avatar-img', html: avatarSvg(profile.avatar) }))
    ),
    h('div', { class: 'k-nav-items' },
      item('kidSearch',    'Search',     ICONS.search),
      item('kidHome',      'Home',       ICONS.home),
      item('kidAllVideos', 'All videos', ICONS.grid)
    )
  );
}

// Bottom tab bar for phone breakpoints. CSS hides the sidebar/rail and
// shows this under 700px width. `nav_style` only affects iPad-sized
// screens; phones always get the tab bar.
function renderTabBar(profile, currentScreen, go) {
  const tab = (screen, label, iconPath) => {
    const attrs = {
      type: 'button',
      class: 'k-tab' + (currentScreen === screen ? ' active' : ''),
      onclick: () => go(screen, { profileId: profile.id }),
      'aria-label': label
    };
    if (currentScreen === screen) attrs['aria-current'] = 'page';
    return h('button', attrs,
      h('span', { html: icon(iconPath), style: { display: 'inline-flex' } }),
      h('span', {}, label)
    );
  };
  return h('nav', { class: 'k-tabbar', 'aria-label': `${profile.name} navigation` },
    tab('kidHome',      'Home',       ICONS.home),
    tab('kidSearch',    'Search',     ICONS.search),
    tab('kidAllVideos', 'All videos', ICONS.grid),
    h('button', {
      type: 'button',
      class: 'k-tab',
      onclick: () => go('kidMe', { profileId: profile.id }),
      'aria-label': 'Me'
    },
      h('div', { class: 'k-tab-avatar' },
        h('div', { class: 'avatar-img', html: avatarSvg(profile.avatar) })),
      h('span', {}, profile.name)
    )
  );
}

async function mountShell(root, profile, currentScreen, go) {
  const app = makeAppRoot(profile, currentScreen);
  const sideNav = profile.nav_style === 'rail'
    ? renderRail(profile, currentScreen, go)
    : await renderSidebar(profile, currentScreen, go);
  const tabBar = renderTabBar(profile, currentScreen, go);
  const content = h('div', { class: 'k-content' });
  app.append(sideNav, content, tabBar);
  root.appendChild(app);
  return content;
}

// ---------- reusable tiles ----------

// Play a video inside the seamless player overlay. Called from the
// tap handler so iOS accepts the audio autoplay.
function playVideo(profile, v, returnTo, sourceElement) {
  player.openPlayer({
    profile,
    videoId: v.id,
    title: v.title,
    thumbnailUrl: v.thumbnail_url,
    channelId: v.channel_id,
    sourceElement,
    returnTo
  });
}

function videoTile(v, onclick) {
  const tile = h('button', { class: 'k-tile', onclick, type: 'button' },
    h('div', { class: 'k-tile-thumb', style: v.thumbnail_url ? { backgroundImage: `url("${v.thumbnail_url}")` } : {} }),
    h('div', { class: 'k-tile-body' },
      h('div', { class: 'k-tile-title' }, v.title || ''),
      v.channel_title ? h('div', { class: 'k-tile-channel' }, v.channel_title) : null
    )
  );
  // Long-press → parent block sheet (parent PIN required).
  attachLongPress(tile, () => openBlockSheet(v, () => {
    // Optimistic hide: remove this tile from the grid on success.
    tile.remove();
  }));
  return tile;
}

// Load ~PAGE_SIZE tiles at a time via IntersectionObserver on a sentinel.
function pagedGrid(container, all, buildTile, gridClass = '') {
  const grid = h('div', { class: 'k-grid ' + gridClass });
  const sentinel = h('div', { class: 'k-sentinel', 'aria-hidden': 'true' });
  container.append(grid, sentinel);

  let cursor = 0;
  const total = all.length;

  function renderNext() {
    const end = Math.min(cursor + PAGE_SIZE, total);
    for (let i = cursor; i < end; i++) {
      const el = buildTile(all[i]);
      // Lazy-load any image src, and the thumbnail is a bg-image div — the browser
      // won't fetch bg-images until the element is in the composited layout, so
      // this behaves close to `loading="lazy"` for our thumbs.
      grid.appendChild(el);
    }
    cursor = end;
    if (cursor >= total) io.disconnect();
  }

  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) renderNext();
  }, { rootMargin: '400px 0px' });
  io.observe(sentinel);
  renderNext();
}

// ---------- HOME ----------

export async function renderHome(rootEl, profile, go) {
  const content = await mountShell(rootEl, profile, 'kidHome', go);
  content.appendChild(h('div', { class: 'k-empty k-hero-loading' }, 'Loading…'));

  const [hero, channels] = await Promise.all([
    data.fetchHeroVideoForProfile(profile.id).catch(() => null),
    data.fetchChannelsForProfile(profile.id).catch(() => [])
  ]);
  content.innerHTML = '';

  // Hero — full-bleed newest video
  if (hero) {
    let heroBox;
    heroBox = h('section', { class: 'k-hero', 'aria-label': 'Featured' },
      h('div', { class: 'k-hero-bg', style: hero.thumbnail_url ? { backgroundImage: `url("${hero.thumbnail_url}")` } : {} }),
      h('div', { class: 'k-hero-fade' }),
      h('div', { class: 'k-hero-body' },
        h('div', { class: 'k-eyebrow' }, 'New from ' + (hero.channel_title || 'your channels')),
        h('h1', { class: 'k-hero-title' }, hero.title || ''),
        h('div', { class: 'k-hero-actions' },
          h('button', {
            class: 'k-btn k-btn-play',
            onclick: (ev) => {
              // Use the hero section as the source rect for the zoom
              // animation — feels natural since the whole hero fills
              // the top of the screen already.
              const heroEl = ev.currentTarget.closest('.k-hero');
              player.openPlayer({
                profile,
                videoId: hero.id,
                title: hero.title,
                thumbnailUrl: hero.thumbnail_url,
                channelId: hero.channel_id,
                sourceElement: heroEl,
                returnTo: { screen: 'kidHome', params: { profileId: profile.id } }
              });
            }
          }, h('span', { html: icon(ICONS.play) }), h('span', {}, 'Play')),
          profile.nav_style === 'sidebar' && hero.channel_id ? h('button', {
            class: 'k-btn k-btn-ghost',
            onclick: () => go('kidChannel', { profileId: profile.id, channelId: hero.channel_id })
          }, 'Open channel') : null
        )
      )
    );
    // Long-press anywhere on the hero → parent block sheet.
    attachLongPress(heroBox, () => openBlockSheet(hero, () => {
      // Refresh Home so a new hero is picked.
      go('kidHome', { profileId: profile.id });
    }));
    content.appendChild(heroBox);
  }

  // My channels row
  content.appendChild(h('section', { class: 'k-section', 'aria-label': 'My channels' },
    h('h2', { class: 'k-section-title' }, 'My channels'),
    channels.length
      ? h('div', { class: 'k-channels-row' },
          ...channels.map(c => h('button', {
            class: 'k-channel-tile',
            onclick: () => go('kidChannel', { profileId: profile.id, channelId: c.id })
          },
            h('div', {
              class: 'k-channel-tile-avatar',
              style: c.thumbnail_url ? { backgroundImage: `url("${c.thumbnail_url}")` } : {}
            }),
            h('div', { class: 'k-channel-tile-name' }, c.title)
          ))
        )
      : h('div', { class: 'k-empty' },
          h('div', { class: 'k-empty-emoji' }, '🌱'),
          h('div', {}, 'A grown-up hasn\'t added any channels yet.'))
  ));
}

// ---------- ALL VIDEOS ----------

export async function renderAllVideos(rootEl, profile, go) {
  const content = await mountShell(rootEl, profile, 'kidAllVideos', go);
  content.appendChild(h('h1', { class: 'k-section-title', style: { fontSize: '32px' } }, 'All videos'));
  content.appendChild(h('div', { class: 'k-empty' }, 'Loading…'));

  const feed = await data.fetchFeedForProfile(profile.id, { limit: 500 }).catch(() => []);
  content.innerHTML = '';
  content.appendChild(h('h1', { class: 'k-section-title', style: { fontSize: '32px' } }, 'All videos'));

  if (!feed.length) {
    content.appendChild(h('div', { class: 'k-empty' },
      h('div', { class: 'k-empty-emoji' }, '🌱'),
      h('div', {}, 'No videos yet.')));
    return;
  }

  const listWrap = h('div');
  content.appendChild(listWrap);
  pagedGrid(listWrap, feed, (v) => videoTile(v, (ev) => playVideo(
    profile, v,
    { screen: 'kidAllVideos', params: { profileId: profile.id } },
    ev.currentTarget
  )), 'grid-3col');
}

// ---------- CHANNEL PAGE ----------

export async function renderChannel(rootEl, profile, channelId, go) {
  const content = await mountShell(rootEl, profile, null, go);

  const backBar = h('div', { style: { marginBottom: '8px' } },
    h('button', { class: 'k-back-btn', 'aria-label': 'Back to home',
      onclick: () => go('kidHome', { profileId: profile.id }), html: icon(ICONS.back) })
  );
  content.appendChild(backBar);
  content.appendChild(h('div', { class: 'k-empty' }, 'Loading…'));

  const [channel, videos] = await Promise.all([
    data.fetchChannelById(channelId).catch(() => null),
    data.fetchFeedForChannel(profile.id, channelId).catch(() => [])
  ]);
  // Redraw
  content.innerHTML = '';
  content.appendChild(backBar);

  if (!channel) {
    content.appendChild(h('div', { class: 'k-empty' }, 'Channel not found.'));
    return;
  }

  content.appendChild(h('header', { class: 'k-channel-header' },
    h('div', { class: 'k-channel-avatar', style: channel.thumbnail_url ? { backgroundImage: `url("${channel.thumbnail_url}")` } : {} }),
    h('h1', { class: 'k-channel-title' }, channel.title || ''),
    h('div', { class: 'k-channel-meta' }, `${videos.length} video${videos.length === 1 ? '' : 's'}`)
  ));

  if (!videos.length) {
    content.appendChild(h('div', { class: 'k-empty' },
      h('div', { class: 'k-empty-emoji' }, '🌱'),
      h('div', {}, 'No videos to show right now.')));
    return;
  }

  const listWrap = h('div');
  content.appendChild(listWrap);
  pagedGrid(listWrap, videos, (v) => videoTile(v, (ev) => playVideo(
    profile,
    { ...v, channel_id: v.channel_id || channelId },
    { screen: 'kidChannel', params: { profileId: profile.id, channelId } },
    ev.currentTarget
  )), 'grid-3col');
}

// ---------- SEARCH ----------

export async function renderSearch(rootEl, profile, go) {
  const content = await mountShell(rootEl, profile, 'kidSearch', go);

  const input = h('input', {
    type: 'search',
    class: 'k-search-input',
    placeholder: 'Search your channels',
    'aria-label': 'Search your channels',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false'
  });

  const heading = h('div', { class: 'k-search-heading', style: { display: 'none' } });
  const sub = h('div', { class: 'k-search-sub', style: { display: 'none' } }, 'Only from your channels');
  const results = h('div');

  content.append(input, heading, sub, results);

  let debounce = null;
  let lastQuery = '';

  async function runSearch(q) {
    if (q === lastQuery) return;
    lastQuery = q;
    if (!q) {
      heading.style.display = 'none';
      sub.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    heading.style.display = '';
    sub.style.display = '';
    heading.textContent = `Videos about "${q}"`;
    results.innerHTML = '';
    results.appendChild(h('div', { class: 'k-empty' }, 'Searching…'));

    let videos;
    try { videos = await data.searchFeedForProfile(profile.id, q, { limit: 200 }); }
    catch { videos = []; }
    if (q !== lastQuery) return;   // a newer query came in; drop this result
    results.innerHTML = '';
    if (!videos.length) {
      results.appendChild(h('div', { class: 'k-empty' }, 'Nothing here.'));
      return;
    }
    const listWrap = h('div');
    results.appendChild(listWrap);
    pagedGrid(listWrap, videos, (v) => videoTile(v, (ev) => playVideo(
      profile, v,
      { screen: 'kidSearch', params: { profileId: profile.id } },
      ev.currentTarget
    )), 'grid-3col');
  }

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    debounce = setTimeout(() => runSearch(q), 250);
  });

  setTimeout(() => input.focus(), 30);
}

// ---------- ME (kid-owned avatar + accent picker) ----------

export async function renderMe(rootEl, profile, go) {
  const content = await mountShell(rootEl, profile, null, go);

  // Header: big avatar + name + clear "Switch kid" button (since the
  // avatar in the side/rail/tab bar now opens this Me screen).
  const header = h('div', { class: 'k-me-header' },
    h('div', { class: 'k-me-avatar', 'aria-live': 'polite' },
      h('div', { class: 'avatar-img', html: avatarSvg(profile.avatar) })),
    h('div', { class: 'k-me-name' }, profile.name),
    h('button', {
      class: 'k-btn k-btn-ghost',
      type: 'button',
      onclick: () => go('profileSelect')
    }, 'Switch kid')
  );
  content.appendChild(header);

  // Local mutable state so the screen updates instantly on tap. Server
  // is called in the background; if it fails the UI reverts + toasts.
  let currentAvatar = profile.avatar;
  let currentAccent = profile.accent_color || KID_ACCENT_SWATCHES[0].hex;

  function applyAccentPreview(hex) {
    // Update the shell's --accent so hero/nav/tab styling reflect it
    // immediately, without waiting for the next fetch.
    const app = rootEl.querySelector('.k-app');
    if (app) app.style.setProperty('--accent', hex);
  }
  function applyAvatarPreview(spec) {
    header.querySelector('.k-me-avatar .avatar-img').innerHTML = avatarSvg(spec);
    // Also update the nav/rail/tab-bar avatars if they're present.
    for (const el of rootEl.querySelectorAll('.k-nav-avatar .avatar-img, .k-tab-avatar .avatar-img')) {
      el.innerHTML = avatarSvg(spec);
    }
  }

  // Pack tabs + grid
  let activePack = (currentAvatar || 'animals:fox').split(':')[0];
  const packTabs = h('div', { class: 'k-me-pack-tabs' });
  const packGrid = h('div', { class: 'k-me-pack-grid' });
  function drawTabs() {
    packTabs.innerHTML = '';
    for (const p of PACKS) packTabs.appendChild(h('button', {
      type: 'button',
      class: activePack === p.id ? 'active' : '',
      onclick: () => { activePack = p.id; drawTabs(); drawGrid(); }
    }, p.label));
  }
  function drawGrid() {
    packGrid.innerHTML = '';
    const pack = PACKS.find(x => x.id === activePack) || PACKS[0];
    for (const a of pack.avatars) {
      const spec = `${pack.id}:${a.id}`;
      packGrid.appendChild(h('button', {
        type: 'button',
        class: 'k-me-avatar-chip' + (spec === currentAvatar ? ' selected' : ''),
        title: a.label || a.id,
        onclick: async () => {
          const prev = currentAvatar;
          currentAvatar = spec;
          drawGrid();
          applyAvatarPreview(spec);
          try { await callKidUpdate(profile.id, { avatar: spec }); }
          catch (e) {
            currentAvatar = prev; drawGrid(); applyAvatarPreview(prev);
            toast(e.message === 'wrong pin' ? 'Enter your code first' : 'Try again');
          }
        }
      }, h('div', { class: 'avatar-img', html: avatarSvg(spec) })));
    }
  }
  drawTabs(); drawGrid();

  const swatchRow = h('div', { class: 'k-me-swatches' });
  function drawSwatches() {
    swatchRow.innerHTML = '';
    for (const sw of KID_ACCENT_SWATCHES) {
      swatchRow.appendChild(h('button', {
        type: 'button',
        class: 'k-me-swatch' + (sw.hex.toLowerCase() === currentAccent.toLowerCase() ? ' selected' : ''),
        style: { background: sw.hex },
        title: sw.name,
        onclick: async () => {
          const prev = currentAccent;
          currentAccent = sw.hex;
          drawSwatches();
          applyAccentPreview(sw.hex);
          try { await callKidUpdate(profile.id, { accent_color: sw.hex }); }
          catch (e) {
            currentAccent = prev; drawSwatches(); applyAccentPreview(prev);
            toast(e.message === 'wrong pin' ? 'Enter your code first' : 'Try again');
          }
        }
      }));
    }
  }
  drawSwatches();

  content.appendChild(h('section', { class: 'k-me-section' },
    h('h2', { class: 'k-section-title' }, 'Avatar'),
    packTabs,
    packGrid
  ));
  content.appendChild(h('section', { class: 'k-me-section' },
    h('h2', { class: 'k-section-title' }, 'Color'),
    swatchRow
  ));
}

// (renderUpNext removed — Up Next is now rendered inline inside the
// player overlay in coop/js/player.js after ENDED, over the paused
// final frame. No standalone screen.)
