// What the tutor is asked. Every explanation has the same five sections in the
// same order, whatever was selected, so answers are easy to scan and compare.

const L = {
  zh: {
    lang: '繁體中文',
    explain: ['譯文', '詞語', '句法', '句子結構', '語氣語感'],
    translate: ['譯文', '註'],
    none: '—',
  },
  en: {
    lang: 'English',
    explain: ['Translation', 'Vocabulary', 'Grammar', 'Structure', 'Tone & nuance'],
    translate: ['Translation', 'Notes'],
    none: '—',
  },
};

export function systemPrompt({ lang }) {
  const l = L[lang] || L.zh;
  return `你是一位耐心、專業的日語老師。學生正在準備日語閱讀考試，用日語原版小說練習閱讀。學生會從正在讀的書裡選出一段文字，請你翻譯或講解。

原則：
- 用${l.lang}講解；日語原文、詞語和例句保持日語。
- 一切以原文語境為準：結合上下文判斷詞義、被省略的主語、指代對象和說話人的語氣。
- 只為較難或容易讀錯的漢字詞注音，寫成「漢字（かんじ）」；常見詞不必注音。
- 講解要有取捨：重點放在對考生真正有用的地方，過於基礎的內容一筆帶過或不講。
- 翻譯和講解必須嚴格使用學生要求的格式；追問則直接、簡潔地回答。
- 不要用表格，不要寒暄。`;
}

const isWord = (t) => t.trim().length <= 14 && !/[。！？!?、，,\n]/.test(t);

function skeleton(headings, none) {
  return `嚴格按下面的格式輸出：小標題一字不改、順序不變、全部都要出現；某一節沒有內容時只寫「${none}」。不要開場白，也不要結語。

${headings.map((h) => `### ${h}`).join('\n')}`;
}

export function userPrompt({ mode, target, sentence, context, source, lang }) {
  const l = L[lang] || L.zh;
  const word = isWord(target);
  const head = `${source ? `出處：${source}\n\n` : ''}上下文：\n"""\n${context}\n"""\n\n所選內容：\n"""\n${target}\n"""\n${word ? `它所在的句子：${sentence}\n` : ''}\n`;

  if (mode === 'translate') {
    const [tr, notes] = l.translate;
    return `${head}請翻譯所選內容。

${skeleton(l.translate, l.none)}

各節寫法：
- ${tr}：${word ? '第一行寫它在此處最貼切的意思，第二行寫整句譯文。' : '忠實、自然，保留原作的語氣和文學質感。'}
- ${notes}：直譯難以傳達的地方（擬聲擬態詞、文化背景、特別的比喻、省略的主語等），每條一行，最多三條。`;
  }

  const [tr, vocab, grammar, structure, tone] = l.explain;
  return `${head}請講解所選內容。

${skeleton(l.explain, l.none)}

各節寫法：
- ${tr}：${word ? '第一行寫它在此處的意思，第二行寫整句譯文。' : '通順、忠實的譯文。'}
- ${vocab}：每條一行，格式固定為「- **詞語（讀音）** — 詞性 — 在此處的意思」；動詞加註原形。只列值得學的詞，最多 6 條。
- ${grammar}：每條一行，格式固定為「- **句型**（JLPT 級別）— 意思 — 在這裡的作用」，最多 4 條。
- ${structure}：用縮排列表拆出主幹、修飾和被省略的成分。${word ? '所選是詞語，說明它在句中擔任什麼角色。' : '所選超過一句時，只拆解最難的一到兩句。'}
- ${tone}：一到三句，說明文體、語氣、說話人的態度或言外之意。`;
}
