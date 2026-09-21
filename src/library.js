// The library. The book you are reading comes first; every book follows as a
// plain list. A tab bar at the bottom switches between the library and search,
// and opens settings. Switching is synchronous (books are held in memory) so a
// tab never shows a half-updated page.

import { db, requestPersistence } from './db.js';
import { importFile } from './book.js';
import { el, esc, icon, openSheet, confirmSheet } from './ui.js';
import { openSettings } from './settings-view.js';

const SAMPLE = { url: './samples/ame-no-toshokan.epub', name: 'ame-no-toshokan.epub', title: '雨の図書館' };

function progressOf(book) {
  const p = book.progress?.percent;
  return p == null ? null : Math.max(0, Math.min(100, p));
}

function lastRead(ts) {
  if (!ts) return '尚未開始';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const then = new Date(ts);
  const days = Math.round((day(new Date()) - day(then)) / 864e5);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return `${then.getMonth() + 1}月${then.getDate()}日`;
}

function progressHtml(book) {
  const p = progressOf(book);
  if (p == null) return '<span class="meta">未讀</span>';
  const pct = p >= 99.5 ? '讀完' : `${Math.max(1, Math.round(p))}%`;
  return `<span class="progress"><span class="bar"><i style="width:${p}%"></i></span><span class="pct">${pct}</span></span>`;
}

export async function showLibrary(root, { openBook }) {
  const urls = [];
  let books = [];
  let imports = []; // books being imported, shown as rows in the list itself
  let importSeq = 0;
  let mode = 'library';
  let query = '';
  const scrollY = { library: 0, search: 0 };

  root.innerHTML = '';
  const view = el(`<div class="library">
    <header class="lib-head">
      <h1 class="lib-title">書庫</h1>
      <button class="icon-btn" data-act="import" aria-label="匯入書籍">${icon('plus', 26)}</button>
    </header>
    <form class="lib-search" role="search" hidden>
      <label class="search-field">${icon('search', 17)}<input type="search" placeholder="書名或作者" enterkeyhint="search" aria-label="搜尋書名或作者" /></label>
    </form>
    <main class="lib-main"></main>
    <nav class="tabbar" aria-label="主選單">
      <button data-tab="library">${icon('library', 24)}<span>書庫</span></button>
      <button data-tab="search">${icon('search', 24)}<span>搜尋</span></button>
      <button data-tab="settings">${icon('gear', 24)}<span>設定</span></button>
    </nav>
    <input type="file" multiple hidden />
  </div>`);
  root.appendChild(view);
  const $ = (s) => view.querySelector(s);
  const main = $('.lib-main');
  const picker = $('input[type=file]');
  const searchForm = $('.lib-search');
  const searchInput = searchForm.querySelector('input');

  async function importFiles(files) {
    requestPersistence();
    let last = null;
    for (const file of files) {
      const item = { key: ++importSeq, name: file.name, state: 'working', message: '' };
      imports.push(item);
      render();
      try {
        last = await importFile(file);
        imports = imports.filter((i) => i !== item);
      } catch (err) {
        console.error(err);
        item.state = 'error';
        item.message = err.message || '無法匯入這個檔案';
      }
      await refresh();
    }
    return last;
  }

  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (files.length) importFiles(files);
  });
  $('[data-act="import"]').addEventListener('click', () => picker.click());

  function setMode(next) {
    scrollY[mode] = window.scrollY;
    mode = next;
    $('.lib-title').textContent = mode === 'search' ? '搜尋' : '書庫';
    $('[data-act="import"]').style.visibility = mode === 'search' ? 'hidden' : '';
    searchForm.hidden = mode !== 'search';
    view.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === mode;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (mode !== 'search') {
      query = '';
      searchInput.value = '';
    }
    render();
    window.scrollTo(0, scrollY[mode]);
    if (mode === 'search') searchInput.focus({ preventScroll: true });
  }

  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.tab === 'settings') openSettings();
    else if (b.dataset.tab !== mode) setMode(b.dataset.tab);
  }));
  searchInput.addEventListener('input', () => {
    query = searchInput.value.trim().toLowerCase();
    render();
  });
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchInput.blur();
  });

  async function openSample() {
    let file;
    try {
      const res = await fetch(SAMPLE.url);
      if (!res.ok) throw new Error(String(res.status));
      file = new File([await res.blob()], SAMPLE.name, { type: 'application/epub+zip' });
    } catch {
      imports.push({ key: ++importSeq, name: SAMPLE.title, state: 'error', message: '無法載入範例，請檢查網路' });
      render();
      return;
    }
    const book = await importFiles([file]);
    if (book) openBook(book.id);
  }

  // The current book's cover carries the view-transition name, so opening
  // or closing it morphs between the cover and the page.
  function coverHtml(book, size) {
    const vt = size === 'lg' ? ' style="view-transition-name: book"' : '';
    if (book.cover?.data) {
      const url = URL.createObjectURL(new Blob([book.cover.data], { type: book.cover.type }));
      urls.push(url);
      return `<span class="cover ${size}"${vt}><img src="${url}" alt="" /></span>`;
    }
    return `<span class="cover ${size} plain"${vt}>
      <span class="plain-title">${esc(book.title)}</span>
      ${book.author ? `<span class="plain-author">${esc(book.author)}</span>` : ''}
    </span>`;
  }

  function currentHtml(book) {
    const started = progressOf(book) != null;
    return `<section class="section">
      <h2 class="section-label"><span>${started ? '繼續閱讀' : '最近加入'}</span></h2>
      <button class="current" data-id="${book.id}">
        ${coverHtml(book, 'lg')}
        <span class="info">
          <span class="book-title" lang="ja">${esc(book.title)}</span>
          ${book.author ? `<span class="book-author" lang="ja">${esc(book.author)}</span>` : ''}
          ${progressHtml(book)}
          <span class="meta">上次閱讀 · ${lastRead(book.openedAt)}</span>
        </span>
      </button>
    </section>`;
  }

  function importsHtml() {
    if (!imports.length) return '';
    return `<ul class="rows imports">${imports.map((it) => `
      <li><div class="row pending${it.state === 'error' ? ' failed' : ''}">
        <span class="cover sm blank"></span>
        <span class="info">
          <span class="book-title" lang="ja">${esc(it.name)}</span>
          ${it.state === 'error'
            ? `<span class="book-author fail">${esc(it.message)}</span>
               <button class="link dismiss" data-dismiss="${it.key}">關閉</button>`
            : '<span class="progress indeterminate"><span class="bar"><i></i></span></span>'}
        </span>
      </div></li>`).join('')}</ul>`;
  }

  function rowsHtml(books) {
    return `<ul class="rows">${books.map((book) => `
      <li><button class="row" data-id="${book.id}">
        ${coverHtml(book, 'sm')}
        <span class="info">
          <span class="book-title" lang="ja">${esc(book.title)}</span>
          ${book.author ? `<span class="book-author" lang="ja">${esc(book.author)}</span>` : ''}
          ${progressHtml(book)}
        </span>
      </button></li>`).join('')}</ul>`;
  }

  main.addEventListener('click', (e) => {
    const key = e.target.closest('[data-dismiss]')?.dataset.dismiss;
    if (!key) return;
    imports = imports.filter((i) => String(i.key) !== key);
    render();
  });

  async function refresh() {
    books = (await db.allBooks()).sort((a, b) => b.addedAt - a.addedAt);
    render();
  }

  function render() {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));

    if (!books.length && imports.length) {
      main.innerHTML = importsHtml();
      return;
    }
    if (!books.length) {
      main.innerHTML = `<div class="empty">
        <p class="empty-title">書庫是空的</p>
        <p class="empty-hint">匯入沒有 DRM 的 EPUB，或 TXT 文字檔（支援青空文庫的注音格式）。</p>
        <button class="btn primary" data-act="import-empty">匯入書籍</button>
        <button class="btn ghost" data-act="sample">開啟範例《${SAMPLE.title}》</button>
      </div>`;
      main.querySelector('[data-act="import-empty"]').addEventListener('click', () => picker.click());
      main.querySelector('[data-act="sample"]').addEventListener('click', openSample);
      return;
    }

    if (mode === 'search') {
      const hits = query
        ? books.filter((b) => `${b.title}\n${b.author || ''}`.toLowerCase().includes(query))
        : books;
      main.innerHTML = hits.length
        ? `<section class="section">
            <h2 class="section-label"><span>${query ? '搜尋結果' : '全部書籍'}</span><span>${hits.length}</span></h2>
            ${rowsHtml(hits)}
          </section>`
        : '<p class="no-results">找不到符合的書</p>';
      main.innerHTML = importsHtml() + main.innerHTML;
    } else {
      // "Continue reading" is the book opened last; the list below is the whole
      // library in the order books were added, so it never reshuffles.
      const opened = books.filter((b) => b.openedAt).sort((a, b) => b.openedAt - a.openedAt);
      const current = opened[0] || books[0];
      main.innerHTML = `${importsHtml()}${currentHtml(current)}
        <section class="section">
          <h2 class="section-label"><span>全部書籍</span><span>${books.length}</span></h2>
          ${rowsHtml(books)}
        </section>`;
    }

    main.querySelectorAll('[data-id]').forEach((node) => {
      const book = books.find((b) => b.id === node.dataset.id);
      bindPress(node, () => open(book, node), () => bookActions(book));
    });
  }

  function open(book, node) {
    main.querySelectorAll('.cover').forEach((c) => (c.style.viewTransitionName = ''));
    const cover = node.querySelector('.cover');
    if (cover) cover.style.viewTransitionName = 'book';
    openBook(book.id);
  }

  async function bookActions(book) {
    const s = openSheet({
      className: 'actions',
      html: `<div class="action-list">
        <p class="action-head">${esc(book.title)}${book.author ? `<small>${esc(book.author)}</small>` : ''}</p>
        <button class="action" data-a="open">開始閱讀</button>
        <button class="action" data-a="edit">編輯書名和作者</button>
        <button class="action danger" data-a="delete">從書庫移除</button>
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
          refresh();
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
      refresh();
    });
  }

  books = (await db.allBooks()).sort((a, b) => b.addedAt - a.addedAt);
  setMode('library');
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
  const release = () => {
    clearTimeout(timer);
    node.classList.remove('pressing');
  };
  // iOS Safari has no haptics for web pages, so the cover slowly shrinks while
  // the press is held (see .pressing in styles.css): the menu is anticipated
  // rather than sudden.
  node.addEventListener('pointerdown', (e) => {
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    node.classList.add('pressing');
    timer = setTimeout(() => {
      fired = true;
      onLong();
    }, 520);
  });
  node.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) release();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => node.addEventListener(t, release));
  node.addEventListener('click', (e) => {
    if (fired) {
      e.preventDefault();
      return;
    }
    onTap();
  });
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    release();
    if (!fired) onLong();
    fired = true;
  });
}
