import { modelError } from './providerError';
export type JsonProgress = { reply: string; receivedChars: number; thinking: boolean };

// Only preview the first, top-level reply string. Incomplete proposal JSON must
// never become editable work data before the complete response is validated.
export function previewReply(content: string): string {
  const prefix = /^\s*(?:```(?:json)?\s*)?\{\s*"reply"\s*:\s*"/.exec(content);
  if (!prefix) return '';
  let reply = '';
  for (let index = prefix[0].length; index < content.length; index++) {
    const char = content[index];
    if (char === '"') break;
    if (char !== '\\') {
      reply += char;
      continue;
    }
    const end = index + (content[index + 1] === 'u' ? 6 : 2);
    if (end > content.length) break;
    try {
      reply += JSON.parse(`"${content.slice(index, end)}"`);
    } catch {
      break;
    }
    index = end - 1;
  }
  return reply;
}

export async function readJsonStream(
  response: Response,
  onProgress: (progress: JsonProgress) => void,
  signal: AbortSignal,
  apiKey = '',
): Promise<{ content: string; finishReason: string | null }> {
  if (!response.body) throw new Error('모델의 응답 스트림을 읽지 못했습니다.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    content = '',
    finishReason: string | null = null,
    done = false;
  const abort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', abort, { once: true });
  const consume = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data.trim() === '[DONE]') {
      done = true;
      return;
    }
    const chunk = JSON.parse(data);
    if (chunk.error) throw modelError(response.status, chunk, apiKey);
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (typeof choice.delta?.content === 'string') content += choice.delta.content;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    onProgress({
      reply: previewReply(content),
      receivedChars: content.length,
      thinking:
        !content.length && !!(choice.delta?.reasoning || choice.delta?.reasoning_details?.length),
    });
  };
  try {
    signal.throwIfAborted();
    while (!done) {
      const part = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(part.value, { stream: !part.done });
      let boundary: RegExpExecArray | null;
      while (!done && (boundary = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (part.done) {
        if (!done && buffer.trim()) consume(buffer);
        break;
      }
    }
    return { content, finishReason };
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
