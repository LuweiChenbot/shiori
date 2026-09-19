// Small UI building blocks: element helper, icons, bottom sheets, toasts.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PATHS = {
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  toc: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.6" cy="12" r=".9" fill="currentColor"/><circle cx="4.6" cy="17.5" r=".9" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  send: '<path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  library: '<rect x="3.5" y="4" width="4.5" height="16" rx="1"/><rect x="9.5" y="4" width="4.5" height="16" rx="1"/><path d="m15.6 5.4 3.6-.9 3.3 15-3.6.9z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

export function icon(name, size = 22) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

let openSheets = 0;
export const sheetOpen = () => openSheets > 0;

// Areas a downward drag can start from without fighting the content's own scrolling.
const HANDLE = '.sheet-grip, .sheet-title, .tutor-head';
const SCROLLERS = '.tutor-scroll, .sheet-body';

/**
 * Bottom sheet, modelled on iOS: it slides up without dimming the page, follows
 * the finger when dragged down (from its handle, or from content already
 * scrolled to the top) and closes on a long enough drag or a quick flick.
 * `expandable` sheets can also be pulled up to nearly full height.
 */
export function openSheet({ html, className = '', expandable = false, onClose }) {
  // Transparent: it only catches taps outside the sheet. Dimming the page
  // makes iOS re-tint the status bar, which flickers.
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el(`<section class="sheet ${className}" role="dialog" aria-modal="true">
    <div class="sheet-grip"><span></span></div>
    <div class="sheet-body">${html}</div>
  </section>`);
  document.body.append(backdrop, sheet);
  openSheets++;
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openSheets--;
    sheet.style.transition = '';
    sheet.style.transform = '';
    sheet.classList.add('closing');
    sheet.classList.remove('open');
    setTimeout(() => {
      sheet.remove();
      backdrop.remove();
    }, 380);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);

  let drag = null;
  const begin = (y, target) => {
    if (closed || target.closest('input, textarea, select')) return;
    drag = {
      y0: y, y, t: performance.now(), v: 0, dy: 0, state: 'pending',
      handle: !!target.closest(HANDLE), scroller: target.closest(SCROLLERS),
    };
  };
  const move = (y, event) => {
    if (!drag || drag.state === 'ignored') return;
    const dy = y - drag.y0;
    if (drag.state === 'pending') {
      if (Math.abs(dy) < 6) return;
      const atTop = !drag.scroller || drag.scroller.scrollTop <= 0;
      const down = dy > 0 && (drag.handle || atTop);
      const up = dy < 0 && expandable && drag.handle && !sheet.classList.contains('tall');
      if (!down && !up) {
        drag.state = 'ignored';
        return;
      }
      drag.state = 'dragging';
      drag.y0 = y; // start tracking from here so the sheet doesn't jump
      sheet.style.transition = 'none';
    }
    if (event?.cancelable) event.preventDefault();
    const now = performance.now();
    drag.v = (y - drag.y) / Math.max(1, now - drag.t);
    drag.y = y;
    drag.t = now;
    drag.dy = y - drag.y0;
    // Downwards the sheet follows the finger; upwards it resists.
    const offset = drag.dy > 0 ? drag.dy : -Math.sqrt(-drag.dy) * 4;
    sheet.style.transform = `translateY(${offset}px)`;
  };
  const end = () => {
    if (!drag) return;
    const { state, dy, v, t } = drag;
    drag = null;
    if (state !== 'dragging') return;
    const flick = performance.now() - t < 80 ? v : 0;
    sheet.style.transition = '';
    if (dy > 0 && (dy > Math.min(140, sheet.offsetHeight * 0.3) || flick > 0.5)) {
      close();
      return;
    }
    sheet.style.transform = '';
    if (dy < -30 || flick < -0.5) sheet.classList.add('tall');
  };

  // Touch drives the gesture on phones (it can stop the content from scrolling);
  // the mouse can use the handle on desktop.
  sheet.addEventListener('touchstart', (e) => e.touches.length === 1 && begin(e.touches[0].clientY, e.target), { passive: true });
  sheet.addEventListener('touchmove', (e) => move(e.touches[0].clientY, e), { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
  const grip = sheet.querySelector('.sheet-grip');
  grip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    begin(e.clientY, grip);
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && move(e.clientY));
  grip.addEventListener('pointerup', (e) => e.pointerType === 'mouse' && end());
  if (expandable) grip.addEventListener('click', () => sheet.classList.toggle('tall'));

  return { sheet, body: sheet.querySelector('.sheet-body'), close };
}

export function toast(message, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast" role="status">${esc(message)}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function confirmSheet({ title, message = '', action, destructive = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      className: 'confirm',
      html: `<div class="confirm-body">
        <p class="confirm-title">${esc(title)}</p>
        ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
        <button class="btn block ${destructive ? 'danger' : 'primary'}" data-ok>${esc(action)}</button>
        <button class="btn block ghost" data-cancel>取消</button>
      </div>`,
      onClose: () => !answered && resolve(false),
    });
    s.body.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      resolve(true);
      s.close();
    });
    s.body.querySelector('[data-cancel]').addEventListener('click', () => s.close());
  });
}
