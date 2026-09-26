// ------------------------------------------------------------------------
// coop/js/dom.js
//
// Rendering-agnostic DOM helpers shared by ui.js (parent screens) and
// kid.js (kid screens). No data access here.
// ------------------------------------------------------------------------

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'style' && typeof attrs[k] === 'object') {
      // Object.assign on el.style silently drops CSS custom properties
      // (`--accent`, `--tile-accent`, etc.) — you have to go through
      // setProperty. Split so both regular and custom props work.
      for (const [prop, val] of Object.entries(attrs[k])) {
        if (val == null || val === false) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof attrs[k] === 'function') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export const ICONS = {
  back:   '<path d="M15 18l-6-6 6-6"/>',
  home:   '<path d="M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-4v-7H10v7H6a2 2 0 0 1-2-2z"/>',
  lock:   '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus:   '<path d="M12 5v14M5 12h14"/>',
  gear:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash:  '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  play:   '<polygon points="5 3 19 12 5 21"/>',
  pause:  '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  grid:   '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'
};

export function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function confirmDialog(title, msg, onYes) {
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

export function loadingBlock(msg = 'Loading…') {
  return h('div', { class: 'empty-state' }, h('div', { class: 'big-emoji' }, '⏳'), h('p', {}, msg));
}
