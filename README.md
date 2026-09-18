# 栞 Shiori

A Japanese reading app for exam prep. Import an EPUB or TXT, read it Kindle-style, select a word, sentence or paragraph, and get a translation or a teacher-style explanation (structure, grammar with JLPT levels, vocabulary, nuance) from DeepSeek or Claude. You can ask follow-up questions. The interface is in Traditional Chinese.

It is a PWA: it runs in Safari and can be added to the iPhone home screen, where it opens full-screen like a native app. Books, reading progress and settings stay on the device.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, also reachable from your phone on the same Wi-Fi
npm run build      # static site in dist/
npm run deploy     # build and publish to GitHub Pages
```

On an iPhone on the same Wi-Fi, open `http://<your-Mac-IP>:5173`.

`npm run deploy` builds the site and publishes it to the `gh-pages` branch, which GitHub Pages serves. Open the Pages URL in Safari and choose Share → Add to Home Screen. HTTPS is what enables offline use, and a fixed address keeps your library in one place.

## Using it

- **Turning pages:** tap the right or left third of the screen, or swipe. Tap the middle to show the toolbar (table of contents, Aa typography settings, progress slider).
- **Studying:** long-press to select text, then tap **講解** or **翻譯**. In the sheet you can widen the scope to **整句** (the full sentence) or **整段** (the paragraph) and type follow-up questions.
- **Settings (⚙ on the shelf):** the AI supplier and its API key, the model, and the explanation language. DeepSeek offers Flash (default) and V4 Pro; Claude offers Sonnet 5 (default), Opus 5 and Haiku 4.5. Each supplier remembers its own key and model. Translations run without thinking for speed; explanations and follow-ups think first.
- **Library:** the book you opened last is under 繼續閱讀; the rest follow as a list with their progress. The tab bar switches to 搜尋 (filter by title or author) and opens 設定. Long-press a book to edit its title and author or to remove it.

## Formats

- EPUB 2/3 without DRM. Vertical (縦書き) books are shown horizontally, as JLPT texts are.
- TXT in UTF-8 or Shift_JIS. Aozora Bunko files work directly: ruby `漢字《かな》` becomes furigana and 見出し annotations become chapters.

Store-bought ebooks (Kindle, Kobo, BookWalker, Apple Books) are DRM-protected and cannot be opened by any third-party reader.

## Layout

```
src/
  main.js          routing between shelf and reader
  library.js       library (current book + list), search, import, edit/delete
  reader.js        reading screen, TOC, Aa panel, progress
  paginator.js     iframe + CSS-column pagination, gestures, selection events
  textsel.js       selection → {selection, sentence, paragraph, context}, furigana stripped
  book.js          EPUB parsing (JSZip), TXT/Aozora parsing, import
  tutor.js         translation/explanation sheet with follow-ups
  prompts.js       tutor prompts
  llm.js           supplier-independent entry point
  deepseek.js      DeepSeek chat completions (streaming)
  claude.js        Claude API client (streaming, fallbacks); loaded only when Claude is selected
  markdown.js      small, escaping Markdown renderer
  settings*.js, theme.js, ui.js, db.js, styles.css
public/            manifest, icons, service worker, sample book
tools/             generators for the sample books and icons
test-books/        local test files (git-ignored, never deployed)
```

The sample book 《雨の図書館》 is original text written for testing.
