import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`추천 페르소나 선택 X · 마지막 항목 보호 · 선택 유지 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const section = async () => {
      if (width < 800)
        await page
          .locator('.editor-mobile-stages')
          .getByRole('tab', { name: '추천 페르소나', exact: false })
          .click();
      else
        await page
          .locator('.editor-nav')
          .getByRole('button', { name: '추천 페르소나', exact: false })
          .click();
    };
    await section();
    const library = page.locator('.creator-personas');
    const labels = library.locator('.selection-pill-label');
    const card = library.locator('.persona-card');
    const add = library.getByRole('button', { name: '추가', exact: true });
    await add.click();
    await expect(library.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(card.locator('.persona-chevron')).toHaveCount(0);
    await expect(card.getByRole('button', { name: /삭제$/ })).toHaveCount(0);
    await card.locator('.card-header').click();
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toBeVisible();
    await add.click();
    await add.click();
    await card.getByRole('textbox', { name: '프롬프트', exact: true }).fill('보존할 설정');
    await expect(library.locator('.selection-pill-delete')).toHaveCount(3);
    await library.getByRole('button', { name: '페르소나 1 삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(labels).toHaveText(['페르소나 2', '페르소나 3']);
    await expect(labels.last()).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '보존할 설정',
    );
    await library.getByRole('button', { name: '페르소나 3 삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
    await expect(labels).toHaveCount(2);
    // Creator edits within 700ms share an undo snapshot; start a separate deletion.
    await page.clock.install();
    await page.clock.fastForward(800);
    await library.getByRole('button', { name: '페르소나 3 삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(labels).toHaveText(['페르소나 2']);
    await expect(labels.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(library.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(labels).toHaveText(['페르소나 2', '페르소나 3']);
    await labels.last().click();
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '보존할 설정',
    );
    await page.getByRole('button', { name: '다시 실행', exact: true }).click();
    await expect(labels).toHaveText(['페르소나 2']);
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await section();
    await expect(labels).toHaveText(['페르소나 2']);
    await expect(library.locator('.selection-pill-delete')).toHaveCount(0);
  });
}
