import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('기존 샘플 카드는 숨기고 대화·사용자 작품·백업은 유지', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.locator('.chat-scroll')).toBeVisible();
  const roomUrl = page.url();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(['works', 'profiles'], 'readwrite');
          const works = tx.objectStore('works');
          const read = works.get('example-garden');
          read.onsuccess = () => {
            const sample = read.result;
            sample.owned = false;
            works.put(sample);
            const copy = structuredClone(sample);
            copy.id = 'user-copy';
            copy.work.id = copy.id;
            copy.work.title = '사용자 작품';
            copy.owned = true;
            works.put(copy);
          };
          const profile = tx.objectStore('profiles').get('profile');
          profile.onsuccess = () => {
            const value = profile.result;
            value.hideExamples = false;
            value.carousels = [
              {
                id: 'user-carousel',
                name: '내 캐러셀',
                mode: 'slide',
                workIds: ['example-garden', 'user-copy'],
              },
            ];
            tx.objectStore('profiles').put(value);
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onabort = () => {
            database.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '사용자 작품 대화 시작', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('개발자가 만든 작품들', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '작품 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: '정원 앞에서 선택', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사용자 작품 선택', exact: true })).toBeVisible();
  await page.goto(roomUrl);
  await expect(page.locator('.chat-scroll')).toContainText('아리아');
  await page.reload();
  await expect(page.locator('.chat-scroll')).toContainText('아리아');
  const counts = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(['works', 'rooms']);
          const works = tx.objectStore('works').count();
          const rooms = tx.objectStore('rooms').count();
          tx.oncomplete = () => {
            database.close();
            resolve([works.result, rooms.result]);
          };
        };
      }),
  );
  expect(counts).toEqual([2, 1]);
  await page.goto('/');
  await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
  const backup = JSON.parse(await fs.readFile((await (await pending).path())!, 'utf8'));
  expect(backup.works.map((entry: { id: string }) => entry.id).sort()).toEqual([
    'example-garden',
    'user-copy',
  ]);
  expect(backup.rooms).toHaveLength(1);
});
