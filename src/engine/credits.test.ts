import { afterEach, expect, it, vi } from 'vitest';
import { CreditsError, formatCredits, readCredits } from './credits';
afterEach(() => vi.unstubAllGlobals());
it('does not request credits without a key and distinguishes zero from positive and negative balances', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(await readCredits(' ')).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(formatCredits(0)).toBe('0');
  expect(formatCredits(12.345678)).toBe('$12.345678');
  expect(formatCredits(-0.01)).toBe('−$0.01');
  expect(formatCredits(0.00000001)).toBe('<$0.000001');
});
it('uses account credits minus total usage, with authentication and cancellation', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: { total_credits: 20, total_usage: 7.5 } })),
    );
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  expect(await readCredits('fake-key', signal)).toBe(12.5);
  expect(fetch).toHaveBeenCalledWith(
    'https://openrouter.ai/api/v1/credits',
    expect.objectContaining({
      headers: { Authorization: 'Bearer fake-key' },
      signal,
      cache: 'no-store',
    }),
  );
});
it('does not substitute missing account data, key spending limits, or permission errors with zero', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const data of [
    {},
    { limit_remaining: 100 },
    { total_credits: null, total_usage: 0 },
    { total_credits: 20, total_usage: '7.5' },
  ]) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ data })));
    await expect(readCredits('fake')).rejects.toBeInstanceOf(CreditsError);
  }
  fetch.mockResolvedValueOnce(new Response('', { status: 403 }));
  await expect(readCredits('fake')).rejects.toMatchObject({
    status: 403,
    message: expect.stringContaining('조회 권한'),
  });
  fetch.mockResolvedValueOnce(new Response('', { status: 401 }));
  await expect(readCredits('fake')).rejects.toMatchObject({ status: 401 });
});
