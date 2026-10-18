import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`상태창 기본 문법 · 예시 렌더링 · 직접 작성 보존 · ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const section = async () => {
      const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
      const target = nav.getByRole(width < 800 ? 'tab' : 'button', {
        name: '상태 규칙',
        exact: true,
      });
      if (!(await target.isVisible()))
        await nav.getByRole('button', { name: '추가 요소', exact: false }).click();
      await target.click();
    };
    await section();
    const tab = (name: string) => page.getByRole('tab', { name, exact: true }).click();
    const add = page.getByRole('button', { name: '상태값 추가', exact: true });
    const template = page.getByRole('textbox', { name: '문법 입력', exact: true });
    await add.click();
    await add.click();
    await tab('표시할 상태창');
    await expect(template).toHaveValue('{{상태값1}}\n{{상태값2}}');
    await tab('상태값');
    const cards = page
      .getByRole('tabpanel', { name: '상태값', exact: true })
      .locator('.creator-card');
    await cards.first().getByRole('textbox', { name: '이름', exact: true }).fill('체력');
    await cards.first().getByRole('spinbutton', { name: '초기값', exact: true }).fill('37');
    await tab('표시할 상태창');
    await expect(template).toHaveValue('{{체력}}\n{{상태값2}}');
    await tab('상태값');
    await cards.first().getByRole('button', { name: '레벨 추가', exact: true }).click();
    const range = cards.first().locator('.status-level');
    await range.getByPlaceholder('설정한 구간의 특징을 정의해 주세요.').fill('건강한 상태');
    const remove = range.getByRole('button', { name: '구간 삭제', exact: true });
    await remove.scrollIntoViewIfNeeded();
    const areaBox = (await range.locator('textarea').boundingBox())!;
    const buttonBox = (await remove.boundingBox())!;
    expect(buttonBox.y - areaBox.y - areaBox.height).toBeCloseTo(16, 0);
    expect(buttonBox.x + buttonBox.width).toBeCloseTo(areaBox.x + areaBox.width, 0);
    await remove.hover();
    expect(
      await remove.evaluate((el) => [
        getComputedStyle(el).color,
        getComputedStyle(el).borderTopColor,
        getComputedStyle(el.querySelector('svg')!).color,
      ]),
    ).toEqual(['rgb(198, 72, 80)', 'rgb(198, 72, 80)', 'rgb(198, 72, 80)']);
    await remove.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
    await tab('표시할 상태창');
    const examples = page.getByRole('group', { name: '상태창 예시', exact: true });
    await examples.getByRole('button', { name: '예시 마크다운', exact: true }).click();
    await expect(template).toHaveValue('```Status\n체력: {{체력}}\n상태값2: {{상태값2}}\n```');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.locator('.status-preview .code-block-title')).toHaveText('Status');
    await expect(page.locator('.status-preview pre code')).toContainText('체력: 37');
    await expect(page.locator('.status-preview table')).toHaveCount(0);
    await examples.getByRole('button', { name: '예시 html', exact: true }).click();
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const html = page.frameLocator('iframe[title="상태창"]');
    await expect(html.locator('dt').first()).toHaveText('체력');
    await expect(html.locator('dd').first()).toHaveText('37');
    expect(
      await html
        .locator('section')
        .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]),
    ).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
    await tab('상태값');
    await cards.first().getByRole('spinbutton', { name: '초기값', exact: true }).fill('42');
    await tab('표시할 상태창');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(html.locator('dd').first()).toHaveText('42');
    await expect(html.locator('dd').first()).toBeVisible();
    await page.locator('.status-preview').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/status-examples-${width}.png`,
      fullPage: true,
    });
    await template.fill('나만의 상태창: {{체력}}');
    await tab('상태값');
    await add.click();
    await tab('표시할 상태창');
    await expect(template).toHaveValue('나만의 상태창: {{체력}}');
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await section();
    await tab('표시할 상태창');
    await expect(template).toHaveValue('나만의 상태창: {{체력}}');
    await tab('상태값');
    await expect(page.getByRole('textbox', { name: '이름', exact: true }).first()).toHaveValue(
      '체력',
    );
    expect(errors).toEqual([]);
  });
}
