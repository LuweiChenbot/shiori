// Turning a DOM selection into study material: the exact selection, the full
// sentence(s) around it and the paragraph, all with furigana (<rt>) removed.

const BLOCK = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,th,figcaption,pre';
const SKIP = new Set(['rt', 'rp', 'script', 'style']);
const OPEN = '「『（(【〈《〔“';
const CLOSE = '」』）)】〉》〕”';
const END = '。！？!?';
const EDGE = '。！？!?、，,　 ';

function skipped(node, root) {
  for (let n = node.parentNode; n && n !== root; n = n.parentNode) {
    if (SKIP.has(n.localName)) return true;
  }
  return false;
}

// Source formatting (newlines, indentation between tags) is not part of the text.
function cleanData(data) {
  if (/^\s*$/.test(data) && /[\r\n]/.test(data)) return '';
  return data.replace(/[\r\n\t]+/g, '');
}

function cleanCount(data, rawOffset) {
  return cleanData(data.slice(0, rawOffset)).length;
}

function rawOffset(data, cleanOffset) {
  if (cleanOffset <= 0) return 0;
  for (let i = 1; i <= data.length; i++) if (cleanCount(data, i) >= cleanOffset) return i;
  return data.length;
}

function textNodes(root) {
  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!skipped(n, root)) out.push(n);
  return out;
}

export function blockOf(node) {
  const el = node.nodeType === 1 ? node : node.parentNode;
  return el?.closest?.(BLOCK) || el?.closest?.('div') || el?.ownerDocument?.body || null;
}

/** Flattened text of a block with a map back to its text nodes. */
function indexBlock(block) {
  let text = '';
  const nodes = textNodes(block).map((node) => {
    const t = cleanData(node.data);
    const entry = { node, start: text.length, len: t.length };
    text += t;
    return entry;
  });
  return { text, nodes };
}

function offsetsOf(index, range) {
  let start = null;
  let end = null;
  for (const { node, start: at } of index.nodes) {
    if (start === null) {
      if (node === range.startContainer) start = at + cleanCount(node.data, range.startOffset);
      else if (range.comparePoint(node, 0) >= 0) start = at;
    }
    if (end === null) {
      if (node === range.endContainer) end = at + cleanCount(node.data, range.endOffset);
      else if (range.comparePoint(node, 0) > 0) end = at;
    }
  }
  return [start ?? 0, end ?? index.text.length];
}

/** Sentence boundaries, ignoring terminators inside 「」 and friends. */
export function sentenceBounds(text) {
  const bounds = [0];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (OPEN.includes(c)) {
      if (depth === 0 && i > 0 && CLOSE.includes(text[i - 1])) bounds.push(i);
      depth++;
    } else if (CLOSE.includes(c)) {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && END.includes(c)) {
      let j = i + 1;
      while (j < text.length && (END.includes(text[j]) || '…‥'.includes(text[j]) || CLOSE.includes(text[j]))) j++;
      bounds.push(j);
      i = j - 1;
    }
  }
  bounds.push(text.length);
  return [...new Set(bounds)].sort((a, b) => a - b);
}

function rangeFromOffsets(doc, index, s, e) {
  const range = doc.createRange();
  const startNode = index.nodes.find((n) => s >= n.start && s < n.start + n.len) || index.nodes[0];
  const endNode = [...index.nodes].reverse().find((n) => e > n.start && e <= n.start + n.len) || index.nodes.at(-1);
  if (!startNode || !endNode) return null;
  range.setStart(startNode.node, rawOffset(startNode.node.data, s - startNode.start));
  range.setEnd(endNode.node, rawOffset(endNode.node.data, e - endNode.start));
  return range;
}

/** Text inside a range, furigana removed, blocks separated by newlines. */
export function rangeText(range) {
  const root = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentNode;
  let out = '';
  let lastBlock = null;
  for (const node of textNodes(root)) {
    if (!range.intersectsNode(node)) continue;
    let data = node.data;
    if (node === range.endContainer) data = data.slice(0, range.endOffset);
    if (node === range.startContainer) data = data.slice(range.startOffset);
    const t = cleanData(data);
    if (!t) continue;
    const block = blockOf(node);
    if (lastBlock && block !== lastBlock) out += '\n';
    lastBlock = block;
    out += t;
  }
  return out.replace(/^[\s　]+|[\s　]+$/g, '');
}

function blockText(block) {
  return indexBlock(block).text.replace(/^[\s　]+|[\s　]+$/g, '');
}

function neighbours(block, dir, maxChars) {
  const out = [];
  let size = 0;
  let el = block;
  while (size < maxChars) {
    el = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!el) break;
    const t = blockText(el);
    if (!t) continue;
    out.push(t);
    size += t.length;
  }
  return dir < 0 ? out.reverse() : out;
}

/** Everything the tutor needs about the current selection, or null. */
export function selectionPayload(win) {
  const sel = win.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0).cloneRange();
  const text = rangeText(range).replace(/^[。！？!?、，,]+/, '');
  if (!text) return null;

  const doc = range.startContainer.ownerDocument;
  const first = blockOf(range.startContainer);
  const last = blockOf(range.endContainer);
  let sentence = text;
  let sentenceRange = range;
  let paragraph;
  const paragraphRange = doc.createRange();

  if (first && first === last && first !== doc.body) {
    const index = indexBlock(first);
    let [s0, e0] = offsetsOf(index, range);
    // A selection that starts on the previous sentence's 。 means the next sentence.
    while (s0 < e0 - 1 && EDGE.includes(index.text[s0])) s0++;
    while (e0 > s0 + 1 && /[\s　]/.test(index.text[e0 - 1])) e0--;
    const bounds = sentenceBounds(index.text);
    let s = Math.max(...bounds.filter((b) => b <= s0));
    const e = Math.min(...bounds.filter((b) => b >= e0 && b > s));
    while (s < e && /[\s　]/.test(index.text[s])) s++;
    sentence = index.text.slice(s, e).trim() || text;
    sentenceRange = rangeFromOffsets(doc, index, s, e) || range;
    paragraph = blockText(first);
    paragraphRange.selectNodeContents(first);
  } else {
    paragraphRange.setStartBefore(first || range.startContainer);
    paragraphRange.setEndAfter(last || range.endContainer);
    paragraph = rangeText(paragraphRange);
  }

  const anchor = first && first !== doc.body ? first : null;
  const context = [
    ...(anchor ? neighbours(anchor, -1, 260) : []),
    paragraph,
    ...(anchor && last ? neighbours(last, 1, 160) : []),
  ].join('\n');

  return {
    text,
    sentence,
    paragraph,
    context,
    ranges: { selection: range, sentence: sentenceRange, paragraph: paragraphRange },
  };
}
