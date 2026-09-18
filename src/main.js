import './styles.css';
import { settings } from './settings.js';
import { applyTheme } from './theme.js';
import { showLibrary } from './library.js';
import { openReader } from './reader.js';
import { toast } from './ui.js';

const app = document.getElementById('app');
let view = null;
let fromLibrary = false;

applyTheme(settings.get().reader.theme);

const openBook = (id) => {
  fromLibrary = true;
  location.hash = `#/read/${encodeURIComponent(id)}`;
};

const exitReader = () => {
  if (fromLibrary) history.back();
  else location.replace('#/');
};

async function route() {
  const previous = view;
  view = null;
  await previous?.destroy?.();
  const m = location.hash.match(/^#\/read\/(.+)$/);
  try {
    view = m
      ? await openReader(app, decodeURIComponent(m[1]), { onExit: exitReader })
      : await showLibrary(app, { openBook });
  } catch (err) {
    console.error(err);
    toast(err.message || '開啟失敗', 3500);
    if (m) location.replace('#/');
  }
  if (!m) fromLibrary = false;
}

window.addEventListener('hashchange', route);
route();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
