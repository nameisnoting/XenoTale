import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const out = 'docs/screenshots/scroll-editor-tabs';
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 852 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}

for (const width of [1440, 393]) {
  test(`긴 메인 목록 스크롤은 화면 안에 유지 · ${width}px`, async ({ page }) => {
    await start(page, width);
    for (let index = 1; index <= 6; index++) {
      await page.getByRole('button', { name: '캐러셀 만들기', exact: true }).click();
      await page.getByRole('textbox', { name: '캐러셀 이름', exact: true }).fill(`목록 ${index}`);
      await page.getByRole('button', { name: '완료', exact: true }).click();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBe(852);
    // A wheel gesture must move the list, leaving the page and navigation in place.
    await page.mouse.move(width - 80, 300);
    await page.mouse.wheel(0, 700);
    await expect
      .poll(() => page.locator('.library-main').evaluate((e) => e.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    if (width < 800) {
      const navigation = (await page
        .getByRole('navigation', { name: '하단 내비게이션' })
        .boundingBox())!;
      expect(navigation.y + navigation.height).toBe(852);
    } else {
      const sidebar = (await page.locator('.room-sidebar').boundingBox())!;
      expect(sidebar.y).toBe(0);
      expect(sidebar.height).toBe(852);
    }
    await page.screenshot({ path: `${out}/main-${width}.png` });
    await page.reload();
    await expect(
      page.getByRole('button', { name: '목록 6 위치 이동', exact: true }),
    ).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(852);
  });
}

test('제작 헤더 저장 상태 · 모바일 단계 탭 · 뒤로가기 저장 유지', async ({ page }) => {
  await start(page, 1440);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  const title = page.locator('.editor-title strong');
  const saved = page.locator('.editor-title .saved');
  const assertInline = async () => {
    await expect(saved).toContainText('저장완료');
    const a = (await title.boundingBox())!;
    const b = (await saved.boundingBox())!;
    if (b.width > 0) {
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
      expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(1);
    }
  };
  await assertInline();
  await page.screenshot({ path: `${out}/editor-desktop.png` });
  for (const width of [590, 393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    await assertInline();
    await expect(page.getByRole('button', { name: '메인으로', exact: true })).toBeVisible();
    const download = (await page
      .getByRole('button', { name: '작품 파일 내보내기' })
      .boundingBox())!;
    const publish = (await page
      .getByRole('button', { name: '제작완료', exact: true })
      .boundingBox())!;
    expect(publish.x - download.x - download.width).toBe(16);
    await expect(page.getByRole('button', { name: '실행 취소' })).toBeVisible();
    await expect(page.locator('.bottom-navigation')).toHaveCount(0);
    const tabs = page.getByRole('tablist', { name: '제작 단계' });
    await expect(tabs.getByRole('tab')).toHaveCount(12);
    const first = tabs.getByRole('tab', { name: '작품 개요' });
    await first.click();
    await first.press('End');
    await expect(tabs.getByRole('tab', { name: '플레이가이드', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await tabs.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: `${out}/editor-${width}-tabs.png` });
    await tabs.getByRole('tab', { name: '플레이가이드', exact: true }).press('Home');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    // Content scrolls independently of the header and horizontal stages.
    await page.mouse.move(width - 50, 450);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => page.locator('.editor-fieldset').evaluate((e) => e.scrollTop))
      .toBeGreaterThan(0);
    expect((await page.locator('.editor-header').boundingBox())!.y).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('.editor-fieldset').evaluate((e) => {
      e.scrollTop = 0;
    });
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('뒤로가도 남는 초안');
  const editorURL = page.url();
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible();
  await page.goto(editorURL);
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '뒤로가도 남는 초안',
  );
  await page.screenshot({ path: `${out}/editor-mobile.png` });
});
