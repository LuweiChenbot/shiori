// The reading screen. Chrome (top and bottom bars) stays hidden until the
// middle of the page is tapped; the page itself is only text.
//
// The screen exists the moment it is opened; the book is read and the first
// page laid out behind it. A slow or damaged book therefore never leaves a tap
// without a response, and the morph from the cover can start at once.

import { db } from './db.js';
import { loadBook } from './book.js';
import { Paginator } from './paginator.js';
import { settings, activeModel } from './settings.js';
import { THEMES, FONTS, LINE_HEIGHTS, applyTheme } from './theme.js';
import { el, esc, icon, openSheet, sheetOpen } from './ui.js';
import { openTutor } from './tutor.js';
import { openSettings } from './settings-view.js';
import { Furigana } from './furigana.js';

const FURIGANA = [
  { label: '關', value: 'off' },
  { label: '難詞', value: 'hard' },
  { label: '全部', value: 'all' },
];

const MARGINS = [
  { label: '窄', value: 16 },
  { label: '中', value: 26 },
  { label: '寬', value: 38 },
];

export function openReader(root, id, { onExit }) {
  root.innerHTML = '';
  const view = el(`<div class="reader">
    <div class="rd-head"><span class="rd-chapter"></span></div>
    <div class="rd-page"></div>
    <div class="rd-foot"><span class="rd-pageno"></span><span class="rd-status" role="status"></span><span class="rd-percent"></span></div>
    <div class="rd-error" hidden>
      <p class="rd-error-msg"></p>
      <div class="rd-error-actions">
        <button class="btn small primary" data-act="retry">重試</button>
        <button class="btn small ghost" data-act="leave">返回書庫</button>
      </div>
    </div>
    <div class="sel-bar" aria-hidden="true">
      <button data-mode="explain">講解</button><span class="sep"></span><button data-mode="translate">翻譯</button>
    </div>
    <header class="rd-top">
      <button class="icon-btn" data-act="back" aria-label="返回書庫">${icon('back', 24)}</button>
      <div class="rd-title"></div>
      <span class="rd-spacer" aria-hidden="true"></span>
    </header>
    <footer class="rd-bottom">
      <button class="icon-btn" data-act="toc" aria-label="目錄">${icon('toc', 23)}</button>
      <button class="icon-btn aa" data-act="aa" aria-label="排版">Aa</button>
    </footer>
  </div>`);
  root.appendChild(view);
  const $ = (s) => view.querySelector(s);
  const selBar = $('.sel-bar');

  let dead = false;
  let record = null;
  let book = null;
  let weights = [];
  let total = 1;
  let before = [];
  let cur = 0;
  let curPath = '';
  let loading = false;
  let tutorOpen = false;
  let payload = null;
  let progress = null;

  const chapterLabel = (i = cur) => {
    let label = '';
    for (const e of book?.toc || []) if (e.spine <= i) label = e.label;
    return label;
  };

  const percentAt = (i, fraction) => (weights.length ? (100 * (before[i] + fraction * weights[i])) / total : 0);

  // ---------------------------------------------------------- persistence

  let saveTimer = 0;
  const flush = async () => {
    clearTimeout(saveTimer);
    if (!progress || !record) return;
    const fresh = (await db.getBook(id)) || record;
    await db.putBook({ ...fresh, progress, openedAt: Date.now() });
  };
  const onHide = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onHide);

  // ---------------------------------------------------------- in-place states

  const setStatus = (text) => {
    $('.rd-status').textContent = text || '';
  };

  let retry = null;
  function showError(message, again) {
    retry = again;
    $('.rd-error-msg').textContent = message;
    $('[data-act="retry"]').hidden = !again;
    $('.rd-error').hidden = false;
    toggleChrome(true);
  }
  const hideError = () => {
    retry = null;
    $('.rd-error').hidden = true;
  };
  $('[data-act="retry"]').addEventListener('click', () => retry?.());
  $('[data-act="leave"]').addEventListener('click', () => onExit());

  // ---------------------------------------------------------- selection bar

  // The bar sits just below the selection, tied to the text it acts on. iOS puts
  // its own Copy / Look Up callout above a selection (below it only when there
  // is no room above), so this stays out of that spot: if the selection is high
  // on the page, or the space below is short, the bar rests at the bottom.
  function placeSelBar() {
    selBar.classList.remove('anchored');
    const r = pag.selectionRect();
    if (!r) return;
    const width = selBar.offsetWidth || 150;
    const height = selBar.offsetHeight || 46;
    const limit = $('.rd-foot').getBoundingClientRect().top;
    const y = r.last.bottom + 34; // clear of the selection handle
    if (r.first.top < 110 || y + height > limit) return;
    const x = Math.max(12 + width / 2, Math.min(innerWidth - 12 - width / 2, (r.box.left + r.box.right) / 2));
    selBar.style.setProperty('--sx', `${x}px`);
    selBar.style.setProperty('--sy', `${y}px`);
    selBar.classList.add('anchored');
  }

  function setSelBar(p) {
    if (p) placeSelBar();
    selBar.classList.toggle('on', !!p);
    selBar.setAttribute('aria-hidden', String(!p));
  }

  // ---------------------------------------------------------- paging

  let furigana = null; // created right after the paginator it reads from
  const pag = new Paginator($('.rd-page'), {
    onPage(page, pages) {
      const done = (page + 1) / pages;
      const percent = percentAt(cur, done);
      progress = { spine: cur, fraction: page / pages, percent };
      $('.rd-pageno').textContent = pages > 1 ? `${page + 1} / ${pages}` : '';
      $('.rd-percent').textContent = `${Math.min(100, Math.round(percent))}%`;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 500);
      furigana?.schedule();
      if (payload) placeSelBar();
    },
    onNext: next,
    onPrev: prev,
    onTap: () => toggleChrome(),
    onSelection(has) {
      if (tutorOpen) return;
      payload = has ? pag.payload() : null;
      setSelBar(payload);
      if (payload) toggleChrome(false);
    },
    onLink(href) {
      const target = book?.resolve(curPath, href);
      if (target) go(target.spine, target.fragment ? { fragment: target.fragment } : 'start');
      else if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
    },
    onKey,
  });
  furigana = new Furigana(pag, { onStatus: setStatus });

  /** Show chapter i. `dir` is 1 when reading on into it, -1 when going back. */
  async function go(i, at, dir = 0) {
    if (!book) return;
    if (i < 0 || i >= book.spine.length) {
      // The first or last page: the page springs back, which says "no further".
      pag.goTo(pag.page, true);
      return;
    }
    loading = true;
    hideError();
    try {
      const chapter = await book.chapter(i);
      if (dead) return;
      cur = i;
      curPath = chapter.path;
      payload = null;
      setSelBar(null);
      await pag.open(chapter, settings.get().reader, at, dir);
      if (dead) return;
      $('.rd-chapter').textContent = chapterLabel() || record.title;
      furigana.schedule();
    } catch (err) {
      console.error(err);
      if (!dead) showError(`這一章無法顯示：${err.message}`, () => go(i, at, dir));
    } finally {
      loading = false;
    }
  }

  function next() {
    if (loading) return;
    toggleChrome(false);
    if (!pag.next()) go(cur + 1, 'start', 1);
  }

  function prev() {
    if (loading) return;
    toggleChrome(false);
    if (!pag.prev()) go(cur - 1, 'end', -1);
  }

  function onKey(e) {
    if (sheetOpen() || e.target.closest?.('input, textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      next();
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      prev();
    } else if (e.key === 'Escape') {
      toggleChrome(false);
    }
  }
  document.addEventListener('keydown', onKey);

  // ---------------------------------------------------------- chrome

  function toggleChrome(force) {
    const on = force ?? !view.classList.contains('chrome');
    view.classList.toggle('chrome', on);
  }

  $('[data-act="back"]').addEventListener('click', async () => {
    await flush();
    onExit();
  });
  $('[data-act="toc"]').addEventListener('click', openToc);
  $('[data-act="aa"]').addEventListener('click', openAa);

  function openToc() {
    if (!book) return;
    toggleChrome(false);
    const entries = book.toc.length
      ? book.toc
      : book.spine.map((_, i) => ({ label: `第 ${i + 1} 部分`, spine: i, fragment: '', depth: 0 }));
    const currentLabel = chapterLabel();
    const s = openSheet({
      className: 'toc',
      html: `<h2 class="sheet-title">目錄</h2>
        <ol class="toc-list">${entries.map((e, n) => `
          <li><button data-n="${n}" class="d${Math.min(e.depth, 3)}${e.spine === cur && e.label === currentLabel ? ' on' : ''}">
            <span>${esc(e.label)}</span><small>${Math.round(percentAt(e.spine, 0))}%</small>
          </button></li>`).join('')}
        </ol>`,
    });
    s.body.querySelector('.on')?.scrollIntoView({ block: 'center' });
    s.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      const entry = entries[+b.dataset.n];
      s.close();
      go(entry.spine, entry.fragment ? { fragment: entry.fragment } : 'start');
    });
  }

  function openAa() {
    toggleChrome(false);
    const s = openSheet({
      className: 'aa-sheet',
      html: `<div class="aa-panel">
        <div class="aa-row">
          <button class="aa-btn" data-size="-1" aria-label="縮小字級"><span style="font-size:14px">A</span></button>
          <span class="aa-size"></span>
          <button class="aa-btn" data-size="1" aria-label="放大字級"><span style="font-size:22px">A</span></button>
        </div>
        <div class="aa-row themes">${Object.entries(THEMES).map(([k, t]) =>
          `<button class="swatch" data-theme="${k}" style="--sw-bg:${t.bg};--sw-fg:${t.fg}" aria-label="${t.label}">${t.label}</button>`).join('')}</div>
        <div class="aa-row"><span class="aa-label">字體</span><div class="seg">${Object.entries(FONTS).map(([k, f]) =>
          `<button data-font="${k}" style="font-family:${f.css.replace(/"/g, "'")}">${f.label}</button>`).join('')}</div></div>
        <div class="aa-row"><span class="aa-label">行距</span><div class="seg">${LINE_HEIGHTS.map((l) =>
          `<button data-lh="${l.value}">${l.label}</button>`).join('')}</div></div>
        <div class="aa-row"><span class="aa-label">注音</span><div class="seg">${FURIGANA.map((f) =>
          `<button data-furigana="${f.value}">${f.label}</button>`).join('')}</div></div>
        <p class="aa-note" hidden>注音需要先在「設定」填入 API Key。</p>
        <div class="aa-row"><span class="aa-label">頁邊距</span><div class="seg">${MARGINS.map((m) =>
          `<button data-margin="${m.value}">${m.label}</button>`).join('')}</div></div>
      </div>`,
    });
    const sync = () => {
      const r = settings.get().reader;
      s.body.querySelector('.aa-size').textContent = r.fontSize;
      s.body.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === r.theme));
      s.body.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('on', b.dataset.font === r.font));
      s.body.querySelectorAll('[data-lh]').forEach((b) => b.classList.toggle('on', +b.dataset.lh === r.lineHeight));
      s.body.querySelectorAll('[data-margin]').forEach((b) => b.classList.toggle('on', +b.dataset.margin === r.margin));
      s.body.querySelectorAll('[data-furigana]').forEach((b) => b.classList.toggle('on', b.dataset.furigana === (r.furigana || 'off')));
      s.body.querySelector('.aa-note').hidden = (r.furigana || 'off') === 'off' || !!activeModel().apiKey;
    };
    s.body.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const r = settings.get().reader;
      if (b.dataset.size) settings.update({ reader: { fontSize: Math.max(14, Math.min(30, r.fontSize + +b.dataset.size)) } });
      if (b.dataset.theme) settings.update({ reader: { theme: b.dataset.theme } });
      if (b.dataset.font) settings.update({ reader: { font: b.dataset.font } });
      if (b.dataset.lh) settings.update({ reader: { lineHeight: +b.dataset.lh } });
      if (b.dataset.margin) settings.update({ reader: { margin: +b.dataset.margin } });
      if (b.dataset.furigana) settings.update({ reader: { furigana: b.dataset.furigana } });
      sync();
    });
    sync();
  }

  const unsubscribe = settings.subscribe((cfg) => {
    applyTheme(cfg.reader.theme);
    pag.applyConfig(cfg.reader);
    furigana?.settingsChanged();
  });

  // ---------------------------------------------------------- tutor

  function startTutor(mode) {
    if (!payload) return;
    const p = payload;
    tutorOpen = true;
    setSelBar(null);
    pag.clearSelection();
    const label = chapterLabel();
    openTutor({
      payload: p,
      mode,
      source: `《${record.title}》${label && label !== record.title ? ` · ${label}` : ''}`,
      onFocus: (range) => pag.highlight(range),
      onClose: () => {
        tutorOpen = false;
        payload = null;
        pag.highlight(null);
      },
      onOpenSettings: openSettings,
    });
  }
  // pointerdown, not click: on touch devices tapping outside the page can clear
  // the selection before a click would arrive.
  selBar.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startTutor(b.dataset.mode);
  }));

  // ---------------------------------------------------------- start

  if (import.meta.env.DEV) window.__reader = { pag, go, get book() { return book; } };

  (async () => {
    try {
      record = await db.getBook(id);
      if (dead) return;
      if (!record) {
        onExit();
        return;
      }
      $('.rd-title').textContent = record.title;
      progress = record.progress;
      book = await loadBook(record);
      if (dead) {
        book.destroy();
        book = null;
        return;
      }
      weights = record.weights?.length === book.spine.length ? record.weights : await book.weights();
      total = weights.reduce((a, b) => a + b, 0) || 1;
      before = weights.map((_, i) => weights.slice(0, i).reduce((a, b) => a + b, 0));
      if (progress && progress.spine < book.spine.length) await go(progress.spine, { fraction: progress.fraction });
      else await go(0, 'start');
    } catch (err) {
      console.error(err);
      if (!dead) showError(`無法開啟這本書：${err.message}`, null);
    }
  })();

  return {
    async destroy() {
      dead = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      unsubscribe();
      await flush();
      pag.destroy();
      book?.destroy();
    },
  };
}
