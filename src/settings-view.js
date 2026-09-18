import { openSheet, esc, icon } from './ui.js';
import { settings, PROVIDERS, activeModel } from './settings.js';

export function openSettings() {
  const s = openSheet({
    className: 'settings',
    html: `
      <h2 class="sheet-title">設定</h2>
      <div class="form">
        <div class="field row">
          <span class="label">AI 服務商</span>
          <div class="seg">${Object.entries(PROVIDERS).map(([id, p]) =>
            `<button type="button" data-provider="${id}">${p.name}</button>`).join('')}</div>
        </div>

        <label class="field">
          <span class="label" data-key-label></span>
          <div class="key-row">
            <input type="password" name="apiKey" autocomplete="off" autocapitalize="off" spellcheck="false" />
            <button type="button" class="link" data-toggle>顯示</button>
          </div>
          <small data-key-note></small>
        </label>

        <div class="field">
          <span class="label">模型</span>
          <div class="options" data-models></div>
        </div>

        <div class="field">
          <div class="row-inline">
            <span class="label">深度思考</span>
            <div class="seg"><button type="button" data-think="off">關</button><button type="button" data-think="on">開</button></div>
          </div>
          <small>開啟後，講解會先推理再回答，分析更細，但要多等約半分鐘。翻譯不受影響。</small>
        </div>

        <div class="field row">
          <span class="label">講解語言</span>
          <div class="seg"><button type="button" data-lang="zh">繁體中文</button><button type="button" data-lang="en">English</button></div>
        </div>

        <p class="fine">書籍和閱讀進度都儲存在本機瀏覽器裡。在 Safari 中「分享 → 加入主畫面」後使用，資料比較不會被系統清除。</p>
      </div>`,
  });

  const body = s.body;
  const key = body.querySelector('[name="apiKey"]');

  const render = () => {
    const c = settings.get();
    const { provider, model } = activeModel(c);
    const p = PROVIDERS[provider];
    body.querySelectorAll('[data-provider]').forEach((b) => b.classList.toggle('on', b.dataset.provider === provider));
    body.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === c.lang));
    body.querySelectorAll('[data-think]').forEach((b) => b.classList.toggle('on', (b.dataset.think === 'on') === !!c.deepThink));
    body.querySelector('[data-key-label]').textContent = `${p.name} API Key`;
    body.querySelector('[data-key-note]').innerHTML =
      `只儲存在這台裝置上，只會發送到 ${p.host}。 <a href="${p.keyUrl}" target="_blank" rel="noopener">取得 API Key</a>`;
    if (document.activeElement !== key) key.value = c.keys[provider] || '';
    key.placeholder = p.keyHint;
    body.querySelector('[data-models]').innerHTML = p.models.map((m) => `
      <button type="button" class="opt${m.id === model ? ' on' : ''}" data-model="${m.id}">
        <span><b>${esc(m.name)}</b><small>${esc(m.note)}</small></span>
        <span class="tick">${icon('check', 18)}</span>
      </button>`).join('');
  };

  key.addEventListener('input', () => {
    const { provider } = activeModel(settings.get());
    settings.update({ keys: { [provider]: key.value.trim() } });
  });
  body.querySelector('[data-toggle]').addEventListener('click', (e) => {
    const show = key.type === 'password';
    key.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? '隱藏' : '顯示';
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.provider) {
      settings.update({ provider: b.dataset.provider });
      key.value = settings.get().keys[b.dataset.provider] || '';
    }
    if (b.dataset.model) settings.update({ models: { [activeModel().provider]: b.dataset.model } });
    if (b.dataset.lang) settings.update({ lang: b.dataset.lang });
    if (b.dataset.think) settings.update({ deepThink: b.dataset.think === 'on' });
    render();
  });
  render();
  return s;
}
