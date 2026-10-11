import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/editor-canvas';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await fs.mkdir(out, { recursive: true });
}
async function section(page: Page, name: string) {
  await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function whiteBoundary(control: ReturnType<Page['getByRole']>) {
  const before = await control.boundingBox();
  await control.focus();
  expect(
    await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.outlineColor, style.outlineWidth, style.outlineOffset];
    }),
  ).toEqual(['rgb(255, 255, 255)', '1px', '-1px']);
  expect(await control.boundingBox()).toEqual(before);
}
test('도입부 정책 · 공통 텍스트 포커스 · 숫자 범위 정렬 · 저장', async ({ page }) => {
  await start(page);
  await section(page, '도입부');
  await expect(page.getByRole('group', { name: '시작 등장인물', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '추천 답변', exact: true })).toBeVisible();
  await expect(page.getByText('추천 입력', { exact: true })).toHaveCount(0);
  const title = page.getByRole('textbox', { name: '제목', exact: false });
  await whiteBoundary(title);
  const body = page.getByRole('textbox', { name: '내용', exact: false });
  await whiteBoundary(body);
  const suggested = page.getByRole('textbox', { name: '추천 답변 1', exact: true });
  await suggested.fill('정원을 둘러보고 싶어요.');
  await whiteBoundary(suggested);
  await page.screenshot({ path: `${out}/opening-fields.png` });
  await section(page, '상태창');
  await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
  const min = page.getByRole('spinbutton', { name: '최솟값', exact: true });
  const max = page.getByRole('spinbutton', { name: '최댓값', exact: true });
  const minRect = (await min.boundingBox())!;
  const maxRect = (await max.boundingBox())!;
  expect(minRect.y).toBeCloseTo(maxRect.y, 0);
  expect(minRect.height).toBeCloseTo(maxRect.height, 0);
  expect(maxRect.x - minRect.x - minRect.width).toBeCloseTo(12, 0);
  const labels = page.locator('.form-row .field-label');
  expect((await labels.nth(0).boundingBox())!.y).toBeCloseTo(
    (await labels.nth(1).boundingBox())!.y,
    0,
  );
  await whiteBoundary(max);
  await page.screenshot({ path: `${out}/status-range.png` });
  await page.setViewportSize({ width: 393, height: 852 });
  expect((await min.boundingBox())!.y).toBeCloseTo((await max.boundingBox())!.y, 0);
  await page.screenshot({ path: `${out}/status-range-mobile.png` });
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section(page, '도입부');
  await expect(page.getByRole('textbox', { name: '추천 답변 1', exact: true })).toHaveValue(
    '정원을 둘러보고 싶어요.',
  );
});
test('시나리오 작은 트리 자유 이동 · Ctrl휠/버튼 확대 · 노드 편집 · 관계도 회귀', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await section(page, '시나리오');
  const canvas = page.getByRole('application', { name: '시나리오 캔버스', exact: true });
  const tree = canvas.locator('.scenario-tree');
  expect((await tree.boundingBox())!.height).toBeLessThan((await canvas.boundingBox())!.height);
  const root = canvas.locator('.scenario-node').first();
  const original = (await root.boundingBox())!;
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + box.height - 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 112, box.y + box.height - 60, { steps: 8 });
  await page.mouse.up();
  const moved = (await root.boundingBox())!;
  expect(moved.x - original.x).toBeCloseTo(100, 0);
  expect(moved.y - original.y).toBeCloseTo(60, 0);
  await page.mouse.move(box.x + 140, box.y + 120);
  expect(await root.boundingBox()).toEqual(moved);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(page.locator('.scenario-zoom output')).toHaveText('120%');
  expect((await root.boundingBox())!.width).toBeCloseTo(original.width * 1.2, 0);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await page.getByRole('button', { name: '시나리오 확대', exact: true }).click();
  await expect(page.locator('.scenario-zoom output')).toHaveText('130%');
  await page.screenshot({ path: `${out}/scenario-pan-zoom.png` });
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 10000);
  await page.keyboard.up('Control');
  await expect(page.locator('.scenario-zoom output')).toHaveText('40%');
  await page.getByRole('button', { name: '시나리오 보기 초기화', exact: true }).click();
  await expect(page.locator('.scenario-zoom output')).toHaveText('100%');
  expect(await root.boundingBox()).toEqual(original);
  await page.getByRole('button', { name: '도입부 1 다음 챕터 추가', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('textbox', { name: '제목', exact: true }).fill('확대 후에도 편집');
  await modal.getByRole('button', { name: '완료', exact: true }).click();
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '확대 후에도 편집 조건 0개', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: '제목', exact: true }),
  ).toHaveValue('확대 후에도 편집');
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await section(page, '관계도');
  const relation = page.getByRole('application', { name: '캐릭터 관계도', exact: true });
  const initial = await relation.locator('g').first().getAttribute('transform');
  await relation.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(relation.locator('g').first()).not.toHaveAttribute('transform', initial!);
  expect(errors).toEqual([]);
});
