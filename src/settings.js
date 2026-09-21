// User preferences, kept in localStorage on this device only.

const KEY = 'shiori.settings.v1';

// Each supplier keeps its own API key and chosen model; the model list
// follows whichever supplier is selected.
export const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    host: 'api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyHint: 'sk-…',
    models: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', note: '快速、便宜（預設）' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', note: '講解更細緻，費用約為 Flash 的 7 倍' },
    ],
  },
  anthropic: {
    name: 'Claude',
    host: 'api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', note: '又快又好（預設）' },
      { id: 'claude-opus-5', name: 'Claude Opus 5', note: '講解最細緻，費用約為 Sonnet 的 2.5 倍' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', note: '最快最省，適合查詞' },
    ],
  },
};

const DEFAULTS = {
  provider: 'deepseek',
  keys: { deepseek: '', anthropic: '' },
  models: { deepseek: 'deepseek-flash', anthropic: 'claude-sonnet-5' },
  lang: 'zh',
  // Explanations reason before answering: more careful, but DeepSeek then takes ~30s.
  deepThink: false,
  // furigana: 'off' | 'hard' (N2 and above) | 'all'
  reader: { fontSize: 19, lineHeight: 1.85, theme: 'paper', font: 'mincho', margin: 26, furigana: 'off' },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Earlier versions stored a single Claude key and model.
    if (saved.apiKey) saved.keys = { ...(saved.keys || {}), anthropic: saved.apiKey };
    if (saved.model?.startsWith('claude-')) saved.models = { ...(saved.models || {}), anthropic: saved.model };
    delete saved.apiKey;
    delete saved.model;
    delete saved.level;
    return {
      ...DEFAULTS,
      ...saved,
      keys: { ...DEFAULTS.keys, ...(saved.keys || {}) },
      models: { ...DEFAULTS.models, ...(saved.models || {}) },
      reader: { ...DEFAULTS.reader, ...(saved.reader || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = load();
const listeners = new Set();

export const settings = {
  get: () => state,
  update(patch) {
    state = {
      ...state,
      ...patch,
      keys: { ...state.keys, ...(patch.keys || {}) },
      models: { ...state.models, ...(patch.models || {}) },
      reader: { ...state.reader, ...(patch.reader || {}) },
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Private mode or storage blocked: settings still apply for this session.
    }
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** The supplier, key and model a tutor request should use right now. */
export function activeModel(cfg = state) {
  const provider = PROVIDERS[cfg.provider] ? cfg.provider : 'deepseek';
  const models = PROVIDERS[provider].models;
  const model = models.some((m) => m.id === cfg.models[provider]) ? cfg.models[provider] : models[0].id;
  return { provider, apiKey: cfg.keys[provider] || '', model };
}

export function modelName(id) {
  for (const p of Object.values(PROVIDERS)) {
    const m = p.models.find((x) => x.id === id);
    if (m) return m.name;
  }
  return id;
}
