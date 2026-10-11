import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/media-sort';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}
async function editor(page: Page) {
  await start(page);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
}
async function section(page: Page, name: string) {
  if ((await page.viewportSize())!.width <= 800)
    await page.getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function drag(page: Page, handle: Locator, target: Locator, bottom = false) {
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + (bottom ? to.height - 10 : 10), { steps: 12 });
  await page.mouse.up();
}
test('미디어 카드 시안 · 커서에 코드 삽입 · 검증 후 등록 · 재접속과 초안 유지', async ({
  page,
}) => {
  await editor(page);
  await section(page, '미디어');
  const media = page.locator('.media-editor');
  await expect(media.locator('.media-card')).toHaveCount(3);
  await expect(media.getByText('공용 =')).toBeVisible();
  const register = media.getByRole('button', { name: '이미지 등록', exact: true });
  await expect(register).toBeDisabled();
  expect(await register.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(43, 43, 43)',
  );
  const min = media.getByRole('spinbutton', { name: '최솟값', exact: true });
  const max = media.getByRole('spinbutton', { name: '최댓값', exact: true });
  await expect(min).toHaveValue('1');
  await expect(max).toHaveValue('999');
  expect((await min.boundingBox())!.height).toBeLessThanOrEqual(24);
  await page.screenshot({ path: `${out}/media-empty.png` });
  const url = media.getByRole('textbox', { name: '이미지 URL', exact: true });
  await url.fill('https://images.test//');
  await url.evaluate((element: HTMLInputElement) => element.setSelectionRange(20, 20));
  await media.getByRole('button', { name: '{{char_code}}', exact: true }).click();
  await media.getByRole('button', { name: '{{situation_code}}', exact: true }).click();
  await expect(url).toHaveValue('https://images.test/{{char_code}}{{situation_code}}/');
  expect(await url.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  expect(
    await media
      .locator('.template-code')
      .first()
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(217, 194, 122)');
  await max.fill('2');
  const names = media.getByRole('textbox', { name: '상황 이름 정의', exact: true });
  await names.fill('기본, 미소');
  await expect(register).toBeEnabled();
  expect(await register.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  await page.route('https://images.test/**', (route) => route.fulfill({ status: 404 }));
  await page.screenshot({ path: `${out}/media-ready.png` });
  await register.click();
  await expect(media.getByRole('button', { name: '등록 완료', exact: true })).toBeDisabled();
  await expect(media.locator('.media-grid > button')).toHaveCount(2);
  await media.locator('.media-grid > button').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(media.locator('.media-situation-grid figure')).toHaveCount(2);
  await media.getByRole('button', { name: '캐릭터 목록으로', exact: true }).click();
  await expect(media.locator('.media-grid > button')).toHaveCount(2);
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.reload();
  await section(page, '미디어');
  await expect(media.getByRole('button', { name: '등록 완료', exact: true })).toBeVisible();
  await names.fill('기본\n');
  await expect(register).toBeDisabled();
  await expect(media.locator('.media-grid')).toHaveCount(0);
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.reload();
  await section(page, '미디어');
  await expect(names).toHaveValue('기본\n');
  await expect(register).toBeDisabled();
  await page.setViewportSize({ width: 393, height: 852 });
  await names.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/media-mobile.png` });
  expect(await media.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
test('로어북 그립으로 이동 · 클릭은 접기 아님 · 취소 · 키보드 · 자동저장과 undo', async ({
  page,
}) => {
  await editor(page);
  for (let index = 0; index < 3; index++)
    await page.getByRole('button', { name: '로어북 추가', exact: true }).click();
  const rows = page.locator('.sortable-list .disclosure-card');
  // Collapsing content makes the full list visible; handle clicks must not toggle details.
  for (let index = 0; index < 3; index++) await rows.nth(index).locator('summary').click();
  const handle = page.getByRole('button', { name: '로어북 3 위치 이동', exact: true });
  await handle.click();
  expect(await rows.last().evaluate((element: HTMLDetailsElement) => element.open)).toBe(false);
  await drag(page, handle, rows.first());
  await expect(rows.first().locator('summary')).toHaveText('로어북 3');
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.screenshot({ path: `${out}/lore-order.png` });
  await page.reload();
  await expect(rows.first().locator('summary')).toHaveText('로어북 3');
  const firstHandle = page.getByRole('button', { name: '로어북 3 위치 이동', exact: true });
  await firstHandle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1).locator('summary')).toHaveText('로어북 3');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(rows.first().locator('summary')).toHaveText('로어북 3');
  const before = await rows.locator('summary').allTextContents();
  const from = (await firstHandle.boundingBox())!;
  await page.mouse.move(from.x + 8, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await rows.locator('summary').allTextContents()).toEqual(before);
  await section(page, '등장 캐릭터');
  await page.getByRole('button', { name: '로어북 추가', exact: true }).click();
  await page.getByRole('button', { name: '로어북 추가', exact: true }).click();
  const characterRows = page.locator('.sortable-list .disclosure-card');
  for (let index = 0; index < 2; index++) await characterRows.nth(index).locator('summary').click();
  await drag(
    page,
    page.getByRole('button', { name: '로어북 2 위치 이동', exact: true }),
    characterRows.first(),
  );
  await expect(characterRows.first().locator('summary')).toHaveText('로어북 2');
});
test('사용자 캐러셀 그립 이동 · 위치와 내용 저장 · 전체 백업에 순서 포함', async ({ page }) => {
  await start(page);
  for (const name of ['첫 번째', '두 번째', '세 번째']) {
    await page.getByRole('button', { name: '캐러셀 만들기', exact: true }).click();
    await page.getByRole('textbox', { name: '캐러셀 이름', exact: true }).fill(name);
    await page.getByRole('button', { name: '완료', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const rows = page.locator('.library-content .sortable-list > .sortable-item');
  await drag(
    page,
    page.getByRole('button', { name: '세 번째 위치 이동', exact: true }),
    rows.first(),
  );
  await expect(rows.first()).toContainText('세 번째');
  await drag(
    page,
    page.getByRole('button', { name: '두 번째 위치 이동', exact: true }),
    rows.first(),
  );
  await expect(rows.first()).toContainText('두 번째');
  await expect(page.getByText('개발자가 만든 작품들', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(rows.first()).toContainText('두 번째');
  await expect(rows.nth(1)).toContainText('세 번째');
  await page.screenshot({ path: `${out}/carousel-order.png` });
  await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
  const backup = JSON.parse(await fs.readFile((await (await pending).path())!, 'utf8'));
  expect(backup.profile.carouselOrder[0]).toBe(backup.profile.carousels[0].id);
  expect(backup.profile.carousels.map((carousel: any) => carousel.name)).toEqual([
    '두 번째',
    '세 번째',
    '첫 번째',
  ]);
});
test('393px 실제 터치 포인터로 캐러셀 위치 이동', async ({ page }) => {
  await start(page);
  for (const name of ['A', 'B']) {
    await page.getByRole('button', { name: '캐러셀 만들기', exact: true }).click();
    await page.getByRole('textbox', { name: '캐러셀 이름', exact: true }).fill(name);
    await page.getByRole('button', { name: '완료', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page.getByRole('button', { name: 'B 위치 이동', exact: true }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          document
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest('button') === element
        );
      }),
    )
    .toBe(true);
  const from = (await page
    .getByRole('button', { name: 'B 위치 이동', exact: true })
    .boundingBox())!;
  const to = (await page.locator('.library-content .sortable-item').first().boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x + 8, y: from.y + 8 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x + 16, y: to.y + 10 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.library-content .sortable-item').first()).toContainText('B');
  await page.screenshot({ path: `${out}/carousel-touch.png` });
});
