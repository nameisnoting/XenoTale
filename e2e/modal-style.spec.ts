import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/modal-style';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}
async function buttonColors(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, text: style.color, opacity: style.opacity };
  });
}
async function checkModal(modal: Locator) {
  expect(await modal.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(0, 0, 0)',
  );
  const title = (await modal.locator('.modal-header h2').boundingBox())!;
  const box = (await modal.boundingBox())!;
  expect(title.x + title.width / 2).toBeCloseTo(box.x + box.width / 2, 0);
}
test('캐러셀 모달 시안 · 별도 모드 버튼 · 완료 활성/비활성 · 모바일', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '캐러셀 만들기', exact: true }).click();
  const modal = page.getByRole('dialog');
  await checkModal(modal);
  await expect(modal.getByRole('heading')).toHaveText('캐러셀 만들기');
  const complete = modal.getByRole('button', { name: '완료', exact: true });
  await expect(complete).toBeDisabled();
  expect(await buttonColors(complete)).toEqual({
    background: 'rgb(43, 43, 43)',
    text: 'rgb(131, 131, 131)',
    opacity: '1',
  });
  const modes = modal.locator('.segmented button');
  await expect(modes).toHaveCount(3);
  expect((await buttonColors(modes.first())).background).toBe('rgb(255, 255, 255)');
  const first = (await modes.nth(0).boundingBox())!;
  const second = (await modes.nth(1).boundingBox())!;
  expect(second.x - first.x - first.width).toBeCloseTo(16, 0);
  const input = modal.getByRole('textbox', { name: '캐러셀 이름', exact: true });
  const inputBox = (await input.boundingBox())!;
  const buttonBox = (await complete.boundingBox())!;
  expect(inputBox.height).toBe(52);
  expect(buttonBox.height).toBe(56);
  expect(buttonBox.width).toBeCloseTo(inputBox.width, 0);
  expect(buttonBox.y - first.y - first.height).toBeCloseTo(40, 0);
  await page.screenshot({ path: `${out}/carousel-disabled.png` });
  await input.fill('나의 작품들');
  await expect(complete).toBeEnabled();
  expect(await buttonColors(complete)).toEqual({
    background: 'rgb(255, 255, 255)',
    text: 'rgb(34, 34, 34)',
    opacity: '1',
  });
  await modes.nth(1).click();
  expect((await buttonColors(modes.nth(1))).background).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: `${out}/carousel-enabled.png` });
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(complete).toBeInViewport();
  const mobileBox = (await modal.boundingBox())!;
  expect(mobileBox.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(393);
  await page.screenshot({ path: `${out}/carousel-mobile.png` });
  await complete.click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '나의 작품들' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '캐러셀 수정', exact: true }).click();
  await expect(modal.getByRole('heading')).toHaveText('캐러셀 수정');
  await expect(modal.getByRole('button', { name: '캐러셀 삭제', exact: true })).toBeVisible();
  await checkModal(modal);
});
test('메인 폴더 생성에도 공통 모달/완료 버튼 시안 적용', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '폴더 생성', exact: true }).click();
  const modal = page.getByRole('dialog');
  await checkModal(modal);
  const complete = modal.getByRole('button', { name: '완료', exact: true });
  await expect(complete).toBeDisabled();
  expect((await buttonColors(complete)).background).toBe('rgb(43, 43, 43)');
  const input = modal.getByRole('textbox', { name: '제목', exact: true });
  await input.fill('플레이');
  expect((await buttonColors(complete)).background).toBe('rgb(255, 255, 255)');
  expect((await complete.boundingBox())!.width).toBeCloseTo((await input.boundingBox())!.width, 0);
  await page.screenshot({ path: `${out}/folder-complete.png` });
  await complete.click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: /플레이/ }).first()).toBeVisible();
});
