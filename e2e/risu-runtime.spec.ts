import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { join } from 'node:path';

for (const width of [1440, 393])
  test(`Risu 원본 생성창·선택·설정창·새로고침 ${width}`, async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!process.env.RISU_EXAMPLES_DIR, 'Private fixtures stay outside the repository.');
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: /^제목/ })).toBeVisible();
    const name = (await fs.readdir(process.env.RISU_EXAMPLES_DIR!)).find((n) =>
      n.endsWith('.png'),
    )!;
    await page
      .locator('input[accept*=".charx"]')
      .setInputFiles(join(process.env.RISU_EXAMPLES_DIR!, name));
    await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
    await expect(page.getByRole('textbox', { name: /^제목/ })).toHaveValue('던전 앤 다이스');
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    const frame = page.frameLocator('.support-transcript .risu-message iframe').first();
    await expect(frame.getByRole('button', { name: '골리앗', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(frame.locator('.dnd-intro').first()).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await frame.locator('body').evaluate(() => {
      (window as any).documentMarker = 'original';
    });
    await frame.getByRole('button', { name: '엘프', exact: true }).click();
    await frame.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }).click();
    await expect(frame.getByText('2/7 · 클래스', { exact: true })).toBeVisible();
    await expect(frame.getByRole('button', { name: '위저드', exact: true })).toBeVisible();
    expect(await frame.locator('body').evaluate(() => (window as any).documentMarker)).toBe(
      'original',
    );
    await expect
      .poll(async () => frame.locator('html').evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(frame.getByText('2/7 · 클래스', { exact: true })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: `test-results/risu-runtime-${width}.png` });
  });
