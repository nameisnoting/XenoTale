import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/chat-feedback';
async function start(page: Page, mobile = false) {
  await page.setViewportSize(mobile ? { width: 393, height: 852 } : { width: 1440, height: 1024 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}
test('공통 헤더 · 우측 접힘과 복원 · 좌측 크기 유지', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '마이페이지', exact: true }).click();
  await expect(page.locator('.page-header h1')).toHaveText('마이페이지');
  expect(await page.locator('.page-header h1').evaluate((e) => getComputedStyle(e).fontSize)).toBe(
    '24px',
  );
  expect(
    await page
      .getByRole('button', { name: 'API 키 관리', exact: true })
      .evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe('16px');
  await page.screenshot({ path: `${out}/profile.png` });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  const leftWidth = (await page.locator('.editor-workspace').boundingBox())!.width;
  expect(
    await page.locator('.assistant-top h2').evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe('16px');
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await page.getByRole('button', { name: '제작 서포터 접기', exact: true }).click();
  await expect(page.locator('.collapsed-panel')).toBeVisible();
  await expect(page.locator('.assistant-desktop')).toBeHidden();
  expect((await page.locator('.editor-workspace').boundingBox())!.width).toBe(leftWidth);
  const pill = (await page.locator('.collapsed-panel').boundingBox())!;
  const actions = (await page.locator('.editor-header .inline-actions').boundingBox())!;
  expect(actions.x + actions.width).toBeLessThan(pill.x);
  await page.screenshot({ path: `${out}/editor-collapsed.png` });
  await page.getByRole('button', { name: '제작 서포터 펼치기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '대화 테스트', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.assistant-desktop')).toBeVisible();
});
test('우측 사용량과 돌아가기 · 0 표시 · 단축어 모달 · 지문 커서', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  const left = page.locator('.chat-workspace');
  const width = (await left.boundingBox())!.width;
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText('0');
  await page.getByRole('button', { name: '사용량 보기', exact: true }).click();
  await expect(page.locator('.chat-log-desktop .chat-usage')).toBeVisible();
  await expect(left.locator('.work-info-panel')).toBeVisible();
  const link = page.getByRole('link', { name: '토큰 충전 · OpenRouter', exact: true });
  await expect(link).toHaveAttribute('href', 'https://openrouter.ai/settings/credits');
  expect(await link.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(95, 221, 206)');
  expect(await link.evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('underline');
  await page.screenshot({ path: `${out}/usage.png` });
  await page.getByRole('button', { name: '대화 로그로 돌아가기', exact: true }).click();
  await expect(page.locator('.chat-log-desktop .conversation-log')).toBeVisible();
  await page.getByRole('button', { name: '대화 로그 접기', exact: true }).click();
  await expect(page.locator('.collapsed-panel')).toBeVisible();
  expect((await left.boundingBox())!.width).toBe(width);
  await page.getByRole('button', { name: '대화 로그 펼치기', exact: true }).click();
  await expect(page.locator('.chat-log-desktop')).toBeVisible();
  const field = page.getByRole('textbox', { name: '메시지', exact: true });
  await page.getByRole('button', { name: '지문 삽입', exact: true }).click();
  await expect(field).toHaveValue('**');
  expect(
    await field.evaluate((e: HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd]),
  ).toEqual([1, 1]);
  await page.keyboard.insertText('고개를 끄덕인다');
  await expect(field).toHaveValue('*고개를 끄덕인다*');
  await field.fill('앞본문뒤');
  await field.evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(1, 3));
  await page.getByRole('button', { name: '지문 삽입', exact: true }).click();
  await expect(field).toHaveValue('앞*본문*뒤');
  expect(
    await field.evaluate((e: HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd]),
  ).toEqual([2, 4]);
  await field.fill('');
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  const menu = page.getByRole('menu', { name: '단축어 목록', exact: true });
  await expect(menu).toContainText('주사위');
  await expect(menu).not.toContainText('제작자 단축어');
  await expect(menu).not.toContainText('유저 단축어');
  const rect = (await menu.boundingBox())!;
  expect(rect.y + rect.height).toBeLessThan(
    (await page.getByRole('button', { name: '단축어', exact: true }).boundingBox())!.y,
  );
  await page.screenshot({ path: `${out}/shortcuts.png` });
  await page.getByRole('menuitem', { name: '단축어 추가', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('textbox', { name: '이름', exact: true }).fill('roll');
  await modal.getByRole('textbox', { name: '프롬프트', exact: true }).fill('주변을 바라본다');
  await expect(modal.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await expect(modal.getByRole('alert')).toContainText('사용 중');
  await modal.getByRole('textbox', { name: '이름', exact: true }).fill('관찰');
  await modal.getByRole('textbox', { name: '설명', exact: true }).fill('주변 관찰');
  await page.screenshot({ path: `${out}/shortcut-add.png` });
  await modal.getByRole('button', { name: '저장', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  await expect(menu).toContainText('유저 단축어');
  await page.getByRole('menuitem', { name: '/관찰 주변 관찰', exact: true }).click();
  await expect(field).toHaveValue('/관찰 ');
  await expect(field).toBeFocused();
});
test('모바일 로그 사용량 왕복 · 드롭다운 화면 내 표시', async ({ page }) => {
  await start(page, true);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  await page.getByRole('button', { name: '사용량 보기', exact: true }).click();
  await expect(page.locator('.side-drawer')).toContainText('누적 비용');
  await page.getByRole('button', { name: '대화 로그로 돌아가기', exact: true }).click();
  await expect(page.locator('.side-drawer')).toContainText('대화 시작');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  const rect = (await page.getByRole('menu', { name: '단축어 목록', exact: true }).boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(393);
  await page.screenshot({ path: `${out}/shortcuts-mobile.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
