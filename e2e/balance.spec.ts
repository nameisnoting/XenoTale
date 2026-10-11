import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/balance';
const emptyDelta = {
  numeric: [],
  text: [],
  choice: [],
  inventory: [],
  presence: [],
  relationships: [],
};
const model = {
  id: 'test/balance',
  name: '잔액 검증 모델',
  context_length: 200000,
  supported_parameters: ['structured_outputs'],
};
async function connect(page: Page) {
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [model] } }),
  );
  await page.route('https://openrouter.ai/api/v1/key', (route) =>
    route.fulfill({ json: { data: { label: 'test', limit_remaining: 100 } } }),
  );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-balance-test');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: '잔액 검증 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await fs.mkdir(out, { recursive: true });
}
test('키 없으면 0 · 잔액 API를 호출하지 않음 · 예시 대화 뒤에도 0', async ({ page }) => {
  let reads = 0;
  await page.route('https://openrouter.ai/**', (route) => {
    if (route.request().url().endsWith('/credits')) reads++;
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText('0');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText('0');
  expect(reads).toBe(0);
});
test('계정 잔액 표시 · 응답 후 갱신 · 모바일과 접힌 PC에서 같은 값', async ({ page }) => {
  let usage = 7.5;
  await page.route('https://openrouter.ai/api/v1/credits', (route) => {
    expect(route.request().headers().authorization).toBe('Bearer fake-balance-test');
    return route.fulfill({ json: { data: { total_credits: 20, total_usage: usage } } });
  });
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) => {
    usage += 0.25;
    return route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                kind: 'turn',
                requestedCharacterIds: [],
                body: '@아리아: 안녕하세요.',
                choices: [],
                delta: emptyDelta,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.25 },
      },
    });
  });
  await connect(page);
  const balance = page.getByRole('button', { name: '사용량 보기', exact: true });
  await expect(balance).toHaveText('$12.5');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(balance).toHaveText('$12.25');
  await page.getByRole('button', { name: '대화 로그 접기', exact: true }).click();
  await expect(balance).toHaveText('$12.25');
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  await expect(balance).toHaveText('$12.25');
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 7000 });
  await page.screenshot({ path: `${out}/mobile-credit.png` });
  await balance.click();
  await expect(page.locator('.account-credit strong')).toHaveText('$12.25');
  await expect(page.locator('.stat-list')).toContainText('$0.25');
  await page.screenshot({ path: `${out}/mobile-usage.png` });
});
test('실제 잔액 0 · 조회 실패는 0과 구분 · 수동 새로고침으로 복구', async ({ page }) => {
  let failing = false;
  await page.route('https://openrouter.ai/api/v1/credits', (route) =>
    failing
      ? route.fulfill({ status: 500, json: { error: { message: 'test' } } })
      : route.fulfill({ json: { data: { total_credits: 10, total_usage: 10 } } }),
  );
  await connect(page);
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText('0');
  await page.getByRole('button', { name: '사용량 보기', exact: true }).click();
  const refresh = page.getByRole('button', { name: '잔액 새로고침', exact: true });
  failing = true;
  await refresh.click();
  await expect(page.locator('.account-credit strong')).toHaveText('조회 불가');
  await expect(refresh).toBeEnabled();
  failing = false;
  await refresh.click();
  await expect(page.locator('.account-credit strong')).toHaveText('0');
  await page.getByRole('button', { name: '대화 로그로 돌아가기', exact: true }).click();
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText('0');
});
test('일반 키의 계정 조회 권한 거절 · 키 한도를 계정 잔액으로 오인하지 않음', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route('https://openrouter.ai/api/v1/credits', (route) =>
    route.fulfill({
      status: 403,
      json: { error: { message: 'Only management keys can perform this operation' } },
    }),
  );
  await connect(page);
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  await expect(page.getByRole('button', { name: '사용량 보기', exact: true })).toHaveText(
    '조회 불가',
  );
  await page.getByRole('button', { name: '사용량 보기', exact: true }).click();
  await expect(page.locator('.account-credit')).toContainText(
    '이 API 키에는 계정 잔액 조회 권한이 없습니다.',
  );
  await expect(page.locator('.account-credit')).not.toContainText('$100');
  await page.screenshot({ path: `${out}/permission.png` });
});
