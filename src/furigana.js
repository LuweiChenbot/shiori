// Furigana worked out in context.
//
// Dictionary-based furigana picks one reading per word and gets heteronyms
// wrong (今日 きょう/こんにち, 行った いった/おこなった, 方 かた/ほう). Here the
// model reads whole paragraphs, with the paragraph before as context, and
// returns each kanji word with the reading it has *there*. Readings are
// matched back against the original text (anything that doesn't match is
// dropped), okurigana are split off locally, and each paragraph's result is
// cached so it is only ever worked out once.
//
// Two passes: a quick one (no reasoning, ~2s) shows readings right away; with
// 深度思考 on, the page being read is then re-checked with reasoning in the
// background (slower, noticeably more accurate on heteronyms) and any reading
// it corrects is swapped in place.
//
// Readings are drawn by CSS (see readerCss) out of the text flow, so they can
// arrive after the page is shown without moving a single line.

import { db } from './db.js';
import { activeModel, settings } from './settings.js';
import { completeJSON } from './llm.js';
import { indexBlock, rawOffset } from './textsel.js';
import { toast } from './ui.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const BLOCKS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, td, th, figcaption';
const KANJI = /[㐀-鿿豈-﫿々〆〇ヶ]/;
const KANJI_SPLIT = /([㐀-鿿豈-﫿々〆〇ヶ]+)/;
const MAX_BATCH_CHARS = 900;

export const SYSTEM = '你為日語文本標註讀音，只輸出 JSON。';

export const SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, words: { type: 'array', items: { type: 'string' } } },
        required: ['i', 'words'],
        additionalProperties: false,
      },
    },
  },
  required: ['paragraphs'],
  additionalProperties: false,
};

export function readingsPrompt(context, paragraphs) {
  return `${context ? `前文（只用來判斷讀音，不要標註）：\n"""\n${context}\n"""\n\n` : ''}請標註下面各段：
${paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n')}

輸出 JSON：{"paragraphs":[{"i":1,"words":["表層形|此處意思|よみ|級", ...]}, ...]}
規則：
1. 每段按出現順序列出所有含漢字的詞。表層形必須與原文一字不差，送假名照抄。先寫這個詞在此處的中文意思（兩三個字），再寫讀音，例如「食べた|吃了|たべた|5」「会議を行った」中的「行った|舉行|おこなった|3」。
2. よみ用平假名，而且必須是這個詞在此語境中的實際讀法。同形異讀一定要看上下文：例如「今日」是きょう還是こんにち、「行った」是いった還是おこなった、「方」是かた還是ほう、「一日」是ついたち還是いちにち、「上手」是じょうず還是うわて。
3. 同一個詞在一段裡出現多次時，每一次都要按它自己所在的句子重新判斷，不要沿用前一次的讀法（例如「目下の問題」的目下讀もっか，「目下の者」的目下讀めした）。
4. 人名、地名等專有名詞用最常見的讀法。
5. 級是這個詞（以這個讀法）的 JLPT 級別：5、4、3、2、1；超出 N1 或罕見的讀法寫 0。
6. 每一段都要輸出，不要改動原文。`;
}

const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split a word's reading over its kanji runs, leaving okurigana bare:
 * 食べた/たべた → [食: た]; 取り扱い/とりあつかい → [取: と, 扱: あつか].
 */
export function splitReading(word, reading) {
  const r = toHiragana(reading);
  const parts = word.split(KANJI_SPLIT).filter(Boolean);
  const pattern = parts.map((p) => (KANJI.test(p[0]) ? '(.+?)' : escapeRe(toHiragana(p)))).join('');
  const m = r.match(new RegExp(`^${pattern}$`));
  if (!m) return [{ start: 0, end: word.length, reading: r }];
  const out = [];
  let at = 0;
  let group = 1;
  for (const p of parts) {
    if (KANJI.test(p[0])) out.push({ start: at, end: at + p.length, reading: m[group++] });
    at += p.length;
  }
  return out;
}

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `r1:${(h >>> 0).toString(36)}:${text.length}`;
}

const blockText = (block) => indexBlock(block).text;

export class Furigana {
  constructor(pag) {
    this.pag = pag;
    this.memory = new Map(); // key -> { words, verified }, for this session
    this.inflight = new Set(); // keys being worked out
    this.checking = new Set(); // keys being re-checked
    this.checks = Promise.resolve(); // re-checks run one at a time
    this.failures = 0;
    this.warned = false;
    this.timer = 0;
  }

  get mode() {
    return settings.get().reader.furigana || 'off';
  }

  /** Call after every chapter load and page turn. */
  schedule() {
    clearTimeout(this.timer);
    if (this.mode === 'off') return;
    this.timer = setTimeout(() => this.run().catch((err) => console.warn('furigana', err)), 120);
  }

  /** Blocks on page `page`, found from where their lines actually sit. */
  blocksOn(page) {
    const { doc, W } = this.pag;
    if (!doc?.body) return [];
    const shift = new DOMMatrix(getComputedStyle(doc.body).transform).m41;
    const out = [];
    for (const block of doc.body.querySelectorAll(BLOCKS)) {
      if (block.parentElement?.closest(BLOCKS)) continue; // nested: handled by the outer block
      for (const rect of block.getClientRects()) {
        if (Math.floor((rect.left - shift + 1) / W) === page) {
          out.push(block);
          break;
        }
      }
    }
    return out;
  }

  async run() {
    const { pag } = this;
    if (!pag.ready) return;
    // The page being read first, then the next one so turning is instant.
    for (const page of [pag.page, pag.page + 1]) {
      if (page >= pag.pages) break;
      const blocks = this.blocksOn(page).filter((b) => KANJI.test(blockText(b)));
      if (blocks.length) await this.annotate(blocks, page === pag.page);
    }
  }

  async annotate(blocks, current) {
    const items = blocks.map((block) => {
      const text = blockText(block).trim();
      return { block, text, key: hash(text) };
    });

    // Cached readings first.
    const unknown = items.filter((it) => !this.memory.has(it.key));
    if (unknown.length) {
      const stored = await db.getReadings(unknown.map((it) => it.key)).catch(() => []);
      stored.forEach((entry) => entry && this.memory.set(entry.key, { words: entry.words, verified: !!entry.verified }));
    }
    for (const it of items) if (this.memory.has(it.key)) this.apply(it.block, this.memory.get(it.key).words);

    // The page being read gets a careful second look when 深度思考 is on.
    if (current && settings.get().deepThink) {
      const unchecked = items.filter((it) => this.memory.has(it.key) && !this.memory.get(it.key).verified && !this.checking.has(it.key));
      if (unchecked.length) this.recheck(unchecked);
    }

    const todo = items.filter((it) => !this.memory.has(it.key) && !this.inflight.has(it.key));
    if (!todo.length || this.failures >= 3) return;

    // Ask for the rest in batches of a page or so.
    let batch = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      const group = batch;
      batch = [];
      size = 0;
      await this.fetch(group);
    };
    for (const it of todo) {
      if (size + it.text.length > MAX_BATCH_CHARS) await flush();
      batch.push(it);
      size += it.text.length;
    }
    await flush();
    if (current && settings.get().deepThink) this.recheck(todo);
  }

  recheck(group) {
    group.forEach((it) => this.checking.add(it.key));
    this.checks = this.checks
      .then(() => this.fetch(group, true))
      .finally(() => group.forEach((it) => this.checking.delete(it.key)));
  }

  async fetch(group, careful = false) {
    const active = activeModel();
    if (!active.apiKey) {
      if (!this.warned) toast('注音需要先在「設定」填入 API Key');
      this.warned = true;
      return;
    }
    if (!careful) group.forEach((it) => this.inflight.add(it.key));
    const first = group[0].block;
    let prev = first.previousElementSibling;
    while (prev && !blockText(prev).trim()) prev = prev.previousElementSibling;
    const context = prev ? blockText(prev).trim().slice(-300) : '';
    try {
      const result = await completeJSON({
        ...active,
        system: SYSTEM,
        prompt: readingsPrompt(context, group.map((it) => it.text)),
        schema: SCHEMA,
        thinking: careful,
      });
      const fresh = [];
      for (const para of result.paragraphs || []) {
        const it = group[para.i - 1];
        if (!it || !Array.isArray(para.words)) continue;
        // "surface|meaning|reading|level": the meaning comes first so the model
        // settles what the word means before it commits to a reading.
        const words = para.words
          .map((w) => (Array.isArray(w) ? w.map(String) : String(w).split('|')))
          .map((f) => (f.length >= 4 ? [f[0], f[2], f[3]] : [f[0], f[1], f[2]]))
          .filter(([surface, reading]) => surface && reading && KANJI.test(surface) && /^[\u3041-\u309Fー]+$/.test(toHiragana(reading)))
          .map(([surface, reading, level]) => [surface, reading, Number.parseInt(level, 10) || 0]);
        // A re-check that comes back with far fewer words probably skipped
        // part of the paragraph: keep what we have rather than lose readings.
        const had = this.memory.get(it.key)?.words;
        if (careful && had && words.length < had.length * 0.6) continue;
        this.memory.set(it.key, { words, verified: careful });
        fresh.push({ key: it.key, words, verified: careful });
        if (it.block.isConnected) {
          if (careful) this.clear(it.block);
          this.apply(it.block, words);
        }
      }
      if (fresh.length) db.putReadings(fresh).catch(() => {});
      if (!careful) this.failures = 0;
    } catch (err) {
      if (careful) {
        console.warn('furigana re-check failed', err);
        return;
      }
      this.failures++;
      if (this.failures >= 3) toast('注音暫時無法取得，稍後再試');
      console.warn('furigana request failed', err);
    } finally {
      if (!careful) group.forEach((it) => this.inflight.delete(it.key));
    }
  }

  /** Remove this block's readings (before corrected ones go in). */
  clear(block) {
    block.querySelectorAll('.fg').forEach((span) => span.replaceWith(...span.childNodes));
    block.normalize();
    block.removeAttribute('data-fg');
  }

  /** Wrap each kanji run in the block with its reading. */
  apply(block, words) {
    if (block.hasAttribute('data-fg') || !block.isConnected) return;
    block.setAttribute('data-fg', '');
    const index = indexBlock(block);
    const ops = [];
    let cursor = 0;
    for (const [surface, reading, level] of words) {
      const at = index.text.indexOf(surface, cursor);
      if (at < 0) continue; // not in the text as given: ignore rather than guess
      cursor = at + surface.length;
      for (const seg of splitReading(surface, reading)) {
        const s = at + seg.start;
        const e = at + seg.end;
        const entry = index.nodes.find((n) => s >= n.start && e <= n.start + n.len);
        if (!entry || entry.node.parentNode?.closest?.('ruby, .fg')) continue; // spans nodes, or already has ruby
        ops.push({ entry, s: s - entry.start, e: e - entry.start, reading: seg.reading, hard: level === 0 || level <= 2 });
      }
    }
    // Grouped by text node, right to left within each, so earlier offsets stay valid.
    ops.sort((a, b) => a.entry.start - b.entry.start || b.s - a.s);
    const doc = block.ownerDocument;
    for (const op of ops) {
      const { node } = op.entry;
      const range = doc.createRange();
      range.setStart(node, rawOffset(node.data, op.s));
      range.setEnd(node, rawOffset(node.data, op.e));
      const span = doc.createElementNS(XHTML_NS, 'span');
      span.setAttribute('class', op.hard ? 'fg hard' : 'fg');
      span.setAttribute('data-r', op.reading);
      // Long readings over short kanji get smaller so they don't collide.
      const fit = (0.95 * (op.e - op.s)) / op.reading.length;
      if (fit < 0.5) span.setAttribute('style', `--fs:${fit.toFixed(2)}em`);
      try {
        range.surroundContents(span);
      } catch {
        // Range crosses an element boundary after all: leave it unannotated.
      }
    }
  }
}
