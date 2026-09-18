// The shelf. The book being read is shown large at the top; every book
// stands below as a spine on a shelf, coloured after its cover and as thick
// as it is long. Books in progress carry a red bookmark ribbon.

import { db, requestPersistence } from './db.js';
import { importFile } from './book.js';
import { el, esc, icon, toast, openSheet, confirmSheet } from './ui.js';
import { openSettings } from './settings-view.js';

const SAMPLE = { url: './samples/ame-no-toshokan.epub', name: 'ame-no-toshokan.epub', title: '雨の図書館' };

// Spine colours for books without a cover image: [background, ink].
const PALETTE = [
  ['#3B4A5A', '#EDE6D8'], ['#34483A', '#E9E4D3'], ['#5A3A34', '#F0E4D8'], ['#383C58', '#E6E3EE'],
  ['#6B5A3A', '#F3EBDA'], ['#2F3438', '#E6E0D4'], ['#8A3B2E', '#F6E9DD'], ['#D9CFBC', '#2E2A25'],
];

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

function progressOf(book) {
  const p = book.progress?.percent;
  return p == null ? null : Math.max(0, Math.min(100, p));
}

const inProgress = (book) => {
  const p = progressOf(book);
  return p != null && p > 0 && p < 99.5;
};

/** Average colour of the cover, deepened into something that reads as cloth or card. */
async function coverTone(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 36;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 24, 36);
  const px = ctx.getImageData(0, 0, 24, 36).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const max = Math.max(px[i], px[i + 1], px[i + 2]);
    const min = Math.min(px[i], px[i + 1], px[i + 2]);
    // Colourful pixels count more than paper white and ink black.
    const w = 1 + ((max - min) / 255) * 4;
    r += px[i] * w; g += px[i + 1] * w; b += px[i + 2] * w; n += w;
  }
  const [h, s] = rgbToHsl(r / n, g / n, b / n);
  const bg = `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.55) * 100)}% 30%)`;
  return { bg, fg: '#F3ECDF' };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const spineHeight = (book) => 158 + (hash(book.id) % 5) * 12;

function spineStyle(book) {
  const total = (book.weights || []).reduce((a, b) => a + b, 0) || 3000;
  const width = Math.round(Math.max(34, Math.min(64, 30 + 12 * (Math.log10(total) - 3))));
  const height = spineHeight(book);
  const [bg, fg] = book.tone ? [book.tone.bg, book.tone.fg] : PALETTE[hash(book.title) % PALETTE.length];
  return `--w:${width}px;--h:${height}px;--bg:${bg};--fg:${fg}`;
}

export async function showLibrary(root, { openBook }) {
  const urls = [];
  root.innerHTML = '';
  const view = el(`<div class="library">
    <header class="lib-head">
      <span class="seal" aria-label="栞">栞</span>
      <div class="lib-actions">
        <button class="icon-btn" data-act="import" aria-label="匯入書籍">${icon('plus', 24)}</button>
        <button class="icon-btn" data-act="settings" aria-label="設定">${icon('settings', 23)}</button>
      </div>
    </header>
    <main class="lib-main"></main>
    <input type="file" multiple hidden />
  </div>`);
  root.appendChild(view);
  const main = view.querySelector('.lib-main');
  const picker = view.querySelector('input[type=file]');

  async function importFiles(files) {
    requestPersistence();
    let last = null;
    for (const file of files) {
      toast(`正在匯入「${file.name}」…`, 1500);
      try {
        last = await importFile(file);
      } catch (err) {
        console.error(err);
        toast(err.message || `無法匯入「${file.name}」`, 3500);
      }
    }
    await render();
    return last;
  }

  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (files.length) importFiles(files);
  });
  view.querySelector('[data-act="import"]').addEventListener('click', () => picker.click());
  view.querySelector('[data-act="settings"]').addEventListener('click', () => openSettings());

  async function openSample() {
    const res = await fetch(SAMPLE.url);
    const blob = await res.blob();
    const book = await importFiles([new File([blob], SAMPLE.name, { type: 'application/epub+zip' })]);
    if (book) openBook(book.id);
  }

  function coverHtml(book) {
    if (book.cover?.data) {
      const url = URL.createObjectURL(new Blob([book.cover.data], { type: book.cover.type }));
      urls.push(url);
      return `<img src="${url}" alt="" />`;
    }
    return `<div class="gen-cover" style="${spineStyle(book)}">
      <span class="gen-title">${esc(book.title)}</span>
      ${book.author ? `<span class="gen-author">${esc(book.author)}</span>` : ''}
    </div>`;
  }

  function heroHtml(book) {
    const p = progressOf(book);
    const label = p == null ? '開始閱讀' : p >= 99.5 ? '重讀一遍' : `繼續閱讀 · ${Math.max(1, Math.round(p))}%`;
    return `<section class="hero">
      <div class="hero-mark" aria-hidden="true">読</div>
      <button class="hero-cover" data-open="${book.id}" aria-label="開啟《${esc(book.title)}》">${coverHtml(book)}</button>
      <div class="hero-text">
        <h1 class="hero-title">${esc(book.title)}</h1>
        ${book.author ? `<p class="hero-author">${esc(book.author)}</p>` : ''}
      </div>
      <div class="hero-foot">
        <div class="hero-bar"><span style="width:${p ?? 0}%"></span></div>
        <button class="hero-go" data-open="${book.id}">${label}<span aria-hidden="true">→</span></button>
      </div>
    </section>`;
  }

  function spineHtml(book, i, all) {
    const lean = all.length > 2 && i === all.length - 1 ? ' lean' : '';
    const ribbon = inProgress(book) ? '<i class="ribbon" aria-hidden="true"></i>' : '';
    // Fit the title down the spine: shrink it, then give up the author's space if needed.
    const height = spineHeight(book);
    const chars = [...book.title].length;
    const fits = (room) => Math.floor(room / (chars * 1.1));
    let fs = Math.min(14, fits(height - 32 - 56));
    let author = !!book.author;
    if (fs < 11) {
      author = false;
      fs = Math.max(10, Math.min(14, fits(height - 32)));
    }
    return `<button class="slot${lean}" data-id="${book.id}" aria-label="《${esc(book.title)}》">
      <span class="spine" style="${spineStyle(book)};--fs:${fs}px">
        <span class="spine-title">${esc(book.title)}</span>
        ${author ? `<span class="spine-author">${esc(book.author)}</span>` : ''}
        ${ribbon}
      </span>
    </button>`;
  }

  async function render() {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const books = (await db.allBooks()).sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt));
    if (!books.length) {
      main.innerHTML = `<div class="empty">
        <div class="empty-art" aria-hidden="true"><span>栞</span><i class="ribbon"></i></div>
        <p class="empty-title">把第一本書放上書架</p>
        <p class="empty-hint">匯入沒有 DRM 的 EPUB，或 TXT 文字檔（支援青空文庫的注音格式）。</p>
        <button class="btn primary" data-act="import-empty">匯入書籍</button>
        <button class="btn ghost" data-act="sample">開啟範例《${SAMPLE.title}》</button>
      </div>`;
      main.querySelector('[data-act="import-empty"]').addEventListener('click', () => picker.click());
      main.querySelector('[data-act="sample"]').addEventListener('click', openSample);
      return;
    }

    // Shelf order stays put (by date added) so books don't jump around.
    const shelf = [...books].sort((a, b) => a.addedAt - b.addedAt);
    main.innerHTML = `${heroHtml(books[0])}
      <div class="shelf">${shelf.map(spineHtml).join('')}</div>`;

    main.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openBook(b.dataset.open)));
    main.querySelectorAll('.slot').forEach((slot) => {
      const book = shelf.find((b) => b.id === slot.dataset.id);
      bindPress(slot, () => openBook(book.id), () => bookActions(book));
    });

    // Derive spine colours from covers once, then remember them.
    for (const book of shelf.filter((b) => b.cover?.data && !b.tone)) {
      try {
        const tone = await coverTone(new Blob([book.cover.data], { type: book.cover.type }));
        const fresh = await db.getBook(book.id);
        if (!fresh) continue;
        await db.putBook({ ...fresh, tone });
        book.tone = tone;
        const spine = main.querySelector(`.slot[data-id="${book.id}"] .spine`);
        if (spine) spine.setAttribute('style', spineStyle(book));
      } catch {
        // Undecodable cover: the palette colour stays.
      }
    }
  }

  async function bookActions(book) {
    const s = openSheet({
      className: 'actions',
      html: `<div class="action-list">
        <p class="action-head">${esc(book.title)}${book.author ? `<small>${esc(book.author)}</small>` : ''}</p>
        <button class="action" data-a="open">開始閱讀</button>
        <button class="action" data-a="edit">編輯書名和作者</button>
        <button class="action danger" data-a="delete">從書架移除</button>
      </div>`,
    });
    s.body.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      s.close();
      if (a === 'open') {
        openBook(book.id);
      } else if (a === 'delete') {
        const ok = await confirmSheet({ title: `移除《${book.title}》？`, message: '閱讀進度也會一起刪除。', action: '移除', destructive: true });
        if (ok) {
          await db.deleteBook(book.id);
          render();
        }
      } else if (a === 'edit') {
        editMeta(book);
      }
    });
  }

  function editMeta(book) {
    const s = openSheet({
      className: 'edit',
      html: `<h2 class="sheet-title">編輯書籍資訊</h2>
        <form class="form">
          <label class="field"><span class="label">書名</span><input name="title" value="${esc(book.title)}" /></label>
          <label class="field"><span class="label">作者</span><input name="author" value="${esc(book.author)}" /></label>
          <button type="button" class="link swap">交換書名和作者</button>
          <button class="btn block primary" type="submit">儲存</button>
        </form>`,
    });
    const form = s.body.querySelector('form');
    const title = form.querySelector('[name="title"]');
    const author = form.querySelector('[name="author"]');
    form.querySelector('.swap').addEventListener('click', () => {
      [title.value, author.value] = [author.value, title.value];
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fresh = await db.getBook(book.id);
      await db.putBook({ ...fresh, title: title.value.trim() || fresh.title, author: author.value.trim() });
      s.close();
      render();
    });
  }

  await render();
  return {
    destroy() {
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

/** Tap opens; long-press (or right-click) shows actions. */
function bindPress(node, onTap, onLong) {
  let timer = 0;
  let fired = false;
  let start = null;
  node.addEventListener('pointerdown', (e) => {
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      fired = true;
      navigator.vibrate?.(10);
      onLong();
    }, 520);
  });
  node.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clearTimeout(timer);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => node.addEventListener(t, () => clearTimeout(timer)));
  node.addEventListener('click', (e) => {
    if (fired) {
      e.preventDefault();
      return;
    }
    onTap();
  });
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    if (!fired) onLong();
    fired = true;
  });
}
