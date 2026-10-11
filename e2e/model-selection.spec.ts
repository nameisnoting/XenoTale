import { test, expect, type Page, type Locator } from '@playwright/test';
const models = ['A', 'B', 'C', 'D'].map((name) => ({
  id: `test/model-${name}`,
  name: `모델 ${name}`,
  context_length: 200000,
  supported_parameters: ['response_format', 'structured_outputs'],
}));
async function select(page: Page, trigger: Locator, model: string) {
  await trigger.click();
  await page.locator('.model-modal').getByRole('button', { name: model, exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
}
async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page
    .context()
    .route('https://openrouter.ai/api/v1/models', (r) => r.fulfill({ json: { data: models } }));
  await page
    .context()
    .route('https://openrouter.ai/api/v1/key', (r) => r.fulfill({ json: { data: {} } }));
  await page
    .context()
    .route('https://openrouter.ai/api/v1/credits', (r) =>
      r.fulfill({ json: { data: { total_credits: 10, total_usage: 0 } } }),
    );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-model-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  for (const label of ['채팅용 LLM', '요약용 LLM'])
    await select(
      page,
      page.getByRole('group', { name: label, exact: true }).getByRole('button'),
      '모델 A',
    );
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
}
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(['rooms', 'workspaces', 'profiles']);
          const rooms = tx.objectStore('rooms').getAll(),
            workspaces = tx.objectStore('workspaces').getAll(),
            profile = tx.objectStore('profiles').get('profile');
          tx.oncomplete = () => {
            database.close();
            resolve({
              rooms: rooms.result,
              workspaces: workspaces.result,
              profile: profile.result,
            });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
async function defaults(page: Page, name: string) {
  await page.goto('/#/profile');
  await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
  for (const label of ['채팅용 LLM', '요약용 LLM'])
    await select(
      page,
      page.getByRole('group', { name: label, exact: true }).getByRole('button'),
      name,
    );
  await expect
    .poll(async () => (await stored(page)).profile.summaryModel)
    .toBe(`test/model-${name.at(-1)}`);
}
async function support(page: Page, width: number) {
  if (width <= 800) {
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-workspace')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
}
for (const width of [1440, 393]) {
  test(`대화방 채팅·요약 모델의 새로고침·방별 분리와 기본값 독립 (${width})`, async ({ page }) => {
    await setup(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.waitForURL(/#\/chat\/[^/]+$/);
    const firstUrl = page.url(),
      firstId = firstUrl.split('/chat/')[1];
    await select(page, page.locator('.composer .model-trigger'), '모델 B');
    if (width <= 800) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page
      .getByRole('button', { name: width <= 800 ? '기억 관리' : '기억관리', exact: true })
      .click();
    await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
    await select(page, page.locator('.memory-model'), '모델 C');
    await expect
      .poll(async () => {
        const value = (await stored(page)).rooms.find((room: any) => room.id === firstId).current
          .context.settings;
        return [value.modelId, value.summaryModelId];
      })
      .toEqual(['test/model-B', 'test/model-C']);
    await page.goto(firstUrl);
    await page.reload();
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 B');
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.waitForURL(/#\/chat\/[^/]+$/);
    const secondId = page.url().split('/chat/')[1];
    expect(secondId).not.toBe(firstId);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 A');
    await defaults(page, '모델 D');
    await page.goto(firstUrl);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 B');
    const value = await stored(page);
    const first = value.rooms.find((room: any) => room.id === firstId).current.context.settings;
    const second = value.rooms.find((room: any) => room.id === secondId).current.context.settings;
    expect([first.modelId, first.summaryModelId]).toEqual(['test/model-B', 'test/model-C']);
    expect([second.modelId, second.summaryModelId]).toEqual(['test/model-A', 'test/model-A']);
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.waitForURL(/#\/chat\/[^/]+$/);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 D');
  });
  test(`작업공간의 에이전트·테스트 모델 유지와 API 기본값 독립 (${width})`, async ({
    page,
    context,
  }) => {
    await setup(page, width);
    await page
      .getByRole('button', { name: width <= 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.waitForURL(/#\/create\//);
    const firstUrl = page.url(),
      firstId = firstUrl.split('/create/')[1];
    await support(page, width);
    await select(page, page.locator('.assistant .model-trigger'), '모델 B');
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await select(page, page.locator('.creator-test .model-trigger'), '모델 C');
    await expect
      .poll(
        async () =>
          (await stored(page)).workspaces.find((workspace: any) => workspace.id === firstId)
            .supporterSettings,
      )
      .toEqual({ agentModelId: 'test/model-B', testModelId: 'test/model-C', testCreativity: 2 });
    await page.reload();
    await support(page, width);
    await expect(page.locator('.assistant .model-trigger')).toContainText('모델 B');
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(page.locator('.creator-test .model-trigger')).toContainText('모델 C');
    await defaults(page, '모델 D');
    await page.goto(firstUrl);
    await support(page, width);
    await expect(page.locator('.assistant .model-trigger')).toContainText('모델 B');
    if (width <= 800)
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '작업공간', exact: true })
        .click();
    const popup = context.waitForEvent('page');
    await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
    const other = await popup;
    await other.waitForURL(/#\/create\//);
    const otherId = other.url().split('/create/')[1];
    await expect
      .poll(
        async () =>
          (await stored(other)).workspaces.find((workspace: any) => workspace.id === otherId)
            .supporterSettings,
      )
      .toEqual({ agentModelId: 'test/model-D', testModelId: 'test/model-D', testCreativity: 2 });
    const original = (await stored(other)).workspaces.find(
      (workspace: any) => workspace.id === firstId,
    );
    expect(original.supporterSettings.agentModelId).toBe('test/model-B');
    expect(original.supporterSettings.testModelId).toBe('test/model-C');
    await other.close();
  });
}
