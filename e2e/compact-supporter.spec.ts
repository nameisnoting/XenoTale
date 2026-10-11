import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const out = 'docs/screenshots/compact-supporter';
async function editor(page: Page) {
  await page.setViewportSize({ width: 1440, height: 852 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await fs.mkdir(out, { recursive: true });
}

test('제작 헤더 한 줄 · 저장완료는 공간 부족 시 숨김 · 크기 복원 시 다시 표시', async ({
  page,
}) => {
  await editor(page);
  const label = page.locator('.editor-title .saved-text');
  const title = page.locator('.editor-title strong');
  const actions = page.locator('.editor-header .inline-actions');
  for (const width of [1440, 1024, 801, 590, 440, 393, 360, 320, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    await expect(label).toHaveText('저장완료');
    const text = (await title.boundingBox())!;
    const toolbar = (await actions.boundingBox())!;
    expect(Math.abs(text.y + text.height / 2 - toolbar.y - toolbar.height / 2)).toBeLessThan(1);
    expect(text.x + text.width).toBeLessThanOrEqual(toolbar.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320) await expect(label).toBeHidden();
    if (width === 1440 || width === 393) await expect(label).toBeVisible();
    if (await label.isVisible()) {
      const saved = (await label.boundingBox())!;
      expect(saved.x + saved.width).toBeLessThanOrEqual(toolbar.x);
    }
    if (width <= 800) {
      const download = (await page
        .getByRole('button', { name: '작품 파일 내보내기' })
        .boundingBox())!;
      const publish = (await page
        .getByRole('button', { name: '제작완료', exact: true })
        .boundingBox())!;
      expect(publish.x - download.x - download.width).toBe(16);
    }
    if ([1440, 393, 320].includes(width))
      await page.screenshot({ path: `${out}/header-${width}.png` });
  }
  await page.getByRole('button', { name: '제작 서포터 접기', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 852 });
  await expect(page.getByRole('button', { name: '제작 서포터 펼치기', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: '제작 도구', exact: true })).toBeVisible();
  const a = (await title.boundingBox())!;
  const b = (await actions.boundingBox())!;
  expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('서포터는 사이드메뉴 콘텐츠 · 모달 없음 · 입력과 기록 유지 · PC 패널 공유', async ({
  page,
}) => {
  await editor(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: '제작 도구', exact: true }).click();
  const menu = page.locator('.editor-workspace');
  await menu.getByRole('button', { name: '제작 서포터', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(menu.getByRole('tablist', { name: '제작 서포터 탭' })).toBeVisible();
  await expect(menu.getByRole('tab', { name: '대화 테스트', exact: true })).toBeVisible();
  await menu
    .getByRole('textbox', { name: '서포터 메시지', exact: true })
    .fill('정원의 설정을 도와줘');
  await menu.getByRole('button', { name: '작업공간', exact: true }).click();
  await expect(menu.getByRole('button', { name: '작품 개요' })).toBeVisible();
  await expect(menu.getByRole('tablist', { name: '제작 서포터 탭' })).toBeHidden();
  await menu.getByRole('button', { name: '작업내역', exact: true }).click();
  await expect(menu.getByText('최근 작업', { exact: true })).toBeVisible();
  await menu.getByRole('button', { name: '제작 서포터', exact: true }).click();
  await expect(menu.getByRole('textbox', { name: '서포터 메시지' })).toHaveValue(
    '정원의 설정을 도와줘',
  );
  await menu.getByRole('button', { name: '서포터 전송', exact: true }).click();
  await expect(menu.getByText('현재는 예시 모드입니다.', { exact: false })).toBeVisible();
  await menu.getByRole('textbox', { name: '서포터 메시지' }).fill('다음 질문 초안');
  await page.screenshot({ path: `${out}/sidebar-agent.png` });
  await menu.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
  await page.getByRole('button', { name: '제작 도구', exact: true }).click();
  await expect(menu.getByRole('textbox', { name: '서포터 메시지' })).toHaveValue('다음 질문 초안');
  await page.setViewportSize({ width: 1440, height: 852 });
  const desktop = page.locator('.assistant-desktop');
  await expect(desktop.getByRole('textbox', { name: '서포터 메시지' })).toHaveValue(
    '다음 질문 초안',
  );
  await expect(desktop.getByText('정원의 설정을 도와줘', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '서포터 메시지' })).toHaveCount(1);
  await desktop.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await expect(desktop.locator('.creator-test')).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(menu.getByRole('tab', { name: '대화 테스트', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(menu.locator('.creator-test')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: `${out}/sidebar-test.png` });
});
