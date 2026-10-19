import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelError, readModelError } from './providerError';
import { generate } from './openrouter';
import { requestJson } from './auxiliary';
import { readJsonStream } from './jsonStream';
import { createRoom } from '../domain/engine';
import { exampleWork } from '../test/exampleWork';

const key = 'fake-private-api-key';
const payload = {
  error: {
    code: 400,
    message: 'Provider returned error',
    metadata: {
      provider_name: 'Google',
      raw: JSON.stringify({
        error: { code: 400, message: 'Invalid request: response schema option is not accepted.' },
        echoed_request: { private_prompt: 'never display this request' },
      }),
    },
  },
};
const model = {
  id: 'google/gemini-3.8-flash',
  name: 'Gemini 3.8 Flash',
  context_length: 1000000,
  supported_parameters: ['structured_outputs'],
};
afterEach(() => vi.unstubAllGlobals());
describe('provider error explanations', () => {
  it('preserves the Google validation explanation without exposing the raw request', async () => {
    const error = await readModelError(new Response(JSON.stringify(payload), { status: 400 }), key);
    expect(error.message).toContain('(400)');
    expect(error.message).toContain('Google: Provider returned error');
    expect(error.message).toContain('response schema option is not accepted');
    expect(error.message).not.toContain('never display');
    expect(error.message).not.toContain('echoed_request');
  });
  it('redacts credentials before truncating and bounds all explanations', () => {
    const error = modelError(
      400,
      {
        error: {
          message: `${key} Bearer token-abc sk-or-v1-secret-123 ` + 'x'.repeat(3000),
          metadata: { provider_name: key, raw: { error: { message: key + 'y'.repeat(3000) } } },
        },
      },
      key,
    );
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain('token-abc');
    expect(error.message).not.toContain('sk-or-v1-secret');
    expect(error.message.length).toBeLessThan(1800);
  });
  it('falls back on non-JSON responses and does not expose arbitrary raw text', async () => {
    expect(
      (await readModelError(new Response('<html>proxy failure</html>', { status: 502 }))).message,
    ).toBe('모델 요청에 실패했습니다 (502).');
    expect(
      modelError(400, { error: { metadata: { raw: 'request body with private material' } } })
        .message,
    ).not.toContain('private material');
  });
  it.each([
    [401, 'API 키를 다시'],
    [402, '잔액이 부족'],
    [429, '요청이 많'],
  ])('keeps status guidance for %i', (status, expected) => {
    expect(modelError(status, null).message).toContain(expected);
  });
  it('does not turn a cancelled response-body read into a normal error', async () => {
    const response = new Response(null, { status: 400 });
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    await expect(readModelError(response)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('native chat shows the failure once and leaves the work and runtime intact', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    const room = createRoom(exampleWork()),
      before = structuredClone(room);
    await expect(
      generate(room, room.current, '안녕', model, key, new AbortController().signal, {
        reroll: false,
      }),
    ).rejects.toThrow('response schema option is not accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(room).toEqual(before);
  });
  it.each([400, 200])(
    'creator/summary callers also expose error envelopes under HTTP %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(payload), { status })),
      );
      await expect(
        requestJson('system', {}, model, key, new AbortController().signal),
      ).rejects.toThrow('response schema option is not accepted');
    },
  );
  it('retains error explanations inside an already-open stream', async () => {
    const response = new Response(`data: ${JSON.stringify(payload)}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    await expect(
      readJsonStream(response, () => {}, new AbortController().signal, key),
    ).rejects.toThrow('response schema option is not accepted');
  });
});
