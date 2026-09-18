// Reading themes. The app chrome reads the same palette through CSS variables
// (see styles.css); the page iframe gets these values injected directly.

export const THEMES = {
  paper: { label: '紙', bg: '#F6F1E7', fg: '#2A2724', muted: '#8B8479', hl: 'rgba(201,160,90,.30)', sel: 'rgba(201,160,90,.38)' },
  white: { label: '白', bg: '#FFFFFF', fg: '#1D1D1F', muted: '#8A8A8E', hl: 'rgba(255,204,0,.28)', sel: 'rgba(0,122,255,.22)' },
  night: { label: '夜', bg: '#151412', fg: '#CFC9BF', muted: '#77726A', hl: 'rgba(201,160,90,.28)', sel: 'rgba(201,160,90,.35)' },
};

export const FONTS = {
  mincho: { label: '明朝', css: '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif' },
  gothic: { label: '黑體', css: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", YuGothic, "Noto Sans JP", "Noto Sans CJK JP", sans-serif' },
};

export const LINE_HEIGHTS = [
  { label: '緊湊', value: 1.6 },
  { label: '標準', value: 1.85 },
  { label: '寬鬆', value: 2.1 },
];

export function applyTheme(name) {
  const t = THEMES[name] || THEMES.paper;
  document.documentElement.dataset.theme = name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}
