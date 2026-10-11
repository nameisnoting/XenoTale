import { test, expect, type Page } from '@playwright/test';

const model = {
  id: 'test/flash',
  name: 'Flash 테스트 모델',
  context_length: 200000,
  supported_parameters: ['response_format', 'structured_outputs'],
};
async function setup(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  const state = {
    mode: 'ready' as 'ready' | 'hold' | 'fail' | 'missing',
    catalogCalls: 0,
    completions: [] as { model: string }[],
    release: () => {},
  };
  let pending: Promise<void> = Promise.resolve();
  const hold = () => {
    state.mode = 'hold';
    pending = new Promise<void>((resolve) => {
      state.release = () => {
        state.mode = 'ready';
        resolve();
      };
    });
    return state.catalogCalls;
  };
  await page.route('https://openrouter.ai/api/v1/models', async (route) => {
    state.catalogCalls++;
    if (state.mode === 'hold') await pending;
    await route.fulfill({
      status: state.mode === 'fail' ? 503 : 200,
      json: { data: state.mode === 'missing' ? [] : [model] },
    });
  });
  await page.route('https://openrouter.ai/api/v1/key', (route) =>
    route.fulfill({ json: { data: {} } }),
  );
  await page.route('https://openrouter.ai/api/v1/credits', (route) =>
    route.fulfill({ json: { data: { total_credits: 10, total_usage: 0 } } }),
  );
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) => {
    const request = route.request().postDataJSON();
    state.completions.push(request);
    const user = JSON.parse(request.messages.at(-1).content);
    const content = user.draftSchema
      ? { reply: '목록 로딩 후 제작 답변', proposals: [], questions: [] }
      : {
          kind: 'turn',
          requestedCharacterIds: [],
          body: '*목록 로딩 후 대화 응답*',
          choices: [],
          delta: {
            numeric: [],
            text: [],
            choice: [],
            inventory: [],
            presence: [],
            relationships: [],
          },
        };
    return route.fulfill({
      json: {
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-loading-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: model.name, exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }),
  ).toBeVisible();
  return { state, hold };
}
async function openRoom(page: Page) {
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.locator('.composer .model-trigger')).toContainText(model.name);
}
const messages = (page: Page) => page.getByRole('textbox', { name: '메시지', exact: true });
const send = (page: Page) => page.getByRole('button', { name: '전송', exact: true });

for (const width of [1440, 393]) {
  test(`새로고침 직후 전송은 자동 목록 로딩을 기다리고 한 번만 요청 (${width})`, async ({
    page,
  }) => {
    const { state, hold } = await setup(page, width);
    await openRoom(page);
    const before = hold();
    await page.reload();
    await expect.poll(() => state.catalogCalls).toBe(before + 1);
    await messages(page).fill('새로고침 직후 전송');
    await send(page).click();
    await expect(page.getByRole('button', { name: '생성 중단', exact: true })).toBeVisible();
    expect(state.completions).toHaveLength(0);
    expect(state.catalogCalls).toBe(before + 1);
    state.release();
    await expect(page.locator('.assistant-section .story-body')).toContainText(
      '목록 로딩 후 대화 응답',
    );
    expect(state.completions.map((request) => request.model)).toEqual([model.id]);
    await expect(page.getByRole('status').filter({ hasText: '모델 목록을 불러온 뒤' })).toHaveCount(
      0,
    );
    await expect(messages(page)).toHaveValue('');
    if (width === 1440) {
      const rerollBefore = hold();
      await page.reload();
      await expect.poll(() => state.catalogCalls).toBe(rerollBefore + 1);
      await page.getByRole('button', { name: '리롤', exact: true }).click();
      await page.getByRole('button', { name: '다른 응답 생성', exact: true }).click();
      state.release();
      await expect(page.locator('.candidate-pager')).toContainText('2 / 2');
      expect(state.completions).toHaveLength(2);
    }
  });
}

test('목록 로딩 중 중단하면 AI 요청 없이 입력 유지, 공유 목록 완료 후 다시 전송', async ({
  page,
}) => {
  const { state, hold } = await setup(page);
  await openRoom(page);
  const before = hold();
  await page.reload();
  await expect.poll(() => state.catalogCalls).toBe(before + 1);
  await messages(page).fill('중단해도 보존');
  await send(page).click();
  await page.getByRole('button', { name: '생성 중단', exact: true }).click();
  await expect(send(page)).toBeVisible();
  await expect(messages(page)).toHaveValue('중단해도 보존');
  state.release();
  await expect(page.locator('.composer .model-trigger')).toContainText(model.name);
  expect(state.completions).toHaveLength(0);
  await send(page).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  expect(state.completions).toHaveLength(1);
});

test('목록 요청 실패는 입력 보존, 복구 후 같은 전송으로 재시도', async ({ page }) => {
  const { state } = await setup(page);
  await openRoom(page);
  state.mode = 'fail';
  await page.reload();
  const failure = page.getByRole('status').filter({ hasText: '모델 목록을 불러오지 못했습니다.' });
  await expect(failure).toBeVisible();
  await messages(page).fill('실패해도 보존');
  await send(page).click();
  await expect(send(page)).toBeVisible();
  await expect(messages(page)).toHaveValue('실패해도 보존');
  expect(state.completions).toHaveLength(0);
  state.mode = 'ready';
  await send(page).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  expect(state.completions).toHaveLength(1);
});

test('목록에서 없어진 모델은 변경 안내, 다른 모델로 임의 전송하지 않음', async ({ page }) => {
  const { state } = await setup(page);
  await openRoom(page);
  state.mode = 'missing';
  await page.reload();
  await messages(page).fill('없는 모델 검사');
  await send(page).click();
  await expect(
    page.getByRole('status').filter({ hasText: '선택한 모델을 사용할 수 없습니다.' }),
  ).toBeVisible();
  await expect(messages(page)).toHaveValue('없는 모델 검사');
  expect(state.completions).toHaveLength(0);
});

for (const panel of ['대화 테스트', '제작 서포터']) {
  test(`${panel}도 새로고침 후 목록을 기다려 전송`, async ({ page }) => {
    const { state, hold } = await setup(page);
    await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
    const form = page.locator('.editor-form');
    await form.getByRole('textbox', { name: /^제목/ }).fill('목록 로딩 검사');
    await form.getByRole('textbox', { name: /^프롬프트/ }).fill('테스트 세계관');
    await page
      .locator('.editor-nav')
      .getByRole('button', { name: '등장 캐릭터', exact: false })
      .click();
    await form.getByRole('textbox', { name: /^이름/ }).fill('안내인');
    await form.getByRole('textbox', { name: /^캐릭터 프롬프트/ }).fill('테스트 안내인');
    await page.locator('.editor-nav').getByRole('button', { name: '도입부', exact: false }).click();
    await form.getByRole('textbox', { name: /^내용/ }).fill('*테스트 도입부*');
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    if (panel === '대화 테스트') await page.getByRole('tab', { name: panel, exact: true }).click();
    const before = hold();
    await page.reload();
    await expect.poll(() => state.catalogCalls).toBe(before + 1);
    if (panel === '대화 테스트') await page.getByRole('tab', { name: panel, exact: true }).click();
    const isTest = panel === '대화 테스트';
    const input = page.getByRole('textbox', {
      name: isTest ? '테스트 메시지' : '서포터 메시지',
      exact: true,
    });
    await input.fill('목록을 기다려줘');
    await page
      .getByRole('button', { name: isTest ? '테스트 전송' : '서포터 전송', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: isTest ? '테스트 생성 중단' : '서포터 생성 중단',
        exact: true,
      }),
    ).toBeVisible();
    expect(state.completions).toHaveLength(0);
    expect(state.catalogCalls).toBe(before + 1);
    state.release();
    await expect(page.locator(isTest ? '.creator-test' : '.assistant')).toContainText(
      isTest ? '목록 로딩 후 대화 응답' : '목록 로딩 후 제작 답변',
    );
    expect(state.completions.map((request) => request.model)).toEqual([model.id]);
  });
}
