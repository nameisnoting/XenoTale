import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';

async function section(page: Page, width: number, name: string) {
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  if (
    (await nav.count()) &&
    !(await nav.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).count())
  )
    await nav.getByRole('button', { name: '고급설정', exact: false }).click();

  if (width === 393) {
    if (page.url().includes('/panel/'))
      await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  }
  await page.getByRole('button', { name, exact: true }).click();
}
const transform = (canvas: Locator) => canvas.locator(':scope > g');
async function pan(page: Page, canvas: Locator) {
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 35, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 190, { steps: 5 });
  await page.mouse.up();
}

for (const width of [1440, 393])
  test(`대화 메뉴 벡터·관계도 배율과 위치 유지 (${width})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    if (width === 1440) {
      const rail = page.getByRole('navigation', { name: '대화 기능 메뉴' });
      for (const name of [
        '작품정보',
        '유저노트',
        '페르소나',
        '미디어',
        '시나리오',
        '관계도',
        '기억관리',
        '대화설정',
        '환경설정',
        '전체백업',
        '새로열기',
      ]) {
        const icon = rail.getByRole('button', { name, exact: true }).locator('.rail-icon');
        await expect(icon.locator('img')).toHaveCount(0);
        await expect(icon.locator('svg')).toHaveAttribute('stroke-width', '1.75');
      }
      await expect(
        rail.getByRole('button', { name: '아이템', exact: true }).locator('img'),
      ).toHaveAttribute('src', '/icons/chat/circum_bag-1.png');
    }
    await section(page, width, '관계도');
    const canvas = page.getByRole('application', { name: '캐릭터 관계도', exact: true });
    await expect(transform(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await pan(page, canvas);
    await expect(transform(canvas)).not.toHaveAttribute('transform', 'translate(0 0) scale(1)');
    const panned = (await transform(canvas).getAttribute('transform'))!;
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 35, box.y + 160);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect(transform(canvas)).not.toHaveAttribute('transform', panned);
    const view = (await transform(canvas).getAttribute('transform'))!;
    await section(page, width, '유저노트');
    await expect(canvas).toHaveCount(0);
    await section(page, width, '관계도');
    await expect(transform(canvas)).toHaveAttribute('transform', view);
    if (width === 1440) {
      await page.getByRole('button', { name: '대화 기능 접기', exact: true }).click();
      await expect(canvas).toHaveCount(0);
      await page.getByRole('button', { name: '대화 기능 펼치기', exact: true }).click();
      await expect(transform(canvas)).toHaveAttribute('transform', view);
    }
    await page.getByRole('button', { name: '관계도 확대', exact: true }).click();
    const modal = page.getByRole('dialog');
    const expanded = modal.getByRole('application', { name: '캐릭터 관계도', exact: true });
    await expect(transform(expanded)).toHaveAttribute('transform', view);
    await modal.getByRole('button', { name: '관계도 확대 보기', exact: true }).click();
    await pan(page, expanded);
    const expandedView = (await transform(expanded).getAttribute('transform'))!;
    expect(expandedView).not.toBe(view);
    await modal.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(transform(canvas)).toHaveAttribute('transform', expandedView);
    await section(page, width, '유저노트');
    await section(page, width, '관계도');
    await expect(transform(canvas)).toHaveAttribute('transform', expandedView);
    await fs.mkdir('docs/screenshots/chat-navigation', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/chat-navigation/relations-${width}.png` });
    await page.getByRole('button', { name: '관계도 확대', exact: true }).click();
    await modal.getByRole('button', { name: '관계도 위치 초기화', exact: true }).click();
    await expect(transform(expanded)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await modal.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(transform(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    expect(errors).toEqual([]);
  });
