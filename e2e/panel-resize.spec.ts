import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page: Page, layout: 'chat' | 'editor', width: number) {
  await page.setViewportSize({ width, height: 950 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', {
      name: layout === 'chat' ? '정원 앞에서 대화 시작' : width <= 800 ? '만들기' : '작품 만들기',
      exact: true,
    })
    .click();
  await expect(page.locator(`.${layout}-main`)).toBeVisible();
}
async function drag(page: Page, handle: Locator, distance: number) {
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + distance, 400, { steps: 8 });
  await page.mouse.up();
}
async function widths(page: Page, layout: 'chat' | 'editor') {
  return page.locator(`.${layout}-shell`).evaluate((e) => ({
    columns: getComputedStyle(e).gridTemplateColumns.split(' ').map(parseFloat),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
}

for (const layout of ['chat', 'editor'] as const) {
  test(`${layout}: 양쪽 드래그 제한 · 새로고침 · 접기 · 화면 크기 변경`, async ({ page }) => {
    await start(page, layout, 1440);
    const left = page.getByRole('separator', { name: '왼쪽 패널 크기 조절', exact: true });
    const right = page.getByRole('separator', { name: '오른쪽 패널 크기 조절', exact: true });
    const before = await widths(page, layout);
    expect(before.columns[0]).toBeCloseTo(365, 0);
    expect(before.columns[2]).toBeCloseTo(364, 0);
    await drag(page, left, 22);
    expect((await widths(page, layout)).columns[0]).toBeGreaterThan(before.columns[0] + 18);
    await drag(page, right, -22);
    expect((await widths(page, layout)).columns[2]).toBeGreaterThan(before.columns[2] + 18);
    await drag(page, left, 1000);
    await drag(page, right, -1000);
    const maximum = await widths(page, layout);
    expect(maximum.columns[1]).toBeGreaterThanOrEqual(559);
    expect(maximum.columns[0]).toBeLessThanOrEqual(520);
    expect(maximum.columns[2]).toBeLessThanOrEqual(520);
    expect(maximum.overflow).toBe(false);
    await fs.mkdir('docs/screenshots/panel-resize', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/panel-resize/${layout}-1440.png` });
    await page.reload();
    await expect(left).toBeVisible();
    expect((await widths(page, layout)).columns).toEqual(maximum.columns);
    await page
      .getByRole('button', {
        name: layout === 'chat' ? '대화 로그 접기' : '제작 서포터 접기',
        exact: true,
      })
      .click();
    await expect(right).toHaveCount(0);
    await page
      .getByRole('button', {
        name: layout === 'chat' ? '대화 로그 펼치기' : '제작 서포터 펼치기',
        exact: true,
      })
      .click();
    expect((await widths(page, layout)).columns).toEqual(maximum.columns);
    await page.setViewportSize({ width: 1920, height: 950 });
    await left.focus();
    await left.press('End');
    await right.focus();
    await right.press('End');
    await expect.poll(async () => (await widths(page, layout)).columns[0]).toBe(520);
    expect((await widths(page, layout)).columns).toEqual([520, 880, 520]);
    await page.setViewportSize({ width: 1200, height: 950 });
    await expect.poll(async () => (await widths(page, layout)).columns[0]).toBeLessThan(326);
    expect((await widths(page, layout)).columns[1]).toBeGreaterThan(559);
    await page.setViewportSize({ width: 1000, height: 950 });
    await expect(right).toHaveCount(0);
    await left.focus();
    await left.press('End');
    expect((await widths(page, layout)).columns).toEqual([440, 560]);
    await drag(page, left, -1000);
    expect((await widths(page, layout)).columns[0]).toBe(300);
    await left.dblclick();
    expect((await widths(page, layout)).columns[0]).toBe(300);
    await page.setViewportSize({ width: 393, height: 852 });
    await expect(page.locator('.panel-resize-handle')).toHaveCount(0);
    expect((await widths(page, layout)).overflow).toBe(false);
  });

  test(`${layout}: 모바일에는 크기 조절 핸들과 데스크톱 너비 미적용`, async ({ page }) => {
    await start(page, layout, 393);
    await expect(page.locator('.panel-resize-handle')).toHaveCount(0);
    expect(
      await page.locator(`.${layout}-shell`).evaluate((e) => getComputedStyle(e).display),
    ).toBe('flex');
    expect((await widths(page, layout)).overflow).toBe(false);
  });
}
