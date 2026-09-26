// ------------------------------------------------------------------------
// coop/js/kidBlock.js
//
// Quick "block this video for every kid" gesture. Long-press (~550 ms)
// on a video tile, the Home hero, an Up Next tile, or inside the
// player itself → sheet asks for confirmation. Requires the parent PIN
// (cached in sessionStorage from earlier parent-mode sign-in; prompted
// once here if not cached).
//
// The write goes through the existing parent-write endpoint, using the
// new hide_video_everywhere op. Nothing here writes directly to
// Supabase.
// ------------------------------------------------------------------------

import { h, icon, ICONS, toast } from './dom.js';
import * as writer from './writer.js';

// Attach a long-press handler to an element. Handles touch, mouse, and
// desktop right-click. Cancels on move > 8 px. Suppresses the trailing
// click when a long-press fires so the tile's normal action doesn't
// also run.
export function attachLongPress(el, callback, opts = {}) {
  const DELAY = opts.delay || 550;
  let timer = null;
  let fired = false;
  let startX = 0, startY = 0;

  const cancel = () => { clearTimeout(timer); timer = null; };
  const start = (evt) => {
    fired = false;
    const t = evt.touches ? evt.touches[0] : evt;
    startX = t.clientX; startY = t.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      callback(evt);
    }, DELAY);
  };
  const move = (evt) => {
    if (timer == null) return;
    const t = evt.touches ? evt.touches[0] : evt;
    if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) cancel();
  };
  const end = () => cancel();
  // Capture-phase click swallower: if long-press already fired, drop
  // the trailing click before the element's own onclick handler sees it.
  const clickIfFired = (evt) => {
    if (fired) {
      evt.preventDefault();
      evt.stopPropagation();
      fired = false;   // reset for next interaction
    }
  };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  el.addEventListener('mousedown', start);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', end);
  el.addEventListener('click', clickIfFired, true);
  // Desktop right-click: same menu.
  el.addEventListener('contextmenu', (evt) => {
    evt.preventDefault();
    fired = true;
    callback(evt);
  });

  // Stop iOS text-selection popup + link callout on long-press.
  el.style.webkitTouchCallout = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.userSelect = 'none';
}

// Show a bottom-sheet asking to confirm blocking. If parent PIN isn't
// cached, includes a numpad. onBlocked runs on success.
export function openBlockSheet(video, onBlocked) {
  if (!video || !video.id) return;
  const backdrop = h('div', {
    class: 'k-block-backdrop',
    onclick: (e) => { if (e.target === backdrop) close(); }
  });
  let sheet;
  function close() { backdrop.remove(); if (sheet) sheet.remove(); }

  const title = h('div', { class: 'k-block-title' }, 'Block this video?');
  const sub = h('div', { class: 'k-block-sub' }, video.title || '(no title)');
  const note = h('div', { class: 'k-block-note' }, 'It will be hidden from every kid.');

  const bottom = h('div', { class: 'k-block-actions' });
  const cancelBtn = h('button', { class: 'k-btn k-btn-ghost', type: 'button', onclick: close }, 'Cancel');
  const blockBtn = h('button', { class: 'k-btn k-btn-block', type: 'button' }, 'Block');
  bottom.append(cancelBtn, blockBtn);

  async function doBlock() {
    blockBtn.disabled = true; blockBtn.textContent = '…';
    try {
      await writer.hideVideoEverywhere(video.id);
      toast('Blocked');
      close();
      if (onBlocked) onBlocked();
    } catch (e) {
      blockBtn.disabled = false; blockBtn.textContent = 'Block';
      if (e.status === 401) {
        writer.clearParentPin();
        toast('Wrong parent code');
        // Re-open with numpad next time.
        close();
        setTimeout(() => openBlockSheet(video, onBlocked), 60);
      } else {
        toast('Error: ' + (e.message || e));
      }
    }
  }
  blockBtn.addEventListener('click', doBlock);

  const contents = [title, sub, note];

  if (!writer.hasCachedPin()) {
    // Inline PIN entry.
    let pin = '';
    const display = h('div', { class: 'k-pin-display', style: { margin: '18px 0 6px' } });
    const drawDots = () => {
      display.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        display.appendChild(h('div', { class: 'k-pin-dot' + (i < pin.length ? ' filled' : '') }));
      }
    };
    drawDots();
    const numpad = h('div', { class: 'k-numpad', style: { margin: '0 auto', maxWidth: '260px' } });
    const press = async (d) => {
      if (pin.length >= 4) return;
      pin += d; drawDots();
      if (pin.length === 4) {
        writer.setParentPin(pin);
        try {
          await writer.verifyParentPin();
          // PIN good — now do the block.
          doBlock();
        } catch (e) {
          writer.clearParentPin();
          pin = ''; drawDots();
          display.classList.add('k-pin-shake');
          setTimeout(() => display.classList.remove('k-pin-shake'), 400);
          if (e.status === 401 && e.retryAfter) {
            const mins = Math.ceil(Number(e.retryAfter) / 60);
            toast(`Locked ${mins} min`);
          } else toast('Wrong code');
        }
      }
    };
    for (let n = 1; n <= 9; n++) numpad.appendChild(h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
    numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = ''; drawDots(); } }, 'Clear'));
    numpad.appendChild(h('button', { type: 'button', onclick: () => press('0') }, '0'));
    numpad.appendChild(h('button', { type: 'button', class: 'action', onclick: () => { pin = pin.slice(0, -1); drawDots(); }, html: '⌫' }));

    contents.push(
      h('div', { class: 'k-block-pin-label' }, 'Parent code'),
      display,
      numpad,
      h('div', { class: 'k-block-actions' }, cancelBtn)
    );
  } else {
    contents.push(bottom);
  }

  sheet = h('div', { class: 'k-block-sheet', role: 'dialog', 'aria-modal': 'true' }, ...contents);
  document.body.append(backdrop, sheet);
}
