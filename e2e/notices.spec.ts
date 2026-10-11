import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [1440, 393]) {
  test(`새 설치는 작품 없이 시작 · 공지 분류/상세/새로고침/뒤로 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await expect(page.locator('.work-card')).toHaveCount(0);
    await expect(page.getByText('개발자가 만든 작품들', { exact: true })).toHaveCount(0);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: '공지사항', exact: true }).click();
    await expect(page.getByRole('heading', { name: '공지사항', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.notice-row')).toHaveCount(2);
    const selected = page.getByRole('tab', { name: '전체', exact: true });
    expect(
      await selected.evaluate((el) => ({
        color: getComputedStyle(el).color,
        weight: getComputedStyle(el).fontWeight,
        size: getComputedStyle(el).fontSize,
      })),
    ).toEqual({ color: 'rgb(255, 255, 255)', weight: '700', size: '14px' });
    await expect(page.getByRole('tab', { name: '기타', exact: true })).toHaveCSS(
      'font-size',
      '14px',
    );
    for (const selector of ['.notice-category', '.notice-title', 'time']) {
      await expect(page.locator('.notice-row').first().locator(selector)).toHaveCSS(
        'font-size',
        '12px',
      );
      await expect(page.locator('.notice-row').first().locator(selector)).toHaveCSS(
        'font-weight',
        '400',
      );
    }
    await expect(page.locator('.notice-row').first()).toHaveCSS('padding', '12px 16px');
    await page.getByRole('tab', { name: '기타', exact: true }).click();
    await expect(page.locator('.notice-row')).toHaveCount(1);
    await page.locator('.notice-row').click();
    await expect(page.getByRole('heading', { name: '공지사항 안내', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.notice-body')).toContainText('업데이트와 안내 사항');
    await expect(page.locator('.notice-detail h2')).toHaveCSS('font-size', '20px');
    await expect(page.locator('.notice-meta')).toHaveCSS('font-size', '12px');
    await expect(page.locator('.notice-body .markdown p').first()).toHaveCSS('font-size', '14px');
    expect(await page.locator('.notice-body').evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(255, 255, 255)',
    );
    expect(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await fs.mkdir('docs/screenshots/notices', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/notices/detail-${width}.png` });
    await page.getByRole('button', { name: '공지 목록으로 돌아가기', exact: true }).click();
    await expect(page.getByRole('tab', { name: '기타', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: '패치노트', exact: true }).click();
    await expect(page.locator('.notice-row')).toHaveCount(1);
    await page.getByRole('tab', { name: '전체', exact: true }).click();
    await page.screenshot({ path: `docs/screenshots/notices/list-${width}.png` });
    expect(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '마이페이지로 돌아가기', exact: true }).click();
    await expect(page).toHaveURL(/#\/profile$/);
  });
}

test('잘못된 공지 링크도 목록으로 복귀 가능', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.goto('/#/profile/notices/missing?tab=other');
  await expect(page.getByText('존재하지 않는 공지사항입니다.')).toBeVisible();
  await expect(page.locator('.notices-empty')).toHaveCSS('font-size', '14px');
  await page.getByRole('button', { name: '공지 목록으로 돌아가기', exact: true }).click();
  await expect(page.getByRole('tab', { name: '기타', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
