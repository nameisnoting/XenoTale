import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/status-content';
async function start(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await fs.mkdir(out, { recursive: true });
}
async function editor(page: Page, width: number) {
  await start(page, width);
  await page
    .getByRole('button', { name: width < 768 ? '만들기' : '작품 만들기', exact: true })
    .click();
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  await nav.getByRole('button', { name: '고급설정', exact: false }).click();
  await nav.getByRole(width < 800 ? 'tab' : 'button', { name: '상태 규칙', exact: true }).click();
  await page.getByRole('tab', { name: '표시할 상태창', exact: true }).click();
  return page.getByRole('textbox', { name: '문법 입력', exact: true });
}
for (const width of [1440, 393]) {
  test(`상태창 제목 · 수정 중 이전 미리보기와 상태값 유지 · 버튼으로 갱신 (${width})`, async ({
    page,
  }) => {
    const template = await editor(page, width);
    await page
      .locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav')
      .getByRole(width < 800 ? 'tab' : 'button', { name: '상태값', exact: true })
      .click();
    await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
    await page.getByRole('textbox', { name: '이름', exact: true }).fill('체력');
    const initial = page.getByRole('spinbutton', { name: '초기값', exact: true });
    await initial.fill('80');
    await page
      .locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav')
      .getByRole(width < 800 ? 'tab' : 'button', { name: '상태 규칙', exact: true })
      .click();
    await page.getByRole('tab', { name: '표시할 상태창', exact: true }).click();
    await template.fill('```플레이어 상태\n체력: {{체력}}\n```');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const preview = page.locator('.status-preview');
    await expect(preview.locator('.code-block-title')).toHaveText('플레이어 상태');
    await expect(preview.locator('code')).toHaveText('체력: 80\n');
    await expect(preview.locator('summary')).toHaveCount(0);
    expect(await preview.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    await page
      .locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav')
      .getByRole(width < 800 ? 'tab' : 'button', { name: '상태값', exact: true })
      .click();
    await initial.fill('40');
    await page
      .locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav')
      .getByRole(width < 800 ? 'tab' : 'button', { name: '상태 규칙', exact: true })
      .click();
    await page.getByRole('tab', { name: '표시할 상태창', exact: true }).click();
    await template.fill('~~~새 상태\n현재 체력: {{체력}}\n~~~');
    await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview.locator('.code-block-title')).toHaveText('새 상태');
    await expect(preview.locator('code')).toHaveText('현재 체력: 40\n');
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/markdown-${width}.png` });
    await template.fill('');
    await expect(preview.locator('code')).toHaveText('현재 체력: 40\n');
    await template.fill('```HTML 예시\n<div>코드 원문</div>\n```');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview.locator('iframe')).toHaveCount(0);
    await expect(preview.locator('code')).toContainText('<div>코드 원문</div>');
    await template.fill('**상태: 좋음** · `인라인 코드`');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview.locator('strong')).toHaveText('상태: 좋음');
    await expect(preview.locator('.code-block-title')).toHaveCount(0);
    await expect(preview.locator('code')).toHaveText('인라인 코드');
  });
  test(`HTML 상태창 배경 없음 · 높이 자동 갱신 · 작성자 스크립트 차단 (${width})`, async ({
    page,
  }) => {
    const template = await editor(page, width);
    const html =
      '<div style="height:48px;color:#5fddce">상태: 좋음</div><script>document.body.dataset.unsafe="yes"</script><img src="data:," onerror="document.body.dataset.unsafe=\'yes\'">';
    await template.fill(html);
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const frame = page.locator('.status-preview iframe');
    const body = page.frameLocator('.status-preview iframe').locator('body');
    await expect(body).toContainText('상태: 좋음');
    await expect
      .poll(() => frame.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(48);
    expect(await frame.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
      150,
    );
    expect(await frame.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await body.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    await expect(body).not.toHaveAttribute('data-unsafe', 'yes');
    expect(
      await body.evaluate(() => {
        try {
          void parent.localStorage;
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await template.fill('<div style="height:480px">긴 상태창</div>');
    await expect(body).toContainText('상태: 좋음');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(body).toContainText('긴 상태창');
    await expect
      .poll(() => frame.evaluate((element) => element.getBoundingClientRect().height))
      .toBe(480);
    await frame.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/html-${width}.png` });
    await template.fill('<div style="height:32px">작은 상태창</div>');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect
      .poll(() => frame.evaluate((element) => element.getBoundingClientRect().height))
      .toBe(32);
  });
}
for (const width of [1440, 393]) {
  test(`예시 대화 상태창은 버튼 옆에 표시 · 접으면 한 줄 · 중립 상태값 표시 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    const status = page.locator('.assistant-section .status-display');
    await expect(status.locator('pre code')).toContainText('상태1: 여기에 상태값이 나옵니다.');
    await expect(status.locator('pre code')).toContainText('상태3: 여기에 상태값이 나옵니다.');
    expect(await status.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await status.evaluate((element) => getComputedStyle(element).padding)).toBe('0px');
    const toggle = status.getByLabel('상태창 접기/펼치기', { exact: true });
    const label = toggle.getByText('상태창 펼치기', { exact: true });
    await expect(label).toBeHidden();
    await toggle.scrollIntoViewIfNeeded();
    const toggleBox = (await toggle.boundingBox())!;
    const contentBox = (await status.locator('.status-content').boundingBox())!;
    expect(contentBox.y).toBeCloseTo(toggleBox.y, 0);
    expect(contentBox.x - toggleBox.x - toggleBox.width).toBeCloseTo(8, 0);
    const statusBox = (await status.boundingBox())!;
    expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(statusBox.x + statusBox.width + 1);
    await toggle.click();
    await expect(status.locator('.status-content')).toBeHidden();
    expect((await status.boundingBox())!.height).toBeCloseTo(24, 0);
    await expect(label).toBeVisible();
    expect(
      await label.evaluate((element) => [
        getComputedStyle(element).fontSize,
        getComputedStyle(element).color,
      ]),
    ).toEqual(['10px', 'rgb(78, 78, 78)']);
    expect(
      await toggle.locator('svg').evaluate((element) => getComputedStyle(element).transform),
    ).toBe('none');
    await page.screenshot({ path: `${out}/chat-collapsed-${width}.png` });
    await label.click();
    await expect(status.locator('pre')).toBeVisible();
    await expect(label).toBeHidden();
    expect(
      await toggle.locator('svg').evaluate((element) => getComputedStyle(element).transform),
    ).toBe('matrix(0, 1, -1, 0, 0, 0)');
    await toggle.click();
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(status.locator('pre')).toBeVisible();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.status-display').last().locator('pre code')).toContainText(
      '상태1: 여기에 상태값이 나옵니다.',
    );
    await expect(page.locator('.status-display').first().locator('pre code')).toContainText(
      '상태1: 여기에 상태값이 나옵니다.',
    );
    await page.locator('.status-display').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/chat-default-${width}.png` });
  });
}
