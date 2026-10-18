import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { join } from 'node:path';
test('Risu 실제 대화방: 원본 UI·게임 요청·응답 후 계산·복원', async ({ page }) => {
  test.setTimeout(60000);
  test.skip(!process.env.RISU_EXAMPLES_DIR, 'Private card fixture');
  const sent: any[] = [];
  await page.route('https://openrouter.ai/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/chat/completions')) {
      sent.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          choices: [
            { finish_reason: 'stop', message: { content: '낡은 길을 따라 걸었다.\n[TIME|+30m]' } },
          ],
          usage: { prompt_tokens: 123, completion_tokens: 45, cost: 0.001 },
        },
      });
    }
    if (url.endsWith('/models'))
      return route.fulfill({
        json: {
          data: [
            {
              id: 'test/risu',
              name: 'Risu test',
              context_length: 200000,
              supported_parameters: [],
            },
          ],
        },
      });
    return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^제목/ })).toBeVisible();
  const name = (await fs.readdir(process.env.RISU_EXAMPLES_DIR!)).find((n) => n.endsWith('.png'))!;
  await page
    .locator('input[accept*=".charx"]')
    .setInputFiles(join(process.env.RISU_EXAMPLES_DIR!, name));
  await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
  await page.getByRole('button', { name: '제작완료', exact: true }).click();
  await expect(
    page.getByText('작품 v1을 내 라이브러리에 반영했습니다.', { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('XenoTale:openrouter:v1') },
      key,
      new TextEncoder().encode('fake-test-key'),
    );
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('xenotale-v1');
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction(['profiles', 'credentials'], 'readwrite'),
          get = tx.objectStore('profiles').get('profile');
        get.onsuccess = () => {
          const profile = get.result;
          profile.defaultModel = 'test/risu';
          profile.creatorTestModel = 'test/risu';
          tx.objectStore('profiles').put(profile);
        };
        tx.objectStore('credentials').put({ id: 'openrouter', key, iv, ciphertext });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.goto('/#/');
  await page.reload();
  await page.getByRole('button', { name: '던전 앤 다이스 대화 시작', exact: true }).click();
  const intro = page.frameLocator('.opening-scene .risu-message iframe');
  await expect(intro.getByRole('button', { name: '골리앗', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(intro.locator('.dnd-intro').first()).toHaveCSS(
    'background-color',
    'rgb(31, 25, 20)',
  );
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('모험을 시작한다.');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await page.locator('.assistant-section').last().scrollIntoViewIfNeeded();
  const reply = page.frameLocator('.assistant-section .risu-message iframe').last();
  await expect(reply.getByText('낡은 길을 따라 걸었다.', { exact: false })).toBeVisible({
    timeout: 20000,
  });
  expect(sent).toHaveLength(1);
  const prompt = JSON.stringify(sent[0].messages);
  expect(prompt).toContain('GAME STATE');
  expect(prompt).toContain('DICE');
  expect(prompt).not.toContain('function onButtonClick');
  expect(sent[0].response_format).toBeUndefined();
  const check = () =>
    page.evaluate(
      () =>
        new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction('rooms').objectStore('rooms').getAll();
            get.onsuccess = () => {
              db.close();
              resolve(get.result[0]);
            };
            get.onerror = () => reject(get.error);
          };
        }),
    );
  await expect
    .poll(async () => (await check())?.timeline.filter((e: any) => e.kind === 'turn').length)
    .toBe(1);
  const room = await check(),
    turn = room.timeline.find((e: any) => e.kind === 'turn');
  expect(turn.candidates[0].body).toContain('[TIME|+30m|ok|');
  expect(turn.candidates[0].body).toContain('[STATUS|');
  expect(room.current.runtime.risu.dnd_lua_error ?? '').toBe('');
  await reply.locator('[data-risu-trigger="dnd_drawer_toggle"]').click();
  await expect(reply.getByText('모험 설정', { exact: false })).toBeVisible();
  await expect.poll(async () => (await check()).current.runtime.risu.dnd_drawer_open).toBe('1');
  await page.reload();
  await page.locator('.assistant-section').last().scrollIntoViewIfNeeded();
  await expect(reply.getByText('낡은 길을 따라 걸었다.', { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await expect(reply.getByText('모험 설정', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/risu-room.png' });
  await expect(reply.locator('.dnd-pane-1')).toBeVisible();
  await reply.locator('[data-risu-trigger="dnd_drawer_close"]').last().click();
  await expect(reply.locator('.dnd-panel')).not.toBeVisible();
  await expect.poll(async () => (await check()).current.runtime.risu.dnd_drawer_open).toBe('0');
  const clock = (await check()).current.runtime.risu.__dnd_clock;
  await page.getByRole('button', { name: '리롤', exact: true }).click();
  await page.getByRole('button', { name: '다른 응답 생성', exact: true }).click({ timeout: 5000 });
  await expect
    .poll(
      async () => (await check()).timeline.find((e: any) => e.kind === 'turn').candidates.length,
    )
    .toBe(2);
  expect(sent).toHaveLength(2);
  expect((await check()).current.runtime.risu.__dnd_clock).toBe(clock);
});
