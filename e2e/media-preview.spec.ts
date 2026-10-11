import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const out = 'docs/screenshots/media-preview';
async function section(page: Page, name: string) {
  if (page.viewportSize()!.width <= 800)
    await page.getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}

for (const width of [1440, 393]) {
  test(`미디어 미리보기 영역 전환 · 돌아가기 · 코드 치환 · ${width}px`, async ({ page }) => {
    const reversed = width === 393;
    const path = (character: string, situation: string) =>
      reversed ? `${situation}/${character}` : `${character}/${situation}`;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.route('https://images.test/**', (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === `/${path('9', '2')}.svg`) return route.fulfill({ status: 404 });
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560"><rect width="420" height="560" fill="#30534e"/><circle cx="210" cy="200" r="90" fill="#5fddce"/><text x="210" y="390" text-anchor="middle" fill="white" font-size="36">${pathname}</text></svg>`,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
    await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
    await section(page, '등장 캐릭터');
    await page.getByRole('textbox', { name: '이름', exact: false }).fill('아리아');
    await page.locator('.tab-pills').getByRole('button', { name: '추가', exact: true }).click();
    await page.getByRole('textbox', { name: '이름', exact: false }).fill('세라');
    await page.setViewportSize({ width, height: 1000 });
    await section(page, '미디어');
    const media = page.locator('.media-editor');
    const url = media.getByRole('textbox', { name: '이미지 URL', exact: true });
    const template = reversed
      ? 'https://images.test/{{situation_code}}/{{char_code}}.svg'
      : 'https://images.test/{{char_code}}/{{situation_code}}.svg';
    await url.fill(template);
    await media.getByRole('textbox', { name: '아리아 코드', exact: true }).fill('7');
    await media.getByRole('textbox', { name: '세라 코드', exact: true }).fill('9');
    await media.getByRole('spinbutton', { name: '최댓값', exact: true }).fill('3');
    const names = media.getByRole('textbox', { name: '상황 이름 정의', exact: true });
    await names.fill('기본, 미소, 놀람');
    await media.getByRole('button', { name: '이미지 등록', exact: true }).click();
    const preview = page.getByRole('region', { name: '등록 이미지 미리보기', exact: true });
    await expect(preview.getByRole('button')).toHaveCount(3);
    await expect(preview.locator('img')).toHaveCount(3);
    expect(
      await preview
        .locator('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('src'))),
    ).toEqual(['0', '7', '9'].map((code) => `https://images.test/${path(code, '1')}.svg`));
    const editorURL = page.url();
    const aria = preview.getByRole('button', { name: '아리아 상황 이미지 보기', exact: true });
    await aria.scrollIntoViewIfNeeded();
    expect(await aria.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
    await fs.mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/characters-${width}.png` });
    await aria.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      preview.getByRole('heading', { name: '아리아 · 상황 이미지', exact: true }),
    ).toBeFocused();
    expect(
      (await preview
        .getByRole('heading', { name: '아리아 · 상황 이미지', exact: true })
        .boundingBox())!.y,
    ).toBeLessThan(150);
    await expect(preview.locator('figure')).toHaveCount(3);
    expect(
      await preview
        .locator('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('src'))),
    ).toEqual(['1', '2', '3'].map((code) => `https://images.test/${path('7', code)}.svg`));
    await expect(url).toHaveValue(template);
    expect(page.url()).toBe(editorURL);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await page.locator('.editor-header').boundingBox())!.y).toBe(0);
    if (width < 800) {
      const figures = preview.locator('figure');
      const a = (await figures.nth(0).boundingBox())!;
      const b = (await figures.nth(1).boundingBox())!;
      expect(b.x).toBe(a.x);
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    }
    await page.screenshot({ path: `${out}/situations-${width}.png` });
    await preview.getByRole('button', { name: '캐릭터 목록으로', exact: true }).click();
    await expect(aria).toBeFocused();
    await expect(preview.getByRole('button')).toHaveCount(3);
    await preview.getByRole('button', { name: '세라 상황 이미지 보기', exact: true }).click();
    await expect(
      preview.getByRole('heading', { name: '세라 · 상황 이미지', exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole('img', { name: '미소 · 이미지를 불러오지 못했습니다', exact: false }),
    ).toBeVisible();
    await expect(preview.locator('figure')).toHaveCount(3);
    await preview.getByRole('button', { name: '캐릭터 목록으로', exact: true }).click();
    await preview.getByRole('button', { name: '공용 상황 이미지 보기', exact: true }).click();
    await expect(preview.locator('img').first()).toHaveAttribute(
      'src',
      `https://images.test/${path('0', '1')}.svg`,
    );
    await names.fill('새 기본, 미소, 놀람');
    await expect(preview).toHaveCount(0);
    await media.getByRole('button', { name: '이미지 등록', exact: true }).click();
    await expect(preview.getByRole('button')).toHaveCount(3);
    await expect(preview.getByRole('button', { name: '캐릭터 목록으로', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await section(page, '미디어');
    await expect(preview.getByRole('button')).toHaveCount(3);
    await expect(url).toHaveValue(template);
    await expect(names).toHaveValue('새 기본, 미소, 놀람');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
