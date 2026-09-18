// Paginated rendering of one chapter at a time.
//
// The chapter document is loaded into an iframe (book scripts are stripped and
// blocked by CSP) and laid out with CSS columns, one column per page. Turning a page
// translates <body> sideways by the page width. Book styles are kept, but
// writing mode, fonts, colours and margins are overridden so every book reads
// the same way: horizontal text, the reader's own typography.

import { THEMES, FONTS } from './theme.js';
import { selectionPayload } from './textsel.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PAD_Y = 14;

function readerCss(cfg, W, H) {
  const t = THEMES[cfg.theme] || THEMES.paper;
  const font = (FONTS[cfg.font] || FONTS.mincho).css;
  const m = cfg.margin;
  return `
html, body, body * {
  writing-mode: horizontal-tb !important;
  -webkit-writing-mode: horizontal-tb !important;
  -epub-writing-mode: horizontal-tb !important;
}
html {
  margin: 0 !important; padding: 0 !important;
  width: ${W}px !important; height: ${H}px !important; min-height: 0 !important;
  overflow: hidden !important;
  background: ${t.bg} !important;
  font-size: ${cfg.fontSize}px !important;
  -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important;
  touch-action: manipulation;
}
body {
  margin: 0 !important;
  padding: ${PAD_Y}px ${m}px !important;
  box-sizing: border-box !important;
  width: ${W}px !important; height: ${H}px !important;
  min-height: 0 !important; max-width: none !important; max-height: none !important;
  overflow: visible !important;
  column-width: ${W - 2 * m}px !important;
  column-gap: ${2 * m}px !important;
  column-fill: auto !important;
  background: transparent !important;
  color: ${t.fg} !important;
  font-family: ${font} !important;
  line-height: ${cfg.lineHeight} !important;
  text-align: justify;
  line-break: strict;
  font-kerning: normal;
  -webkit-font-smoothing: antialiased;
}
body * {
  font-family: inherit !important;
  color: inherit !important;
  background-color: transparent !important;
  border-color: ${t.muted} !important;
  max-width: 100% !important;
}
p { orphans: 2; widows: 2; }
p, div, li, blockquote, h1, h2, h3, h4, h5, h6, table { overflow-x: clip; }
html.shiori-image-page body {
  column-width: auto !important; columns: auto !important;
  display: flex !important; flex-direction: column; align-items: center; justify-content: center;
}
html.shiori-image-page body > * { width: 100%; height: auto !important; margin: 0 !important; text-align: center; }
h1, h2, h3, h4, h5, h6 { line-height: 1.5 !important; break-after: avoid; letter-spacing: .04em; }
ruby rt { font-size: .5em; line-height: 1; opacity: .8; }
img, svg, video {
  max-width: 100% !important;
  max-height: ${H - 2 * PAD_Y}px !important;
  object-fit: contain;
  break-inside: avoid;
  -webkit-touch-callout: none;
}
svg { height: auto; }
div:has(> svg:only-child), div:has(> img:only-child) { text-align: center; break-inside: avoid; }
a, a * { text-decoration-color: ${t.muted} !important; }
::selection { background: ${t.sel}; }
::highlight(shiori-focus) { background-color: ${t.hl}; }
#shiori-end { display: inline-block; width: 1px; height: 1px; }
`;
}

export class Paginator {
  constructor(host, handlers) {
    this.host = host;
    this.h = handlers;
    this.page = 0;
    this.pages = 1;
    this.url = null;
    this.ready = false;
    this.iframe = document.createElement('iframe');
    this.iframe.className = 'page-frame';
    // WebKit only delivers our own event listeners to frames that allow scripts;
    // book scripts are still stripped and blocked by the frame's CSP.
    this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    this.iframe.setAttribute('scrolling', 'no');
    this.iframe.setAttribute('title', '正文');
    host.appendChild(this.iframe);

    this.touch = null;
    this.lastTouchEnd = 0;
    this.resizeTimer = 0;
    this.ro = new ResizeObserver(() => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.relayout(), 120);
    });
    this.ro.observe(host);
  }

  get doc() {
    return this.iframe.contentDocument;
  }

  get win() {
    return this.iframe.contentWindow;
  }

  size() {
    return { W: Math.round(this.host.clientWidth), H: Math.round(this.host.clientHeight) };
  }

  /** Load a chapter. `at` is 'start' | 'end' | { fraction } | { fragment }. */
  async open({ doc, xml }, cfg, at = 'start') {
    this.cfg = cfg;
    this.ready = false;
    const { W, H } = this.size();
    this.W = W;
    this.H = H;

    const head = doc.head || doc.documentElement.insertBefore(doc.createElementNS(XHTML_NS, 'head'), doc.body);
    head.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());
    const csp = doc.createElementNS(XHTML_NS, 'meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    csp.setAttribute('content', "script-src 'none'; object-src 'none'; base-uri 'none'");
    head.insertBefore(csp, head.firstChild);
    const style = doc.createElementNS(XHTML_NS, 'style');
    style.setAttribute('id', 'shiori-style');
    style.textContent = readerCss(cfg, W, H);
    head.appendChild(style);
    const html = doc.documentElement;
    if (!html.getAttribute('lang') && !html.getAttributeNS(XML_NS, 'lang')) html.setAttribute('lang', 'ja');
    const end = doc.createElementNS(XHTML_NS, 'span');
    end.setAttribute('id', 'shiori-end');
    doc.body.appendChild(end);

    const source = xml ? new XMLSerializer().serializeToString(doc) : `<!DOCTYPE html>\n${html.outerHTML}`;
    const url = URL.createObjectURL(new Blob([source], { type: xml ? 'application/xhtml+xml' : 'text/html' }));
    this.iframe.classList.add('loading');
    await new Promise((resolve) => {
      this.iframe.onload = resolve;
      this.iframe.src = url;
    });
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = url;

    this.attach();
    this.fixLayout();
    this.measure();
    this.ready = true;
    this.position(at);
    requestAnimationFrame(() => this.iframe.classList.remove('loading'));

    // Late layout changes: web fonts and images.
    this.doc.fonts?.ready.then(() => this.remeasure());
    this.doc.querySelectorAll('img').forEach((img) => {
      if (!img.complete) img.addEventListener('load', () => this.remeasure(), { once: true });
    });
  }

  position(at) {
    if (at === 'end') this.goTo(this.pages - 1);
    else if (at?.fragment) this.goTo(this.pageOf(this.doc.getElementById(at.fragment)) ?? 0);
    else if (at?.fraction != null) this.goTo(Math.round(at.fraction * this.pages));
    else this.goTo(0);
  }

  attach() {
    const d = this.doc;
    d.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
    d.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: true });
    d.addEventListener('touchcancel', () => (this.touch = null), { passive: true });
    d.addEventListener('mousedown', (e) => this.onMouseDown(e));
    d.addEventListener('mouseup', (e) => this.onMouseUp(e));
    d.addEventListener('click', (e) => this.onClick(e));
    d.addEventListener('keydown', (e) => this.h.onKey?.(e));
    d.addEventListener('selectionchange', () => {
      clearTimeout(this.selTimer);
      this.selTimer = setTimeout(() => this.h.onSelection?.(this.hasSelection()), 160);
    });
  }

  hasSelection() {
    const s = this.win?.getSelection();
    return !!s && !s.isCollapsed && s.toString().trim().length > 0;
  }

  clearSelection() {
    this.win?.getSelection()?.removeAllRanges();
  }

  payload() {
    return selectionPayload(this.win);
  }

  // Tap zones: left 30% back, right 30% forward, middle toggles the chrome.
  gesture(start, x, y, target) {
    const dx = x - start.x;
    const dy = y - start.y;
    const dt = Date.now() - start.t;
    if (start.hadSelection || this.hasSelection()) return;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) {
      if (dx < 0) this.h.onNext();
      else this.h.onPrev();
      return;
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 450) {
      if (target?.closest?.('a[href]')) return;
      const fx = x / this.W;
      if (fx < 0.3) this.h.onPrev();
      else if (fx > 0.7) this.h.onNext();
      else this.h.onTap();
    }
  }

  onTouchStart(e) {
    if (e.touches.length !== 1) {
      this.touch = null;
      return;
    }
    const t = e.touches[0];
    this.touch = { x: t.clientX, y: t.clientY, t: Date.now(), hadSelection: this.hasSelection() };
  }

  onTouchEnd(e) {
    this.lastTouchEnd = Date.now();
    const start = this.touch;
    this.touch = null;
    if (!start) return;
    const t = e.changedTouches[0];
    this.gesture(start, t.clientX, t.clientY, e.target);
  }

  // Mouse path for desktop browsers; ignores the compatibility mouse events
  // that mobile browsers synthesise after a touch.
  onMouseDown(e) {
    if (e.button !== 0 || Date.now() - this.lastTouchEnd < 1000) return;
    this.mouse = { x: e.clientX, y: e.clientY, t: Date.now(), hadSelection: this.hasSelection() };
  }

  onMouseUp(e) {
    const start = this.mouse;
    this.mouse = null;
    if (!start || Date.now() - this.lastTouchEnd < 1000) return;
    this.gesture(start, e.clientX, e.clientY, e.target);
  }

  onClick(e) {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    e.preventDefault();
    this.h.onLink?.(a.getAttribute('href'));
  }

  // ---------------------------------------------------------- layout

  /**
   * Adapt layouts made for wide screens: blocks pushed aside by margins wider
   * than a phone column (e.g. a centred ○ section mark set with margin-left:
   * 20em) get centred instead; pages holding a single image are centred.
   */
  fixLayout() {
    const d = this.doc;
    const w = this.win;
    const column = this.W - 2 * this.cfg.margin;
    for (const el of d.body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, blockquote, section, li')) {
      const cs = w.getComputedStyle(el);
      const side = ['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight'].reduce((a, k) => a + (parseFloat(cs[k]) || 0), 0);
      if (side > column * 0.5) {
        for (const prop of ['margin-left', 'margin-right', 'padding-left', 'padding-right']) el.style.setProperty(prop, '0', 'important');
        el.style.setProperty('text-align', 'center', 'important');
      }
    }
    const hasText = d.body.textContent.replace(/[\s　]/g, '').length > 0;
    const media = d.body.querySelectorAll('img, svg').length;
    d.documentElement.classList.toggle('shiori-image-page', !hasText && media === 1);
  }

  measure() {
    const body = this.doc.body;
    body.style.transition = 'none';
    body.style.transform = 'none';
    const end = this.doc.getElementById('shiori-end');
    let pages = Math.ceil((body.scrollWidth - 1) / this.W);
    if (end) {
      const r = end.getBoundingClientRect();
      pages = Math.floor(r.left / this.W) + 1;
    }
    this.pages = Math.max(1, pages || 1);
  }

  remeasure() {
    this.relayout(this.cfg);
  }

  pageOf(node) {
    if (!node) return null;
    const rect = node.getClientRects?.()[0] || node.getBoundingClientRect?.();
    if (!rect) return null;
    const shift = this.page * this.W;
    return Math.max(0, Math.min(this.pages - 1, Math.floor((rect.left + shift + 1) / this.W)));
  }

  relayout(cfg = this.cfg) {
    if (!this.ready || !this.doc?.body) return;
    const { W, H } = this.size();
    if (!W || !H) return;
    // Keep the first visible character on screen across font or size changes.
    const fraction = this.page / this.pages;
    const anchor = this.doc.caretRangeFromPoint?.(this.cfg.margin + 2, PAD_Y + 4);
    this.cfg = cfg;
    this.W = W;
    this.H = H;
    this.doc.getElementById('shiori-style').textContent = readerCss(cfg, W, H);
    this.fixLayout();
    this.measure();
    // measure() leaves body untransformed, so rects are in page-0 coordinates.
    const rect = anchor?.getClientRects?.()[0];
    const page = rect ? Math.floor((rect.left + 1) / W) : Math.round(fraction * this.pages);
    this.page = 0;
    this.goTo(page);
  }

  goTo(p, animate = false) {
    const body = this.doc?.body;
    if (!body) return;
    this.page = Math.max(0, Math.min(this.pages - 1, p));
    body.style.transition = animate ? 'transform 280ms cubic-bezier(.22,.8,.3,1)' : 'none';
    body.style.transform = `translate3d(${-this.page * this.W}px, 0, 0)`;
    this.h.onPage?.(this.page, this.pages);
  }

  next() {
    if (this.page >= this.pages - 1) return false;
    this.goTo(this.page + 1, true);
    return true;
  }

  prev() {
    if (this.page <= 0) return false;
    this.goTo(this.page - 1, true);
    return true;
  }

  /** Softly mark the text being studied (CSS Custom Highlight API). */
  highlight(range) {
    const w = this.win;
    if (!w?.CSS?.highlights || !w.Highlight) return;
    try {
      if (range) w.CSS.highlights.set('shiori-focus', new w.Highlight(range));
      else w.CSS.highlights.delete('shiori-focus');
    } catch {
      // Highlight API unavailable in this browser; the tutor still works.
    }
  }

  destroy() {
    this.ro.disconnect();
    clearTimeout(this.resizeTimer);
    clearTimeout(this.selTimer);
    if (this.url) URL.revokeObjectURL(this.url);
    this.iframe.remove();
  }
}
