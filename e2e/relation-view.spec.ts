import { test, expect, type Page, type Locator } from '@playwright/test';

async function section(page: Page, width: number, name: string) {
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  await nav.waitFor({ state: 'visible' });
  if (
    (await nav.count()) &&
    !(await nav.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).count())
  )
    await nav.getByRole('button', { name: '추가 요소', exact: false }).click();

  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
  if (name === '관계도') {
    const toggle = page.getByRole('switch', { name: '관계도 사용', exact: true });
    if (!(await toggle.isChecked())) await toggle.click();
  }
}
const world = (canvas: Locator) => canvas.locator('svg[role=application] > g');
async function panAndZoom(page: Page, canvas: Locator) {
  const svg = canvas.locator('svg[role=application]');
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height - 50);
  // Zoom buttons are hidden in the narrow PC sidebar; Ctrl+wheel works everywhere.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(canvas.getByLabel('관계도 배율', { exact: true })).toHaveText('120%');
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + box.height - 90, { steps: 6 });
  await page.mouse.up();
  const transform = (await world(canvas).getAttribute('transform'))!;
  expect(transform).toContain('scale(1.2)');
  expect(transform).not.toContain('translate(0 0)');
  return transform;
}
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}

for (const width of [1440, 393]) {
  test(`creator map pan/zoom persists on reload, section changes and reopening (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/create\/[^/]+$/);
    const url = page.url();
    await section(page, width, '관계도');
    const canvas = page.locator('.relationship-canvas').first();
    const transform = await panAndZoom(page, canvas);
    await section(page, width, '미디어');
    await section(page, width, '관계도');
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    await page.reload();
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    if (width > 800) {
      await canvas.getByRole('button', { name: '관계도 확대', exact: true }).click();
      await expect(world(page.getByRole('dialog').locator('.relationship-canvas'))).toHaveAttribute(
        'transform',
        transform,
      );
      await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    }
    await page.goto('/#/');
    await page.goto(url);
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    await canvas.getByRole('button', { name: '관계도 위치 초기화', exact: true }).click();
    await expect(world(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await page.reload();
    await expect(world(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    // Corrupt preferences fall back to a valid view rather than breaking the graph.
    await page.evaluate(
      (workspaceId) =>
        localStorage.setItem(
          `xenotale.relation-view.editor.${workspaceId}`,
          JSON.stringify({ x: 'bad', y: 1, scale: 1 }),
        ),
      new URL(url).hash.split('/')[2],
    );
    await page.reload();
    await expect(world(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  });

  test(`chat map pan/zoom persists on reload and remains separate per room (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    const roomUrl = page.url();
    await page.goto(`${roomUrl}/panel/relations`);
    const canvas = page.locator('.relationship-canvas').first();
    const transform = await panAndZoom(page, canvas);
    await page.reload();
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    await page.goto(`${roomUrl}/panel/info`);
    await page.goto(`${roomUrl}/panel/relations`);
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    const otherUrl = page.url();
    expect(otherUrl).not.toBe(roomUrl);
    await page.goto(`${otherUrl}/panel/relations`);
    await expect(world(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await page.goto(`${roomUrl}/panel/relations`);
    await expect(world(canvas)).toHaveAttribute('transform', transform);
    if (width > 800) {
      await canvas.getByRole('button', { name: '관계도 확대', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '관계도 위치 초기화', exact: true })
        .click();
      await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
    } else {
      await canvas.getByRole('button', { name: '관계도 위치 초기화', exact: true }).click();
    }
    await page.reload();
    await expect(world(canvas)).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  });
}
