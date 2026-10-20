import { jsonPromptBlock } from './helpers/prompt';
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
  const requests: { model: string; messages: { content: string }[] }[] = [];
  await page.context().route('https://openrouter.ai/api/v1/chat/completions', (r) => {
    const request = r.request().postDataJSON();
    requests.push(request);
    const user = jsonPromptBlock(request.messages.at(-1).content);
    const content = user.draftSchema
      ? { reply: '공통 에이전트 모델 답변', proposals: [], questions: [] }
      : request.response_format?.json_schema?.name === 'xenotale_turn'
        ? {
            kind: 'turn',
            requestedCharacterIds: [],
            body: '*공통 대화 모델 답변*',
            choices: [],
            delta: {
              numeric: [],
              text: [],
              choice: [],
              inventory: [],
              presence: [],
              relationships: [],
            },
          }
        : { title: '공통 요약 모델', content: '대화 내용 요약' };
    return r.fulfill({
      json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] },
    });
  });
  await page.goto('/');
  await expect(
    page.getByText('새 대화방과 새 작업 페이지의 기본 모델입니다.', { exact: true }),
  ).toHaveCount(0);
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
  return requests;
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
async function memory(page: Page, width: number) {
  if (width <= 800) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await page
    .getByRole('button', { name: width <= 800 ? '기억 관리' : '기억관리', exact: true })
    .click();
  await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
}
async function support(page: Page, width: number) {
  if (width <= 800) {
    if (!(await page.locator('.editor-rail').isVisible()))
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-workspace')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
}
async function newRoom(page: Page) {
  await page.goto('/#/');
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.waitForURL(/#\/chat\/[^/]+$/);
  return page.url();
}
for (const width of [1440, 393]) {
  test(`모든 방의 채팅·요약 모델 공유, 새로고침 및 실제 요청 (${width})`, async ({ page }) => {
    const requests = await setup(page, width);
    const firstUrl = await newRoom(page);
    await select(page, page.locator('.composer .model-trigger'), '모델 B');
    await memory(page, width);
    await select(page, page.locator('.memory-model'), '모델 C');
    await expect
      .poll(async () => {
        const p = (await stored(page)).profile;
        return [p.defaultModel, p.summaryModel];
      })
      .toEqual(['test/model-B', 'test/model-C']);
    await page.goto(firstUrl);
    await page.reload();
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 B');
    const secondUrl = await newRoom(page);
    expect(secondUrl).not.toBe(firstUrl);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 B');
    await memory(page, width);
    await expect(page.locator('.memory-model')).toContainText('모델 C');
    await select(page, page.locator('.memory-model'), '모델 A');
    await page.goto(secondUrl);
    await select(page, page.locator('.composer .model-trigger'), '모델 D');
    await page.goto(firstUrl);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 D');
    await page
      .getByRole('textbox', { name: '메시지', exact: true })
      .fill('기존 방에서 변경된 모델로 전송');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.conversation-turn')).toHaveCount(1);
    expect(requests.at(-1)?.model).toBe('test/model-D');
    await memory(page, width);
    await expect(page.locator('.memory-model')).toContainText('모델 A');
    await page.getByRole('tab', { name: '단기요약', exact: true }).click();
    await page.getByRole('button', { name: '지금 요약', exact: true }).click();
    await expect(page.locator('.memory-card summary')).toContainText('공통 요약 모델');
    expect(requests.at(-1)?.model).toBe('test/model-A');
    await newRoom(page);
    await expect(page.locator('.composer .model-trigger')).toContainText('모델 D');
    const p = (await stored(page)).profile;
    expect([p.creatorTestModel, p.creatorAgentModel]).toEqual(['test/model-A', 'test/model-A']);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    for (const label of ['채팅용 LLM', '요약용 LLM'])
      await expect(page.getByRole('group', { name: label, exact: true })).toHaveCount(0);
  });
  test(`에이전트·테스트 모델은 용도별 공유하며 서로 독립 (${width})`, async ({ page, context }) => {
    const requests = await setup(page, width);
    await page
      .getByRole('button', { name: width <= 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.waitForURL(/#\/create\//);
    const firstUrl = page.url();
    await support(page, width);
    await select(page, page.locator('.assistant .model-trigger'), '모델 B');
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await select(page, page.locator('.creator-test .model-trigger'), '모델 C');
    await expect
      .poll(async () => {
        const p = (await stored(page)).profile;
        return [p.creatorAgentModel, p.creatorTestModel];
      })
      .toEqual(['test/model-B', 'test/model-C']);
    await page.reload();
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
    await other.setViewportSize({ width, height: 1000 });
    await other.waitForURL(/#\/create\//);
    await support(other, width);
    await expect(other.locator('.assistant .model-trigger')).toContainText('모델 B');
    await select(other, other.locator('.assistant .model-trigger'), '모델 D');
    await other.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(other.locator('.creator-test .model-trigger')).toContainText('모델 C');
    await select(other, other.locator('.creator-test .model-trigger'), '모델 A');
    // The original open workspace updates live, without reloading.
    await support(page, width);
    await expect(page.locator('.assistant .model-trigger')).toContainText('모델 D');
    await page.getByRole('textbox', { name: '서포터 메시지', exact: true }).fill('설명을 부탁해');
    await page
      .locator('.assistant')
      .getByRole('button', { name: '서포터 전송', exact: true })
      .click();
    await expect(page.locator('.assistant')).toContainText('공통 에이전트 모델 답변');
    expect(requests.at(-1)?.model).toBe('test/model-D');
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(page.locator('.creator-test .model-trigger')).toContainText('모델 A');
    await page.goto(firstUrl);
    await page.reload();
    await support(page, width);
    await expect(page.locator('.assistant .model-trigger')).toContainText('모델 D');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction(['workspaces', 'works'], 'readwrite');
            const table = tx.objectStore('workspaces');
            const read = table.get(location.hash.split('/create/')[1]);
            read.onsuccess = () => {
              const fixture = tx.objectStore('works').getAll();
              fixture.onsuccess = () =>
                table.put({
                  ...read.result,
                  work: { ...fixture.result[0].work, id: read.result.work.id },
                  revision: read.result.revision + 1,
                });
            };
            tx.oncomplete = () => {
              database.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await support(page, width);
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await page.getByRole('textbox', { name: '테스트 메시지', exact: true }).fill('테스트 요청');
    await page
      .locator('.creator-test')
      .getByRole('button', { name: '테스트 전송', exact: true })
      .click();
    await expect(page.locator('.creator-test')).toContainText('공통 대화 모델 답변');
    expect(requests.at(-1)?.model).toBe('test/model-A');
    const p = (await stored(page)).profile;
    expect([p.defaultModel, p.summaryModel]).toEqual(['test/model-A', 'test/model-A']);
    await other.close();
  });
}
