// Claude API access, straight from the browser with the user's own key.
// The key never leaves this device except in requests to api.anthropic.com.

import Anthropic from '@anthropic-ai/sdk';
import { TutorError } from './llm.js';

// Translation is quick work; explanations think harder when deep thinking is on.
const effortFor = (task, deepThink) => (task !== 'translate' && deepThink ? 'medium' : 'low');

function explain(err) {
  if (err instanceof TutorError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new TutorError('已取消', 'abort');
  if (err instanceof Anthropic.AuthenticationError) return new TutorError('API Key 無效，請到「設定」檢查。', 'auth');
  if (err instanceof Anthropic.PermissionDeniedError) return new TutorError('這個 API Key 沒有權限使用所選模型。', 'auth');
  if (err instanceof Anthropic.NotFoundError) return new TutorError('找不到所選模型，請到「設定」換一個。');
  if (err instanceof Anthropic.RateLimitError) return new TutorError('請求太頻繁或已達額度上限，請稍後再試。');
  if (err instanceof Anthropic.BadRequestError) return new TutorError(`請求被拒絕：${err.message}`);
  if (err instanceof Anthropic.InternalServerError) return new TutorError('Claude 服務暫時繁忙，請稍後重試。');
  if (err instanceof Anthropic.APIConnectionError) return new TutorError('網路連線失敗，請檢查網路。');
  if (err instanceof Anthropic.APIError) return new TutorError(`出錯了（${err.status ?? '未知'}）：${err.message}`);
  return new TutorError(err?.message || String(err));
}

export async function streamReply({ apiKey, model, system, messages, task, deepThink, onText, signal }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const params = { model, max_tokens: 16000, system, messages };
  // Haiku 4.5 does not take an effort setting; Opus 5 and Sonnet 5 think adaptively by default.
  if (!model.startsWith('claude-haiku')) params.output_config = { effort: effortFor(task, deepThink) };
  if (model === 'claude-opus-5') {
    // If a safety classifier declines, the API retries on its recommended fallback model.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  try {
    const stream = client.beta.messages.stream(params, { signal });
    stream.on('text', (delta) => onText(delta));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      throw new TutorError('這段內容觸發了模型的安全限制，沒有生成回答。', 'refusal');
    }
    return { content: echoContent(message.content), model: message.model, truncated: message.stop_reason === 'max_tokens' };
  } catch (err) {
    throw explain(err);
  }
}

/**
 * Assistant content to send back on the next turn. After a mid-output
 * fallback, reasoning blocks from before the switch are dropped.
 */
function echoContent(content) {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  const out = [];
  content.forEach((b, i) => {
    const beforeSwitch = i < lastFallback;
    if (b.type === 'text') out.push({ type: 'text', text: b.text });
    else if (b.type === 'thinking' && !beforeSwitch) out.push({ type: 'thinking', thinking: b.thinking, signature: b.signature });
    else if (b.type === 'redacted_thinking' && !beforeSwitch) out.push({ type: 'redacted_thinking', data: b.data });
  });
  return out;
}
