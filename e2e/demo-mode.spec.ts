import { test, expect } from '@playwright/test';

test('시작은 현재 키 검증 성공 후에만 허용하며 실패·입력 변경·늦은 응답을 구분한다', async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('https://openrouter.ai/**', async (route) => {
    if (route.request().url().endsWith('/key')) {
      const key = route.request().headers().authorization;
      if (key === 'Bearer pending-key') await pending;
      return route.fulfill({
        status: key === 'Bearer invalid-key' ? 401 : 200,
        json: { data: {} },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'XenoTale 시작', exact: true });
  const input = page.getByRole('textbox', { name: 'API key', exact: true });
  const check = () => page.getByRole('button', { name: '키 확인', exact: true });
  await expect(start).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }),
  ).toBeEnabled();
  await input.fill('invalid-key');
  await check().click();
  await expect(
    page.getByRole('status').filter({ hasText: 'API 키가 유효하지 않습니다.' }),
  ).toBeVisible();
  await expect(start).toBeDisabled();
  await input.fill('pending-key');
  await check().click();
  await expect(page.getByRole('button', { name: '확인 중…', exact: true })).toBeVisible();
  await input.fill('new-key');
  release();
  await expect(check()).toBeVisible();
  await expect(start).toBeDisabled();
  await check().click();
  await expect(start).toBeEnabled();
  await input.fill('changed-key');
  await expect(start).toBeDisabled();
  await check().click();
  await expect(start).toBeEnabled();
  const nickname = page.getByRole('textbox', { name: '닉네임 *', exact: true });
  await nickname.fill(' ');
  await expect(start).toBeDisabled();
  await nickname.fill('테스터');
  await start.click();
  await expect(page.locator('.library-layout')).toBeVisible();
});

for (const width of [1440, 393]) {
  test(`키 없는 체험 응답·추천 답변·상태창은 중립 문구이고 캐릭터와 원본 상태는 유지 (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let completions = 0;
    await page.route('https://openrouter.ai/**', (route) => {
      if (route.request().url().includes('/chat/completions')) completions++;
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page
      .getByRole('textbox', { name: '메시지', exact: true })
      .fill('정원으로 가서 열쇠를 주세요');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    const response = page.locator('.assistant-section').last();
    await expect(response.locator('.story-body')).toContainText('여기에 지문이 나옵니다.');
    await expect(response.locator('.character-message strong')).toHaveText('아리아');
    await expect(response.locator('.character-message .avatar')).toBeVisible();
    await expect(response.locator('.story-body')).toContainText('여기에 캐릭터 대사가 나옵니다.');
    await expect(response.locator('.story-body')).not.toContainText('정원');
    await expect(response.locator('.status-display')).toContainText(
      '상태1: 여기에 상태값이 나옵니다.',
    );
    await expect(response.locator('.status-display')).not.toContainText('호감도');
    await expect(page.locator('.suggestions')).toContainText('여기에 추천 답변 1이 나옵니다.');
    await expect(page.getByTestId('status-affinity')).toHaveText('10');
    await expect(page.getByTestId('status-place')).toHaveText('문 앞');
    await page.reload();
    await expect(page.locator('.assistant-section .story-body')).toContainText(
      '여기에 캐릭터 대사가 나옵니다.',
    );
    expect(completions).toBe(0);
    await page.screenshot({ path: `test-results/demo-mode-${width}.png`, fullPage: true });
  });
}
