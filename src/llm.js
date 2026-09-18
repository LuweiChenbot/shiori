// One entry point for tutor requests, whichever supplier is selected.

export class TutorError extends Error {
  constructor(message, kind = 'error') {
    super(message);
    this.kind = kind;
  }
}

/**
 * Stream one reply. `task` is 'translate' | 'explain' | 'followup'.
 * Resolves with { content, model, truncated }; `content` is what to append to
 * the conversation as the assistant turn for follow-up questions.
 */
export async function streamReply({ provider, apiKey, model, ...rest }) {
  if (!apiKey) throw new TutorError('還沒有設定 API Key。', 'nokey');
  const impl = provider === 'anthropic' ? await import('./claude.js') : await import('./deepseek.js');
  return impl.streamReply({ apiKey, model, ...rest });
}

/** Plain text of a message's content, whatever shape a supplier stored. */
export function plainText(content) {
  if (typeof content === 'string') return content;
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}
