// The tutor sheet: translation or a teacher-style explanation of the selected
// text, with a scope switch (selection / sentence / paragraph) and follow-up
// questions. Each mode+scope pair keeps its own conversation.

import { openSheet, icon, esc } from './ui.js';
import { settings, activeModel, modelName } from './settings.js';
import { streamReply } from './llm.js';
import { systemPrompt, userPrompt } from './prompts.js';
import { renderMarkdown } from './markdown.js';

const SCOPES = [
  ['selection', '所選'],
  ['sentence', '整句'],
  ['paragraph', '整段'],
];
const MODES = [
  ['explain', '講解'],
  ['translate', '翻譯'],
];

// Mark Japanese runs so they render with Japanese glyph shapes inside Chinese text.
// A run counts as Japanese if it contains kana, or is 漢字（かな） as the tutor writes readings.
const K = '一-鿿々〆〇';
const KANA = 'ぁ-ヿー';
const JA_RUN = new RegExp(
  `[「『]?(?:[${K}]+（[${KANA}]+）|[${K}]*[${KANA}])[${K}${KANA}]*(?:（[${KANA}]+）[${K}${KANA}]*)*[」』]?`, 'g');
function markJapanese(html) {
  return html.replace(/(^|>)([^<]+)/g, (all, gt, text) => gt + text.replace(JA_RUN, (m) => `<span lang="ja">${m}</span>`));
}

export function openTutor({ payload, mode: initialMode, source, onFocus, onClose, onOpenSettings }) {
  const texts = { selection: payload.text, sentence: payload.sentence, paragraph: payload.paragraph };
  const scopes = SCOPES.filter(([key], i) => i === 0 || !SCOPES.slice(0, i).some(([k]) => texts[k] === texts[key]));
  let mode = initialMode;
  let scope = 'selection';
  const threads = new Map();

  const s = openSheet({
    className: 'tutor',
    expandable: true,
    html: `
      <header class="tutor-head">
        <div class="seg" role="tablist">${MODES.map(([k, label]) => `<button role="tab" data-mode="${k}">${label}</button>`).join('')}</div>
        <button class="icon-btn" data-close aria-label="關閉">${icon('close', 20)}</button>
      </header>
      <div class="tutor-scroll">
        ${scopes.length > 1 ? `<div class="scopes">${scopes.map(([k, label]) => `<button class="chip" data-scope="${k}">${label}</button>`).join('')}</div>` : ''}
        <blockquote class="tutor-quote" lang="ja"></blockquote>
        <div class="tutor-thread md"></div>
      </div>
      <form class="tutor-ask">
        <input type="text" enterkeyhint="send" placeholder="繼續問老師…" aria-label="追問" />
        <button type="submit" class="send" aria-label="傳送">${icon('send', 20)}</button>
      </form>`,
    onClose: () => {
      threads.forEach((t) => t.controller?.abort());
      onClose?.();
    },
  });

  const $ = (sel) => s.body.querySelector(sel);
  const quote = $('.tutor-quote');
  const thread = $('.tutor-thread');
  const scroller = $('.tutor-scroll');
  const input = $('.tutor-ask input');

  $('[data-close]').addEventListener('click', s.close);
  s.body.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    show();
  }));
  s.body.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    onFocus?.(payload.ranges[scope]);
    show();
  }));
  $('.tutor-ask').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const t = current();
    if (t.turns.some((turn) => turn.status === 'loading' || turn.status === 'streaming')) return;
    input.value = '';
    input.blur();
    ask(t, q);
    requestAnimationFrame(() => thread.lastElementChild?.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      $('.tutor-ask').requestSubmit();
    }
  });
  thread.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'settings') {
      s.close();
      onOpenSettings?.();
    } else if (btn.dataset.action === 'retry') {
      const t = current();
      const failed = t.turns.pop();
      ask(t, failed.q);
    }
  });

  function current() {
    const key = `${mode}:${scope}`;
    if (!threads.has(key)) threads.set(key, { key, mode, scope, messages: [], turns: [] });
    return threads.get(key);
  }

  function show() {
    s.body.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    s.body.querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
    quote.textContent = texts[scope];
    const t = current();
    if (!t.turns.length) ask(t, null);
    else render();
    scroller.scrollTop = 0;
  }

  async function ask(t, question) {
    const cfg = settings.get();
    const active = activeModel(cfg);
    const turn = { q: question, a: '', status: 'loading', slow: cfg.deepThink && (question || t.mode !== 'translate') };
    t.turns.push(turn);
    const content = question || userPrompt({
      mode: t.mode, target: texts[t.scope], sentence: payload.sentence,
      context: payload.context, source, lang: cfg.lang,
    });
    const messages = [...t.messages, { role: 'user', content }];
    t.controller = new AbortController();
    render();
    try {
      const res = await streamReply({
        ...active,
        system: systemPrompt(cfg),
        messages,
        task: question ? 'followup' : t.mode,
        deepThink: cfg.deepThink,
        signal: t.controller.signal,
        onText: (delta) => {
          turn.a += delta;
          turn.status = 'streaming';
          if (t === current()) scheduleRender();
        },
      });
      t.messages = [...messages, { role: 'assistant', content: res.content }];
      turn.status = 'done';
      turn.truncated = res.truncated;
      if (res.model && res.model !== active.model) turn.servedBy = res.model;
    } catch (err) {
      if (err.kind === 'abort') return;
      turn.status = 'error';
      turn.error = err;
      if (err.kind === 'refusal') turn.a = '';
    }
    if (t === current()) render();
  }

  let frame = 0;
  function scheduleRender() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function render() {
    const t = current();
    thread.innerHTML = t.turns.map((turn) => {
      const q = turn.q ? `<div class="q">${esc(turn.q)}</div>` : '';
      let a = '';
      if (turn.a) a += `<div class="a">${markJapanese(renderMarkdown(turn.a))}</div>`;
      if (turn.status === 'loading') {
        a += `<div class="thinking" aria-label="正在思考"><i></i><i></i><i></i>${turn.slow ? '<span>深度思考中，約需半分鐘</span>' : ''}</div>`;
      }
      if (turn.status === 'error') {
        const e = turn.error;
        const fix = e.kind === 'nokey' || e.kind === 'auth'
          ? '<button class="btn small primary" data-action="settings">前往設定</button>'
          : '<button class="btn small ghost" data-action="retry">重試</button>';
        a += `<div class="error"><p>${esc(e.message)}</p>${fix}</div>`;
      }
      if (turn.truncated) a += '<p class="meta">（回答過長，已被截斷）</p>';
      if (turn.servedBy) a += `<p class="meta">由 ${esc(modelName(turn.servedBy))} 回答</p>`;
      return q + a;
    }).join('');
  }

  onFocus?.(payload.ranges.selection);
  show();
  return s;
}
