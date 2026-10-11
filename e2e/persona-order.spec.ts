import { test, expect } from '@playwright/test';

for (const width of [1440, 393])
  test(`페르소나 신규 추가는 하단 · 제작자 복사는 상단 · 화면 간 순서 공유 (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.goto('/#/profile/personas');
    const names = page.locator('.persona-title');
    const add = page.getByRole('button', { name: '페르소나 추가', exact: true });
    await add.click();
    await expect(names).toHaveText(['페르소나 1']);
    await add.click();
    await expect(names).toHaveText(['페르소나 1', '페르소나 2']);
    await page.reload();
    await expect(names).toHaveText(['페르소나 1', '페르소나 2']);
    await page.goto('/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    if (width === 393) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '유저 페르소나' : '페르소나', exact: true })
      .click();
    const titles = page.locator('.chat-personas .persona-title');
    await expect(titles).toHaveCount(3);
    const authoredName = (await titles.first().textContent())!;
    await add.click();
    await expect(titles).toHaveText([authoredName, '페르소나 1', '페르소나 2', '페르소나 3']);
    const recommended = page.locator('.chat-personas .persona-card').first();
    await recommended.locator('summary').click();
    await recommended.getByRole('button', { name: '내 페르소나로 복사', exact: true }).click();
    await expect(titles).toHaveText([
      authoredName,
      authoredName,
      '페르소나 1',
      '페르소나 2',
      '페르소나 3',
    ]);
    await page.goto('/#/profile/personas');
    await expect(names).toHaveText([authoredName, '페르소나 1', '페르소나 2', '페르소나 3']);
    await page.reload();
    await expect(names).toHaveText([authoredName, '페르소나 1', '페르소나 2', '페르소나 3']);
  });
