// What the tutor is asked. The explanation adapts to what was selected:
// a word, a sentence, or a longer passage.

const L = {
  zh: {
    lang: '繁體中文',
    target: '繁體中文',
    h: { tr: '譯文', st: '句子結構', gr: '文法重點', vo: '詞彙', nu: '語感', gist: '大意', hard: '難句解析' },
    note: '註：',
  },
  en: {
    lang: 'English',
    target: 'English',
    h: { tr: 'Translation', st: 'Structure', gr: 'Grammar', vo: 'Vocabulary', nu: 'Nuance', gist: 'Gist', hard: 'Difficult sentences' },
    note: 'Note:',
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
- 使用簡潔的 Markdown：可以用 ### 小標題、列表、**粗體**；不要用表格，不要寒暄，不要複述題目。`;
}

/** 'word' | 'sentence' | 'passage' */
export function kindOf(text) {
  const t = text.trim();
  const stops = (t.match(/[。！？!?]/g) || []).length;
  if (t.length <= 14 && stops === 0 && !/[、，,\n]/.test(t)) return 'word';
  if (t.length > 160 || stops >= 3 || t.includes('\n')) return 'passage';
  return 'sentence';
}

export function userPrompt({ mode, target, sentence, context, source, lang }) {
  const l = L[lang] || L.zh;
  const h = l.h;
  const kind = kindOf(target);
  const head = `${source ? `出處：${source}\n\n` : ''}上下文：\n"""\n${context}\n"""\n\n`;

  if (mode === 'translate') {
    if (kind === 'word') {
      return `${head}「${target}」在這裡是什麼意思？它所在的句子：\n${sentence}\n\n先用一行寫出它在此處最貼切的${l.target}意思，再給出整句的譯文。`;
    }
    return `${head}請把下面這段翻譯成${l.target}：\n"""\n${target}\n"""\n\n直接給出譯文，不要加標題。譯文要忠實、自然，保留原作的語氣和文學質感。\n如果有直譯難以傳達的地方（擬聲擬態詞、文化背景、特別的比喻、省略的主語等），在譯文之後另起一段，以「${l.note}」開頭簡要說明，最多三條；沒有就不寫。`;
  }

  if (kind === 'word') {
    return `${head}請講解「${target}」在這句話裡的用法：\n${sentence}\n\n視需要包含：讀音與詞性（動詞註明原形和活用類型）；在此處的確切含義；常見用法和搭配；1–2 個自然的例句（附${l.target}翻譯）；容易混淆的近義表達。`;
  }
  if (kind === 'sentence') {
    return `${head}請講解這句話：\n${target}\n\n按下面的結構寫：\n### ${h.tr}\n### ${h.st}\n拆出主幹，再說明修飾成分、子句和被省略的成分之間的關係；長句可以用縮排的列表分層。\n### ${h.gr}\n每條寫成：**句型**（JLPT 級別）— 含義 — 在本句中的作用。\n### ${h.vo}\n只列有難度的詞：詞（讀音）— 釋義。\n### ${h.nu}\n文體、語氣或言外之意；沒有值得說的就省略這一節。`;
  }
  return `${head}請講解這段文字：\n${target}\n\n按下面的結構寫：\n### ${h.gist}\n### ${h.hard}\n挑出 1–3 個對學生最難的句子，逐一拆解結構。\n### ${h.gr}\n每條寫成：**句型**（JLPT 級別）— 含義 — 在文中的作用。\n### ${h.vo}\n只列有難度的詞：詞（讀音）— 釋義。`;
}
