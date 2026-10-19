import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`고급설정 펼침·접힘을 선택 항목과 독립적으로 작업공간마다 복원 ${width}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.waitForURL(/#\/create\//);
    const originalURL = page.url();
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    const toggle = nav.getByRole('button', { name: '고급설정', exact: true });
    const role = width < 800 ? 'tab' : 'button';
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await nav.getByRole(role, { name: '추천 페르소나', exact: true }).click();
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.goto('/#/');
    await page.goto(originalURL);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    if (width < 800) await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    const opened = context.waitForEvent('page');
    await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
    const other = await opened;
    await other.setViewportSize({ width, height: 1000 });
    await other.waitForURL(/#\/create\//);
    const otherNav = other.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    const otherToggle = otherNav.getByRole('button', { name: '고급설정', exact: true });
    await expect(otherToggle).toHaveAttribute('aria-expanded', 'false');
    await otherToggle.click();
    await other.reload();
    await expect(otherToggle).toHaveAttribute('aria-expanded', 'true');
    await other.close();

    await page.reload();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole(role, { name: '상태값', exact: true }).click();
    await toggle.click();
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.goto('/#/');
    await page.goto(originalURL);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(nav.getByRole(role, { name: '상태값', exact: true })).toBeVisible();
  });
}
