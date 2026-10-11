import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
async function aboveModal(page: Page, width: number) {
  const toast = page.getByRole('status');
  await expect(toast).toContainText('유효한 API 키입니다.');
  expect(await toast.evaluate((e) => e.matches(':popover-open'))).toBe(true);
  const box = (await toast.boundingBox())!;
  expect(box.y).toBe(width === 393 ? 16 : 24);
  expect(
    await toast.evaluate((e) => {
      const box = e.getBoundingClientRect();
      return !!document
        .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        ?.closest('.toast');
    }),
  ).toBe(true);
  return toast;
}
for (const width of [1440, 393])
  test(`모달 위 상단 토스트 표시·닫기·모달 전환 (${width})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-toast-key');
    await page.getByRole('button', { name: '키 확인', exact: true }).click();
    const toast = await aboveModal(page, width);
    expect(await toast.evaluate((e) => !!e.closest('dialog:modal'))).toBe(true);
    await fs.mkdir('docs/screenshots/toast', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/toast/api-${width}.png` });
    await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
    await expect(toast).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '연결 확인됨', exact: true }).click();
    await aboveModal(page, width);
    const stableToast = await toast.elementHandle();
    await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
    await expect.poll(() => page.locator('dialog[open]').count()).toBe(2);
    await aboveModal(page, width);
    expect(
      await toast.evaluate(
        (e) => e.closest('dialog') === [...document.querySelectorAll('dialog:modal')].at(-1),
      ),
    ).toBe(true);
    await page
      .locator('dialog')
      .filter({ has: page.getByRole('heading', { name: '대화 모델', exact: true }) })
      .getByRole('button', { name: '닫기', exact: true })
      .click();
    await expect.poll(() => page.locator('dialog[open]').count()).toBe(1);
    await aboveModal(page, width);
    await page
      .locator('dialog')
      .filter({ has: page.getByRole('heading', { name: 'API 키 관리', exact: true }) })
      .getByRole('button', { name: '닫기', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await aboveModal(page, width);
    expect(await toast.evaluate((e) => !!e.closest('dialog'))).toBe(false);
    expect(await stableToast!.evaluate((e) => e.isConnected && e.matches(':popover-open'))).toBe(
      true,
    );
    await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
    await expect(toast).toHaveCount(0);
    await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await page.getByRole('button', { name: '연결 확인됨', exact: true }).click();
    await aboveModal(page, width);
    expect(errors).toEqual([]);
  });
