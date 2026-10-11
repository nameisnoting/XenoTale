import { describe, it, expect } from 'vitest';
import { previewReply, readJsonStream } from './jsonStream';
import { requestJson } from './auxiliary';
import { vi, afterEach } from 'vitest';

afterEach(() => vi.unstubAllGlobals());
const model = {
  id: 'test/stream',
  name: 'Test',
  context_length: 200000,
  supported_parameters: ['response_format'],
};
function stream(events: unknown[]) {
  const text =
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') +
    'data: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
describe('creator JSON streaming', () => {
  it('previews only the reply and safely decodes incomplete escapes', () => {
    expect(previewReply('{"reply":"설명\\n새 줄\\uAC')).toBe('설명\n새 줄');
    expect(previewReply('{"reply":"설명\\n새 줄\\uAC00\\"인용\\"","proposals":[')).toBe(
      '설명\n새 줄가"인용"',
    );
    expect(previewReply('{"proposals":[{"reply":"내부 값"}')).toBe('');
  });
  it('handles split UTF-8 and SSE frames and reports progress before the final response', async () => {
    const progress: any[] = [];
    const content = '{"reply":"새로운 설정입니다.","proposals":[],"questions":[]}';
    const result = await readJsonStream(
      stream([
        { choices: [{ delta: { reasoning: 'private reasoning' } }] },
        { choices: [{ delta: { content: content.slice(0, 17) } }] },
        { choices: [{ delta: { content: content.slice(17) }, finish_reason: 'stop' }] },
      ]),
      (value) => progress.push(value),
      new AbortController().signal,
    );
    expect(result).toEqual({ content, finishReason: 'stop' });
    expect(progress[0].thinking).toBe(true);
    expect(progress[1].receivedChars).toBeLessThan(content.length);
    expect(progress.at(-1).reply).toBe('새로운 설정입니다.');
    expect(JSON.stringify(progress)).not.toContain('private reasoning');
  });
  it('requests streaming only for the creator and validates the complete JSON', async () => {
    let payload: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => {
        payload = JSON.parse(options.body);
        return stream([
          {
            choices: [
              {
                delta: { content: '{"reply":"완료","proposals":[],"questions":[]}' },
                finish_reason: 'stop',
              },
            ],
          },
        ]);
      }),
    );
    const answer = await requestJson(
      'system',
      {},
      model,
      'fake-key',
      new AbortController().signal,
      { onProgress: () => {} },
    );
    expect(payload.stream).toBe(true);
    expect(answer.reply).toBe('완료');
  });
  it('rejects truncated streams and provider errors without returning proposals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        stream([{ choices: [{ delta: { content: '{"reply":"잘림' }, finish_reason: 'length' }] }]),
      ),
    );
    await expect(
      requestJson('system', {}, model, 'fake-key', new AbortController().signal, {
        onProgress: () => {},
      }),
    ).rejects.toThrow('완성되지');
    await expect(
      readJsonStream(
        stream([{ error: { message: 'failed' } }]),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('오류');
  });
  it('cancels a blocked read immediately when the request is aborted', async () => {
    const controller = new AbortController();
    const result = readJsonStream(new Response(new ReadableStream()), () => {}, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('accepts providers returning an ordinary JSON response to a streaming request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: '{"reply":"완료"}' } }],
        }),
      ),
    );
    await expect(
      requestJson('system', {}, model, 'fake-key', new AbortController().signal, {
        onProgress: () => {},
      }),
    ).resolves.toEqual({ reply: '완료' });
  });
});
