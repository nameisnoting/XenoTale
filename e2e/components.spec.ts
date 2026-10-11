import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
}

test('작품 카드 크기 · 공통 아이콘 메뉴와 제목 크기', async ({ page }) => {
  const out = 'docs/screenshots/components';
  await fs.mkdir(out, { recursive: true });
  await start(page);
  await expect(page.getByText('XenoTale 시작하기', { exact: true })).toHaveCount(0);
  // The developer carousel is hidden; use the owned regression fixture instead.
  const box = await page.locator('.work-art').first().boundingBox();
  expect(box?.width).toBe(169);
  expect(box?.height).toBeCloseTo((169 * 253) / 194, 0);
  await page.screenshot({ path: `${out}/library.png` });
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  const rail = page.getByRole('navigation', { name: '제작 기능 메뉴' });
  await expect(rail.getByRole('button', { name: '작업공간', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    rail.getByRole('button', { name: '작업내역', exact: true }).locator('svg'),
  ).toHaveCount(1);
  expect(
    await rail
      .locator('.rail-icon')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  expect(
    await page
      .locator('.editor-workspace > header strong')
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('16px');
  expect(
    await page
      .locator('.editor-nav > button')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('14px');
  expect((await page.locator('.editor-nav').boundingBox())?.width).toBe(291);
  await page.screenshot({ path: `${out}/editor.png` });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  const chatRail = page.getByRole('navigation', { name: '대화 기능 메뉴' });
  await expect(chatRail).toHaveClass(/icon-rail/);
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  expect(
    await chatRail
      .locator('.active .rail-icon')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
});

test('메인과 관리의 공통 대화방 메뉴 · 고정/이름/폴더/삭제', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  const sidebar = page.locator('.room-sidebar');
  const menuButton = sidebar.getByRole('button', { name: '정원 앞에서 대화방 메뉴', exact: true });
  await menuButton.click();
  const menu = page.getByRole('menu', { name: '정원 앞에서 메뉴', exact: true });
  await expect(menu).toBeVisible();
  const rect = await menu.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: 'docs/screenshots/components/sidebar-menu.png' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await menuButton.click();
  await page.getByRole('menuitem', { name: '상단 고정', exact: true }).click();
  await menuButton.click();
  await expect(page.getByRole('menuitem', { name: '고정 해제', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '이름 / 폴더 변경', exact: true }).click();
  await page.getByRole('textbox', { name: '대화방 이름', exact: true }).fill('공통 메뉴 확인');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(sidebar.locator('.room-list-name')).toContainText('공통 메뉴 확인');
  await page.reload();
  await expect(sidebar.locator('.room-list-name')).toContainText('공통 메뉴 확인');
  await sidebar.getByRole('button', { name: '대화방 관리', exact: true }).click();
  expect(
    await page
      .getByRole('heading', { name: '대화방 관리', exact: true })
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('24px');
  expect(
    await page
      .getByRole('heading', { name: '대화방 폴더', exact: true })
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('20px');
  await page.getByRole('button', { name: '폴더 생성', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: true }).fill('연습');
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await page.getByRole('button', { name: '공통 메뉴 확인 대화방 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '이름 / 폴더 변경', exact: true }).click();
  await page.getByRole('combobox', { name: '폴더', exact: true }).selectOption({ label: '연습' });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: /연습.*대화방/ }).click();
  await expect(page.locator('.folder-rooms')).toContainText('공통 메뉴 확인');
  await page.screenshot({ path: 'docs/screenshots/components/rooms.png' });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await sidebar.getByRole('button', { name: /연습.*대화방/ }).click();
  await sidebar.getByRole('button', { name: '공통 메뉴 확인 대화방 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(sidebar.locator('.room-list-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});
