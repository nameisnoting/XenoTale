import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/workspace-actions';
async function start(page: Page, width: number, withRoom = false) {
  await page.setViewportSize({ width, height: 1000 });
  await page
    .context()
    .route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  if (withRoom) {
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
  }
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
  await expect(page.locator('.editor-shell')).toBeVisible();
  await fs.mkdir(out, { recursive: true });
}
async function history(page: Page, width: number) {
  if (width < 800) await page.getByRole('button', { name: '제작 도구', exact: true }).click();
  await page.getByRole('button', { name: '작업내역', exact: true }).click();
}
async function records(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ workspaces: any[]; works: any[]; rooms: any[] }>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['workspaces', 'works', 'rooms'], 'readonly');
          const workspaces = tx.objectStore('workspaces').getAll();
          const works = tx.objectStore('works').getAll();
          const rooms = tx.objectStore('rooms').getAll();
          tx.oncomplete = () => {
            db.close();
            resolve({ workspaces: workspaces.result, works: works.result, rooms: rooms.result });
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
async function createTab(page: Page) {
  const next = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
  const tab = await next;
  await tab.setViewportSize(page.viewportSize()!);
  await expect(tab).toHaveURL(/#\/create\//);
  await expect(tab.locator('.editor-shell')).toBeVisible();
  return tab;
}
for (const width of [1440, 393]) {
  test(`체크박스 선택 삭제 · 취소 · 현재 초안과 미선택 작업 보존 · 전체 선택 (${width})`, async ({
    page,
  }) => {
    await start(page, width, true);
    const currentURL = page.url();
    await page.getByRole('textbox', { name: '제목', exact: false }).fill('현재 초안');
    await history(page, width);
    const plus = page.getByRole('button', { name: '새 작업 공간', exact: true });
    const trash = page.getByRole('button', { name: '작업 공간 선택 삭제', exact: true });
    expect((await trash.boundingBox())!.x).toBeLessThan((await plus.boundingBox())!.x);
    const tab = await createTab(page);
    await tab.getByRole('textbox', { name: '제목', exact: false }).fill('삭제 대상');
    await expect(page).toHaveURL(currentURL);
    expect(await tab.evaluate(() => window.opener === null)).toBe(true);
    const before = await records(page);
    expect(before.workspaces).toHaveLength(2);
    expect(before.workspaces.find((w) => currentURL.endsWith(w.id)).work.title).toBe('현재 초안');
    const workSnapshot = before.works;
    const roomSnapshot = before.rooms;
    await trash.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const deleteButton = page.getByRole('button', { name: '선택한 작업 공간 삭제', exact: true });
    await expect(deleteButton).toBeDisabled();
    await page.getByRole('checkbox', { name: '삭제 대상 선택', exact: true }).check();
    await expect(page).toHaveURL(currentURL);
    await page.screenshot({ path: `${out}/selection-${width}.png` });
    await deleteButton.click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('선택한 작업 공간 1개');
    await expect(dialog.locator('.workspace-delete-list')).toHaveText('삭제 대상');
    await expect(dialog).not.toContainText('현재 열려 있는 작업도 삭제');
    await expect(dialog).toContainText('복구할 수 없습니다');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    expect((await records(page)).workspaces).toHaveLength(2);
    await expect(page.getByRole('checkbox', { name: '삭제 대상 선택', exact: true })).toBeChecked();
    await deleteButton.click();
    dialog = page.getByRole('dialog');
    await page.screenshot({ path: `${out}/confirm-${width}.png` });
    // A different tab may create a draft after the confirmation snapshot was shown.
    await history(tab, width);
    const newer = await createTab(tab);
    const newerId = newer.url().split('/').at(-1)!;
    await expect.poll(async () => (await records(page)).workspaces.length).toBe(3);
    await expect(dialog).toContainText('선택한 작업 공간 1개');
    await dialog.getByRole('button', { name: '선택 삭제', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(currentURL);
    await expect(tab.getByText('작업 공간을 찾을 수 없습니다.', { exact: false })).toBeVisible();
    await expect(newer.locator('.editor-shell')).toBeVisible();
    const after = await records(page);
    expect(after.workspaces.map((w) => w.id).sort()).toEqual(
      [newerId, currentURL.split('/').at(-1)!].sort(),
    );
    expect(after.works).toEqual(workSnapshot);
    expect(after.rooms).toEqual(roomSnapshot);
    await expect(page.locator('.workspace-selection-tools')).toHaveCount(0);
    await trash.click();
    const all = page.getByRole('checkbox', { name: '작업 공간 전체 선택', exact: true });
    await all.check();
    await expect(page.locator('.recent-workspaces input:checked')).toHaveCount(2);
    await page.getByRole('checkbox', { name: '현재 초안 선택', exact: true }).uncheck();
    await expect(page.locator('.recent-workspaces input:checked')).toHaveCount(1);
    await page
      .locator('.workspace-selection-tools')
      .getByRole('button', { name: '취소', exact: true })
      .click();
    await expect(page.locator('.recent-workspaces input')).toHaveCount(0);
    expect((await records(page)).workspaces).toHaveLength(2);
    await trash.click();
    await all.check();
    await deleteButton.click();
    await expect(dialog).toContainText('현재 열려 있는 작업도 삭제');
    await dialog.getByRole('button', { name: '선택 삭제', exact: true }).click();
    await expect(page).toHaveURL(/#\/$/);
    expect((await records(page)).workspaces).toHaveLength(0);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page.locator('.editor-shell')).toBeVisible();
    expect((await records(page)).workspaces).toHaveLength(1);
    await tab.close();
    await newer.close();
  });
  test(`제작 재진입은 마지막 공간 · 예전 작업을 열어도 기억 · 새 작업 누적 없음 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    const originalURL = page.url();
    await page.getByRole('textbox', { name: '제목', exact: false }).fill('처음 작업');
    await history(page, width);
    const tab = await createTab(page);
    await tab.getByRole('textbox', { name: '제목', exact: false }).fill('두 번째 작업');
    await page
      .locator('.recent-workspaces')
      .getByRole('button', { name: /두 번째 작업/ })
      .click();
    await expect(page).toHaveURL(tab.url());
    await history(page, width);
    await page
      .locator('.recent-workspaces')
      .getByRole('button', { name: /처음 작업/ })
      .click();
    await expect(page).toHaveURL(originalURL);
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '메인으로', exact: true }).click();
      await page
        .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
        .click();
      await expect(page).toHaveURL(originalURL);
      await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
        '처음 작업',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect((await records(page)).workspaces).toHaveLength(2);
      await page.reload();
      await expect(page.locator('.editor-shell')).toBeVisible();
    }
    await tab.close();
  });
}
test('팝업 차단 시 현재 페이지 유지 · 빈 작업 생성 없음', async ({ page }) => {
  await start(page, 1440);
  const url = page.url();
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '팝업 차단' })).toBeVisible();
  await expect(page).toHaveURL(url);
  expect((await records(page)).workspaces).toHaveLength(1);
});
