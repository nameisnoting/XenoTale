import { creatorSection } from './helpers/creator';
import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`상태 3탭 고정·참조 제목·관계도 숨김과 간격·마지막 캐릭터 삭제 ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    const role = width < 800 ? 'tab' : 'button';
    await nav.getByRole(role, { name: '등장 캐릭터', exact: true }).click();
    await expect(
      page.locator('.characters-form').getByRole('textbox', { name: /^이름/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: '캐릭터 1 삭제', exact: true }).click();
    await expect(page.locator('.characters-form .selection-pill')).toHaveCount(0);
    await nav.getByRole('button', { name: '고급설정', exact: true }).click();
    await expect(nav.getByRole(role, { name: '상태 규칙', exact: true })).toHaveCount(0);
    await creatorSection(page, width, '상태값');
    const tabs = page.locator('.creator-sticky-tabs');
    await expect(tabs.getByRole('tab')).toHaveText([
      '이벤트',
      '상태값',
      '아이템',
      '연출',
      '상태창',
    ]);
    await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
    await expect(
      page.locator('[role=tabpanel][aria-label=상태값] .disclosure-title').first(),
    ).toHaveText('{{상태값1}}');
    await page.getByRole('textbox', { name: '이름', exact: true }).fill('HP');
    await expect(
      page.locator('[role=tabpanel][aria-label=상태값] .disclosure-title').first(),
    ).toHaveText('{{HP}}');
    await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
    const scroller = page.locator(width < 800 ? '.editor-fieldset' : '.editor-main');
    await scroller.evaluate((el) => {
      el.scrollTop = 500;
    });
    const viewport = (await scroller.boundingBox())!;
    const header = (await page.locator('.editor-header').boundingBox())!;
    await expect
      .poll(async () => (await tabs.boundingBox())!.y)
      .toBeCloseTo(width < 800 ? viewport.y : viewport.y + header.height, 0);
    await tabs.getByRole('tab', { name: '이벤트', exact: true }).click();
    await page.getByRole('button', { name: '이벤트 추가', exact: true }).click();
    const rule = page.getByRole('tabpanel', { name: '이벤트', exact: true });
    await expect(rule.locator('.disclosure-title').first()).toHaveText('이벤트1');
    await rule.getByRole('textbox', { name: '이벤트 이름', exact: true }).fill('회복');
    await expect(rule.locator('.disclosure-title').first()).toHaveText('회복');
    await expect(rule.locator('.rule-button-hint')).toContainText('대화 입력창 위');
    await tabs.getByRole('tab', { name: '상태창', exact: true }).click();
    await expect(page.getByRole('heading', { name: '표시할 상태창', exact: true })).toHaveCount(0);
    await nav.getByRole(role, { name: '관계도', exact: true }).click();
    await expect(page.locator('.optional-feature')).toHaveCount(0);
    const toggle = page.getByRole('switch', { name: '관계도 사용', exact: true });
    await toggle.click();
    await page.getByRole('switch', { name: '표면 / 내면 분리', exact: true }).click();
    const palette = page.locator('.relation-palette');
    await expect(palette.locator('.avatar-choices')).toHaveCount(0);
    const title = (await palette.locator('.section-title').boundingBox())!;
    const description = (await palette.locator('small').boundingBox())!;
    expect(description.y - title.y - title.height).toBeCloseTo(8, 0);
    const unlock = page.getByRole('region', { name: '내면 해금 조건', exact: true });
    expect(
      (await unlock.boundingBox())!.y -
        (await palette.boundingBox())!.y -
        (await palette.boundingBox())!.height,
    ).toBeGreaterThanOrEqual(24);
    await expect(unlock.locator('.edit-card-section-body > *').first()).toHaveText(
      '조건이 없으면 처음부터 내면을 확인할 수 있습니다.',
    );
    await unlock.getByRole('button', { name: '조건 추가', exact: true }).click();
    await toggle.click();
    await expect(page.locator('.optional-feature')).toHaveCount(0);
    await toggle.click();
    await expect(unlock.getByRole('button', { name: '조건 삭제', exact: true })).toHaveCount(1);
    await creatorSection(page, width, '연출');
    await expect(
      page.getByRole('tablist', { name: '연출 설정', exact: true }).getByRole('tab'),
    ).toHaveText(['자동연출', '수동연출']);
    await page
      .getByRole('tablist', { name: '연출 설정', exact: true })
      .getByRole('tab', { name: '수동연출', exact: true })
      .click();
    await expect(page.getByRole('button', { name: '연출 추가', exact: true })).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/creator-adjustments-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
