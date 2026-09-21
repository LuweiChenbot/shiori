// DeepSeek chat completions (OpenAI-compatible), streamed straight from the
// browser with the user's own key.

import { TutorError, plainText } from './llm.js';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';

const STATUS = {
  400: '請求格式有誤。',
  401: 'API Key 無效，請到「設定」檢查。',
  402: 'DeepSeek 帳戶餘額不足，請先儲值。',
  422: '請求參數有誤，請換一個模型試試。',
  429: '請求太頻繁，請稍後再試。',
  500: 'DeepSeek 伺服器出錯，請稍後重試。',
  503: 'DeepSeek 伺服器繁忙，請稍後重試。',
};

export async function streamReply({ apiKey, model, system, messages, task, deepThink, onText, signal }) {
  const body = {
    model,
    stream: true,
    max_tokens: 16000,
    messages: [
      { role: 'system', content: system },
      // Earlier assistant turns may have been produced by another supplier.
      ...messages.map((m) => ({ role: m.role, content: plainText(m.content) })),
    ],
  };
  // Thinking makes explanations a little sharper but delays the first word by
  // half a minute, so it is opt-in and never used for translation.
  if (deepThink && task !== 'translate') {
    body.thinking = { type: 'enabled' };
    body.reasoning_effort = 'low';
  } else {
    body.thinking = { type: 'disabled' };
    // Low temperature keeps the fixed answer format steady (thinking mode ignores it).
    if (task !== 'followup') body.temperature = 0.3;
  }

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new TutorError('已取消', 'abort');
    throw new TutorError('網路連線失敗，請檢查網路。');
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      // Body was not JSON.
    }
    const kind = res.status === 401 ? 'auth' : 'error';
    throw new TutorError(STATUS[res.status] || `出錯了（${res.status}）${detail ? `：${detail}` : ''}`, kind);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finish = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          onText(delta);
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new TutorError('已取消', 'abort');
    throw new TutorError('連線中斷，請重試。');
  }

  if (finish === 'content_filter') throw new TutorError('這段內容觸發了 DeepSeek 的內容限制，沒有生成回答。', 'refusal');
  if (finish === 'insufficient_system_resource') throw new TutorError('DeepSeek 資源不足，請稍後重試。');
  return { content: text, model, truncated: finish === 'length' };
}

/** One JSON answer (no streaming), for background work such as readings. */
export async function completeJSON({ apiKey, model, system, prompt, thinking = false, maxTokens = 8000, signal }) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        ...(thinking
          ? { thinking: { type: 'enabled' }, reasoning_effort: 'low', max_tokens: 32000 }
          : { thinking: { type: 'disabled' }, temperature: 0.1, max_tokens: maxTokens }),
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
      signal,
    });
  } catch (err) {
    throw new TutorError(err.name === 'AbortError' ? '已取消' : '網路連線失敗', err.name === 'AbortError' ? 'abort' : 'error');
  }
  if (!res.ok) throw new TutorError(STATUS[res.status] || `出錯了（${res.status}）`, res.status === 401 ? 'auth' : 'error');
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}
