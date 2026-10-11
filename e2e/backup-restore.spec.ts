import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function roomIds(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('rooms', 'readonly');
          const read = transaction.objectStore('rooms').getAllKeys();
          read.onsuccess = () => {
            database.close();
            resolve(read.result as string[]);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
  );
}
async function restore(page: Page, file: string, expectedCount: number) {
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const toast = page.locator('.toast');
  await expect(toast).toContainText('자료를 가져왔습니다.');
  await expect
    .poll(() => toast.evaluate((e) => e.isConnected && e.matches(':popover-open')))
    .toBe(true);
  await expect.poll(async () => (await roomIds(page)).length).toBe(expectedCount);
  await expect(page.locator('.library-layout')).toBeVisible();
  await expect(page.locator('.fatal')).toHaveCount(0);
  await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
  await page.goto('/#/rooms');
  await expect(page.locator('.room-manager .room-list-item')).toHaveCount(expectedCount);
  await page.locator('.room-manager .room-list-open').last().click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
}
for (const width of [1440, 393]) {
  test(`백업 복원 즉시 화면·완료 알림·원본 보존·반복 복원·다른 브라우저 (${width})`, async ({
    page,
    browser,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.getByTestId('status-affinity')).toHaveText('12');
    const original = await roomIds(page);
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
    const file = (await (await download).path())!;
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await restore(page, file, 2);
    expect(await roomIds(page)).toEqual(expect.arrayContaining(original));
    await restore(page, file, 3);
    expect(await roomIds(page)).toEqual(expect.arrayContaining(original));
    await page.reload();
    expect(await roomIds(page)).toHaveLength(3);
    expect(errors).toEqual([]);
    const fresh = await browser.newContext();
    try {
      const target = await fresh.newPage();
      const targetErrors: string[] = [];
      target.on('pageerror', (e) => targetErrors.push(e.message));
      await start(target, width);
      await restore(target, file, 1);
      await target.reload();
      expect(await roomIds(target)).toHaveLength(1);
      expect(targetErrors).toEqual([]);
    } finally {
      await fresh.close();
    }
  });
}
