// Book sources. An EPUB is read straight from its zip; a TXT file (including
// Aozora Bunko's ruby notation) is split into chapters and rendered as HTML.
// Both expose the same shape to the reader:
//   { title, author, spine: [{path}], toc: [{label, spine, fragment, depth}],
//     chapter(i) -> { doc, xml, path }, resolve(fromPath, href), destroy() }

import JSZip from 'jszip';
import { db, newId } from './db.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const OPS_NS = 'http://www.idpf.org/2007/ops';

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', css: 'text/css', otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2',
  mp3: 'audio/mpeg', mp4: 'video/mp4', m4a: 'audio/mp4',
};
const mimeOf = (path) => MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream';

const FAKE_ORIGIN = 'https://book.invalid/';

/** Resolve `href` relative to the file at `base`. Returns null for external links. */
export function resolvePath(base, href) {
  if (!href || /^(data|blob):/i.test(href)) return null;
  let url;
  try {
    url = new URL(href, FAKE_ORIGIN + base);
  } catch {
    return null;
  }
  if (url.origin !== new URL(FAKE_ORIGIN).origin) return null;
  return decodeURIComponent(url.pathname.slice(1));
}

function splitHash(href) {
  const i = href.indexOf('#');
  return i < 0 ? [href, ''] : [href.slice(0, i), decodeURIComponent(href.slice(i + 1))];
}

const byTag = (node, local) => (node ? Array.from(node.getElementsByTagNameNS('*', local)) : []);
const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

// A byte-order mark or blank line before <?xml is fine in Chrome but makes
// WebKit (every browser on iPhone) reject the whole document.
const clean = (text) => text.replace(/^[\uFEFF\s]+(?=<)/, '');

function parseXML(text) {
  const doc = new DOMParser().parseFromString(clean(text), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML 解析失敗');
  return doc;
}

/** Parse a content document, preferring strict XHTML and falling back to HTML. */
export function parseContent(raw) {
  const text = clean(raw);
  const xml = new DOMParser().parseFromString(text, 'application/xhtml+xml');
  if (!xml.getElementsByTagName('parsererror').length && xml.body) return { doc: xml, xml: true };
  return { doc: new DOMParser().parseFromString(text, 'text/html'), xml: false };
}

/**
 * Book content must never run code: the page frame shares this app's origin.
 * (The frame also carries a script-src 'none' policy; this is the second line.)
 */
function sanitize(doc) {
  doc.querySelectorAll('script, iframe, frame, frameset, object, embed, applet, base, form, meta[http-equiv]')
    .forEach((el) => el.remove());
  for (const el of doc.getElementsByTagName('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || /^\s*(javascript|vbscript):/i.test(attr.value)) el.removeAttributeNode(attr);
    }
  }
  byTag(doc, 'animate').concat(byTag(doc, 'set')).forEach((el) => el.remove());
}

function plainLength(html) {
  return html.replace(/<rt>.*?<\/rt>/gs, '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
}

// ---------------------------------------------------------------- EPUB

export class EpubBook {
  static async open(data) {
    const book = new EpubBook(await JSZip.loadAsync(data));
    await book.init();
    return book;
  }

  constructor(zip) {
    this.zip = zip;
    this.urls = new Map();
    this.lowerNames = new Map(Object.keys(zip.files).map((n) => [n.toLowerCase(), n]));
  }

  file(path) {
    if (!path) return null;
    return this.zip.file(path) || this.zip.file(this.lowerNames.get(path.toLowerCase()) || '');
  }

  async text(path) {
    const f = this.file(path);
    if (!f) throw new Error(`書中缺少檔案：${path}`);
    return f.async('string');
  }

  async init() {
    const container = parseXML(await this.text('META-INF/container.xml'));
    this.opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path');
    if (!this.opfPath) throw new Error('不是有效的 EPUB（找不到 OPF）');
    const opf = parseXML(await this.text(this.opfPath));
    const meta = byTag(opf, 'metadata')[0];

    this.title = textOf(byTag(meta, 'title')[0]) || '未命名';
    this.author = byTag(meta, 'creator').map(textOf).filter(Boolean).join('、');
    this.lang = textOf(byTag(meta, 'language')[0]) || 'ja';

    const manifest = new Map();
    for (const item of byTag(opf, 'item')) {
      const href = item.getAttribute('href');
      manifest.set(item.getAttribute('id'), {
        id: item.getAttribute('id'),
        path: resolvePath(this.opfPath, href) || href,
        type: item.getAttribute('media-type') || '',
        props: (item.getAttribute('properties') || '').split(/\s+/),
      });
    }
    const items = [...manifest.values()];

    const spineEl = byTag(opf, 'spine')[0];
    this.spine = byTag(spineEl, 'itemref')
      .map((ref) => manifest.get(ref.getAttribute('idref')))
      .filter((it) => it && /html|xml/.test(it.type) && !it.type.includes('ncx'))
      .map((it) => ({ path: it.path }));
    if (!this.spine.length) throw new Error('這本 EPUB 沒有正文');

    let cover = items.find((it) => it.props.includes('cover-image'));
    if (!cover) {
      const m = byTag(meta, 'meta').find((el) => el.getAttribute('name') === 'cover');
      cover = m && manifest.get(m.getAttribute('content'));
    }
    cover ??= items.find((it) => it.type.startsWith('image/') && /cover/i.test(it.id + it.path));
    this.coverPath = cover?.type?.startsWith('image/') ? cover.path : null;

    let toc = [];
    const nav = items.find((it) => it.props.includes('nav'));
    if (nav) toc = await this.parseNav(nav.path).catch(() => []);
    if (!toc.length) {
      const ncx = manifest.get(spineEl?.getAttribute('toc')) || items.find((it) => it.type.includes('ncx'));
      if (ncx) toc = await this.parseNcx(ncx.path).catch(() => []);
    }
    this.toc = toc
      .map((e) => ({ ...e, spine: this.spineIndex(e.path) }))
      .filter((e) => e.spine >= 0 && e.label);
  }

  spineIndex(path) {
    const lower = path?.toLowerCase();
    return this.spine.findIndex((s) => s.path.toLowerCase() === lower);
  }

  async parseNav(path) {
    const { doc } = parseContent(await this.text(path));
    const navs = byTag(doc, 'nav');
    const typeOf = (n) => n.getAttributeNS(OPS_NS, 'type') || n.getAttribute('epub:type') || '';
    const nav = navs.find((n) => typeOf(n).split(/\s+/).includes('toc')) || navs[0];
    const out = [];
    const walk = (list, depth) => {
      for (const li of Array.from(list.children).filter((c) => c.localName === 'li')) {
        const a = Array.from(li.children).find((c) => c.localName === 'a' || c.localName === 'span');
        const href = a?.getAttribute('href');
        if (href) {
          const [file, fragment] = splitHash(href);
          out.push({ label: textOf(a), path: file ? resolvePath(path, file) : path, fragment, depth });
        }
        const sub = Array.from(li.children).find((c) => c.localName === 'ol' || c.localName === 'ul');
        if (sub) walk(sub, depth + 1);
      }
    };
    const root = nav && Array.from(nav.children).find((c) => c.localName === 'ol' || c.localName === 'ul');
    if (root) walk(root, 0);
    return out;
  }

  async parseNcx(path) {
    const doc = parseXML(await this.text(path));
    const out = [];
    const walk = (parent, depth) => {
      for (const np of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
        const label = textOf(byTag(np, 'text')[0]);
        const src = byTag(np, 'content')[0]?.getAttribute('src');
        if (src) {
          const [file, fragment] = splitHash(src);
          out.push({ label, path: resolvePath(path, file), fragment, depth });
        }
        walk(np, depth + 1);
      }
    };
    const map = byTag(doc, 'navMap')[0];
    if (map) walk(map, 0);
    return out;
  }

  async blobUrl(path) {
    if (!path) return null;
    if (this.urls.has(path)) return this.urls.get(path);
    const f = this.file(path);
    if (!f) return null;
    const url = URL.createObjectURL(new Blob([await f.async('uint8array')], { type: mimeOf(path) }));
    this.urls.set(path, url);
    return url;
  }

  async rewriteCss(css, base) {
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    const refs = [...new Set([...css.matchAll(re)].map((m) => m[2]))];
    const map = new Map();
    for (const ref of refs) map.set(ref, await this.blobUrl(resolvePath(base, ref)));
    return css.replace(re, (all, q, ref) => (map.get(ref) ? `url("${map.get(ref)}")` : all));
  }

  async chapter(i) {
    const { path } = this.spine[i];
    const { doc, xml } = parseContent(await this.text(path));
    sanitize(doc);

    for (const link of Array.from(doc.querySelectorAll('link'))) {
      if (!/stylesheet/i.test(link.getAttribute('rel') || '')) continue;
      const cssPath = resolvePath(path, link.getAttribute('href'));
      const f = this.file(cssPath);
      const style = doc.createElementNS(XHTML_NS, 'style');
      style.textContent = f ? await this.rewriteCss(await f.async('string'), cssPath) : '';
      link.replaceWith(style);
    }
    for (const style of Array.from(doc.querySelectorAll('style'))) {
      if (style.textContent.includes('url(')) style.textContent = await this.rewriteCss(style.textContent, path);
    }
    for (const el of Array.from(doc.querySelectorAll('[src]'))) {
      const url = await this.blobUrl(resolvePath(path, el.getAttribute('src')));
      if (url) el.setAttribute('src', url);
    }
    for (const el of byTag(doc, 'image')) {
      const href = el.getAttributeNS(XLINK_NS, 'href') || el.getAttribute('href');
      const url = await this.blobUrl(resolvePath(path, href));
      if (url) {
        el.setAttributeNS(XLINK_NS, 'xlink:href', url);
        el.setAttribute('href', url);
      }
    }
    return { doc, xml, path };
  }

  /** Map an in-book link to a spine position; null means it points outside the book. */
  resolve(fromPath, href) {
    const [file, fragment] = splitHash(href);
    if (!file) return { spine: this.spineIndex(fromPath), fragment };
    const target = resolvePath(fromPath, file);
    if (!target) return null;
    const spine = this.spineIndex(target);
    return spine < 0 ? null : { spine, fragment };
  }

  async weights() {
    const out = [];
    for (const { path } of this.spine) {
      const f = this.file(path);
      out.push(Math.max(40, f ? plainLength(await f.async('string')) : 40));
    }
    return out;
  }

  async coverData() {
    const f = this.file(this.coverPath);
    return f ? { data: await f.async('arraybuffer'), type: mimeOf(this.coverPath) } : null;
  }

  destroy() {
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
  }
}

// ---------------------------------------------------------------- TXT

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KANJI = '々〆〇〻㐀-鿿豈-﫿';

/** Aozora Bunko inline markup -> HTML: ruby, annotations stripped. */
function aozoraLine(line) {
  let s = escapeHtml(line);
  s = s.replace(/［＃[^］]*］/g, '');
  s = s.replace(/｜([^《｜]+)《([^》]+)》/g, '<ruby>$1<rt>$2</rt></ruby>');
  s = s.replace(new RegExp(`([${KANJI}]+)《([^》]+)》`, 'g'), '<ruby>$1<rt>$2</rt></ruby>');
  return s;
}

const HEADING_NOTE = /［＃「(.+?)」は[大中小]?見出し］/;
const HEADING_LINE = /^[\s　]*(第[一二三四五六七八九十百千〇零\d０-９]+[章話回部編節幕]|序章|終章|序|プロローグ|エピローグ|Chapter\s*\d+)/i;

export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

export function parseText(raw, fileName) {
  let lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let title = fileName.replace(/\.[^.]+$/, '');
  let author = '';

  // Aozora Bunko header: title / author, then a ----- block explaining the markup.
  const dashes = lines.slice(0, 80).map((l, i) => (/^-{10,}\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
  if (dashes.length >= 2) {
    const head = lines.slice(0, dashes[0]).map((l) => l.trim()).filter(Boolean);
    if (head[0]) title = head[0];
    if (head[1]) author = head[head.length - 1];
    lines = lines.slice(dashes[1] + 1);
  }

  const chapters = [];
  let current = { title: '', lines: [] };
  const push = () => {
    if (current.lines.some((l) => l.trim())) chapters.push(current);
  };
  for (const line of lines) {
    const note = line.match(HEADING_NOTE);
    const isHeading = note || (line.trim().length <= 30 && HEADING_LINE.test(line));
    if (isHeading) {
      push();
      current = { title: note ? note[1] : line.replace(/［＃[^］]*］/g, '').trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  push();

  // No headings found: cut long texts into ~6000 character parts at blank lines.
  if (chapters.length <= 1 && raw.length > 9000) {
    const all = chapters[0]?.lines || [];
    chapters.length = 0;
    let part = { title: '', lines: [] };
    let size = 0;
    for (const line of all) {
      part.lines.push(line);
      size += line.length;
      if (size > 6000 && !line.trim()) {
        chapters.push(part);
        part = { title: '', lines: [] };
        size = 0;
      }
    }
    if (part.lines.some((l) => l.trim())) chapters.push(part);
    chapters.forEach((c, i) => (c.title = `第 ${i + 1} 部分`));
  }
  if (!chapters.length) chapters.push({ title: '', lines: [raw] });
  return { title, author, chapters };
}

function chapterHtml(chapter) {
  const out = [];
  if (chapter.title) out.push(`<h2>${aozoraLine(chapter.title)}</h2>`);
  let blank = true; // no spacer directly under the heading
  for (const line of chapter.lines) {
    if (!line.trim()) {
      if (!blank && out.length) out.push('<p class="blank"><br/></p>');
      blank = true;
      continue;
    }
    blank = false;
    if (/^底本：/.test(line)) out.push('<hr/>');
    out.push(`<p>${aozoraLine(line)}</p>`);
  }
  return out.join('\n');
}

export class TextBook {
  constructor(raw, fileName) {
    const parsed = parseText(raw, fileName);
    Object.assign(this, { title: parsed.title, author: parsed.author, lang: 'ja' });
    this.chapters = parsed.chapters;
    this.spine = this.chapters.map((_, i) => ({ path: `chapter-${i}` }));
    this.toc = this.chapters.map((c, i) => ({ label: c.title || `第 ${i + 1} 部分`, spine: i, fragment: '', depth: 0 }));
  }

  async chapter(i) {
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title></title></head><body>${chapterHtml(this.chapters[i])}</body></html>`;
    return { doc: new DOMParser().parseFromString(html, 'text/html'), xml: false, path: this.spine[i].path };
  }

  resolve() {
    return null;
  }

  async weights() {
    return this.chapters.map((c) => Math.max(40, c.lines.join('').length));
  }

  destroy() {}
}

// ---------------------------------------------------------------- import / open

const isZip = (buf) => {
  const b = new Uint8Array(buf, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
};

export async function importFile(file) {
  const buffer = await file.arrayBuffer();
  const id = newId();
  const now = Date.now();
  if (isZip(buffer)) {
    const book = await EpubBook.open(buffer);
    try {
      const record = {
        id, format: 'epub', title: book.title, author: book.author,
        cover: await book.coverData(), weights: await book.weights(),
        addedAt: now, openedAt: 0, progress: null,
      };
      await db.addBook(record, { data: buffer });
      return record;
    } finally {
      book.destroy();
    }
  }
  if (/\.(epub|zip|pdf|mobi|azw3?)$/i.test(file.name)) {
    throw new Error('無法讀取這個檔案。目前支援無 DRM 的 EPUB 和 TXT。');
  }
  const text = decodeText(buffer);
  const book = new TextBook(text, file.name);
  const record = {
    id, format: 'txt', title: book.title, author: book.author, cover: null,
    weights: await book.weights(), addedAt: now, openedAt: 0, progress: null,
  };
  await db.addBook(record, { text, name: file.name });
  return record;
}

export async function loadBook(record) {
  const file = await db.getFile(record.id);
  if (!file) throw new Error('找不到這本書的檔案');
  return record.format === 'epub' ? EpubBook.open(file.data) : new TextBook(file.text, file.name || record.title);
}
