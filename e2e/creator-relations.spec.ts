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
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
  await section(page, width, '등장 캐릭터');
  await page.locator('.editor-form').getByRole('textbox', { name: /^이름/ }).fill('아리아');
  await page
    .locator('.editor-form .tab-pills')
    .getByRole('button', { name: '추가', exact: true })
    .click();
  await page.locator('.editor-form').getByRole('textbox', { name: /^이름/ }).fill('세라');
}
async function separate(a: Locator, b: Locator) {
  const first = (await a.boundingBox())!,
    second = (await b.boundingBox())!;
  expect(
    first.x + first.width < second.x ||
      second.x + second.width < first.x ||
      first.y + first.height < second.y ||
      second.y + second.height < first.y,
  ).toBe(true);
}
async function moveNode(page: Page, node: Locator, x: number, y: number) {
  const circle = node.locator(':scope > circle').first();
  const box = (await circle.boundingBox())!;
  const scale = await node.evaluate((n: SVGGElement) => n.getScreenCTM()!.a);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + x * scale, box.y + box.height / 2 + y * scale, {
    steps: 6,
  });
  await page.mouse.up();
}

for (const width of [1440, 393]) {
  test(`미디어 간격·관계도 격자·양방향 이름 직접 편집·선택 테두리 (${width})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, width);
    await section(page, width, '미디어');
    await page.getByRole('radio', { name: '외부 URL', exact: true }).click();
    const range = page.locator('.code-range');
    expect(await range.locator('.code-label').evaluate((e) => getComputedStyle(e).color)).toBe(
      'rgb(204, 204, 204)',
    );
    const label = (await range.locator('.code-label').boundingBox())!;
    const pills = (await range.locator('.code-pills').boundingBox())!;
    expect(pills.y - label.y - label.height).toBeCloseTo(8, 0);
    const rangeBox = (await range.boundingBox())!;
    const names = (await page
      .getByRole('group', { name: '상황 이름 정의', exact: true })
      .boundingBox())!;
    expect(names.y - rangeBox.y - rangeBox.height).toBeCloseTo(20, 0);
    await section(page, width, '관계도');
    const editor = page.locator('.relationship-editor');
    const canvas = editor.locator('.relationship-canvas');
    const heading = (await editor.locator('.relationship-heading').boundingBox())!;
    const title = (await editor
      .getByRole('heading', { name: '관계도 맵', exact: true })
      .boundingBox())!;
    const toggle = (await editor.locator('.relationship-heading .toggle-row').boundingBox())!;
    const box = (await canvas.boundingBox())!;
    expect(title.y + title.height / 2).toBeCloseTo(toggle.y + toggle.height / 2, 0);
    expect(toggle.x + toggle.width).toBeCloseTo(heading.x + heading.width, 0);
    expect(box.y - heading.y - heading.height).toBeCloseTo(16, 0);
    expect(await canvas.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain(
      'linear-gradient',
    );
    const a = editor.getByRole('button', { name: '아리아 관계 연결', exact: true });
    const b = editor.getByRole('button', { name: '세라 관계 연결', exact: true });
    const stroke = (node: Locator) =>
      node
        .locator(':scope > circle')
        .first()
        .evaluate((e) => [getComputedStyle(e).stroke, getComputedStyle(e).strokeWidth]);
    expect(await stroke(a)).toEqual(['rgb(131, 131, 131)', '1px']);
    await a.click();
    expect(await stroke(a)).toEqual(['rgb(95, 221, 206)', '1px']);
    await b.click();
    const forward = editor.getByRole('textbox', { name: '아리아 → 세라 표면 관계', exact: true });
    await expect(forward).toBeFocused();
    await page.keyboard.insertText('친구');
    await expect(forward).toHaveValue('친구');
    expect(
      await forward.evaluate((e) => ({
        color: getComputedStyle(e).color,
        padding: getComputedStyle(e).paddingLeft,
        width: e.getBoundingClientRect().width / e.closest('svg')!.getScreenCTM()!.a,
      })),
    ).toMatchObject({ color: 'rgb(233, 213, 151)', padding: '6px' });
    expect(await stroke(a)).toEqual(['rgb(131, 131, 131)', '1px']);
    expect(await stroke(b)).toEqual(['rgb(131, 131, 131)', '1px']);
    await b.click();
    await a.click();
    const reverse = editor.getByRole('textbox', { name: '세라 → 아리아 표면 관계', exact: true });
    await expect(reverse).toBeFocused();
    await page.keyboard.insertText('오래된 라이벌이자 협력자');
    await editor.getByRole('button', { name: '전체 관계', exact: true }).click();
    expect(await forward.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
    await separate(forward, reverse);
    const world = editor.locator('svg[role=application] > g');
    const before = await world.getAttribute('transform');
    await forward.click();
    await forward.fill('서로 믿는 친구');
    await expect(world).toHaveAttribute('transform', before!);
    await forward.fill('AB');
    await forward.press('Home');
    await forward.press('Delete');
    await expect(forward).toHaveValue('B');
    await expect(editor.locator('.relation-edge')).toHaveCount(2);
    await forward.fill('서로 믿는 친구');
    await moveNode(page, b, -270, 350);
    await separate(forward, reverse);
    await canvas.screenshot({ path: `test-results/relation-vertical-${width}.png` });
    await moveNode(page, b, 180, -120);
    await separate(forward, reverse);
    await editor.getByRole('switch', { name: '표면 / 내면 분리', exact: true }).click();
    const allBox = (await editor
      .getByRole('button', { name: '전체 관계', exact: true })
      .boundingBox())!;
    const layerBox = (await editor.getByRole('button', { name: /내면으로/ }).boundingBox())!;
    expect(allBox.x + allBox.width).toBeLessThanOrEqual(layerBox.x);
    expect(allBox.y).toBeCloseTo(layerBox.y, 0);
    expect(allBox.height).toBe(layerBox.height);
    expect(await forward.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
      'rgba(51, 51, 51, 0.5)',
    );
    await editor.getByRole('button', { name: /내면으로/ }).click();
    expect(await stroke(a)).toEqual(['rgb(131, 131, 131)', '1px']);
    await a.click();
    expect(await stroke(a)).toEqual(['rgb(198, 72, 80)', '1px']);
    await b.click();
    const inner = editor.getByRole('textbox', { name: '아리아 → 세라 내면 관계', exact: true });
    await expect(inner).toBeFocused();
    await page.keyboard.insertText('속으로는 경계한다');
    expect(await stroke(a)).toEqual(['rgb(131, 131, 131)', '1px']);
    await canvas.screenshot({ path: `test-results/relation-inner-${width}.png` });
    await editor.getByRole('button', { name: /표면으로/ }).click();
    await expect(forward).toHaveValue('서로 믿는 친구');
    await page.reload();
    await section(page, width, '관계도');
    await editor.getByRole('button', { name: '전체 관계', exact: true }).click();
    await expect(forward).toHaveValue('서로 믿는 친구');
    await editor.getByRole('button', { name: /내면으로/ }).click();
    await expect(inner).toHaveValue('속으로는 경계한다');
    expect(errors).toEqual([]);
  });

  test(`도구줄 쓰레기통으로 인물 제외·관계 유지·미포함 캐릭터 다중 추가 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await section(page, width, '관계도');
    const editor = page.locator('.relationship-editor');
    const a = editor.getByRole('button', { name: '아리아 관계 연결', exact: true });
    const b = editor.getByRole('button', { name: '세라 관계 연결', exact: true });
    await a.click();
    await b.click();
    const forward = editor.getByRole('textbox', { name: '아리아 → 세라 표면 관계', exact: true });
    await forward.fill('친구');
    const add = editor.getByRole('button', { name: '관계도 맵에 추가', exact: true });
    const remove = editor.getByRole('button', { name: '관계도 선택 항목 삭제', exact: true });
    await expect(remove).toBeEnabled();
    await expect(editor.locator('.relation-inspector')).toHaveCount(0);
    await expect(
      editor.getByRole('button', { name: '선택한 인물을 맵에서 제외', exact: true }),
    ).toHaveCount(0);
    await expect(
      editor
        .locator('.relation-palette .section-title')
        .getByRole('button', { name: '관계도 맵에 추가', exact: true }),
    ).toBeVisible();
    const reset = (await editor
      .getByRole('button', { name: '관계도 위치 초기화', exact: true })
      .boundingBox())!;
    const trash = (await remove.boundingBox())!;
    expect(trash.x).toBeGreaterThan(reset.x + reset.width);
    expect(trash.y).toBeCloseTo(reset.y, 0);
    await editor.getByRole('button', { name: '전체 관계', exact: true }).click();
    await a.click();
    await remove.click();
    await expect(a).toHaveCount(0);
    await expect(remove).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await b.click();
    await remove.click();
    await expect(b).toHaveCount(0);
    const palette = editor.locator('.relation-palette');
    const hiddenA = palette.getByRole('button', { name: '아리아', exact: true });
    const hiddenB = palette.getByRole('button', { name: '세라', exact: true });
    await hiddenA.click();
    await hiddenB.click();
    await expect(hiddenA).toHaveAttribute('aria-pressed', 'true');
    await expect(hiddenB).toHaveAttribute('aria-pressed', 'true');
    await add.click();
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(forward).toHaveValue('친구');
    await expect(add).toBeDisabled();
    await a.click();
    await remove.click();
    await hiddenA.click();
    await add.click();
    await expect(forward).toHaveValue('친구');
    await page.reload();
    await section(page, width, '관계도');
    await editor.getByRole('button', { name: '전체 관계', exact: true }).click();
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(forward).toHaveValue('친구');
  });

  test(`넓은 화살표 클릭 범위·인물과 관계 선택 구분·삭제 확인 (${width})`, async ({ page }) => {
    await start(page, width);
    await section(page, width, '관계도');
    const editor = page.locator('.relationship-editor');
    const a = editor.getByRole('button', { name: '아리아 관계 연결', exact: true });
    const b = editor.getByRole('button', { name: '세라 관계 연결', exact: true });
    const trash = editor.getByRole('button', { name: '관계도 선택 항목 삭제', exact: true });
    await expect(trash).toBeDisabled();
    await a.click();
    await b.click();
    const input = editor.getByRole('textbox', { name: '아리아 → 세라 표면 관계', exact: true });
    await expect(input).toBeFocused();
    await expect(trash).toBeEnabled();
    await input.fill('삭제를 검증할 관계');
    const relation = editor.locator('.relation-edge');
    await expect(relation).toHaveAttribute('aria-pressed', 'true');
    await a.click();
    await expect(a).toHaveAttribute('aria-pressed', 'true');
    await expect(relation).toHaveAttribute('aria-pressed', 'false');
    const path = relation.locator('.relation-edge-line');
    const point = await path.evaluate((e: SVGPathElement) => {
      const p = e.getPointAtLength(e.getTotalLength() * 0.6).matrixTransform(e.getScreenCTM()!);
      const q = e.getPointAtLength(e.getTotalLength() * 0.6 + 1).matrixTransform(e.getScreenCTM()!);
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      return { x: p.x - ((q.y - p.y) / length) * 8, y: p.y + ((q.x - p.x) / length) * 8 };
    });
    await page.mouse.click(point.x, point.y);
    await expect(relation).toHaveAttribute('aria-pressed', 'true');
    await expect(a).toHaveAttribute('aria-pressed', 'false');
    await trash.click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: '관계 삭제', exact: true }),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
    await expect(relation).toHaveCount(1);
    const svg = editor.getByRole('application', { name: '캐릭터 관계도', exact: true });
    await svg.focus();
    await svg.press('Delete');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(relation).toHaveCount(0);
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(trash).toBeDisabled();
    await a.click();
    await b.click();
    await expect(input).toBeFocused();
    await trash.click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(relation).toHaveCount(0);
    await page.reload();
    await section(page, width, '관계도');
    await expect(relation).toHaveCount(0);
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await editor
      .locator('.relationship-canvas')
      .screenshot({ path: `test-results/relation-toolbar-${width}.png` });
  });
}
