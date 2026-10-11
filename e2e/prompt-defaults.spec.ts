import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function changeStored(page: Page, storeName: string, change: Record<string, unknown>) {
  await page.evaluate(
    ({ storeName, change }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const read = store.getAll();
          read.onsuccess = () => {
            const entry = read.result[0];
            if (storeName === 'workspaces') entry.work.customSystem = change.customSystem;
            else Object.assign(entry.current.context.settings.quality, change);
            entry.revision++;
            store.put(entry);
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { storeName, change },
  );
}

for (const width of [1440, 393]) {
  test(`새 기본 서사·기존 기본문 갱신·사용자 편집 보존·초기화 (${width})`, async ({ page }) => {
    const provided = await fs.readFile('src/engine/prompts/narrator_default_v2.txt', 'utf8');
    const legacy = await fs.readFile('src/engine/prompts/narrator_legacy_v2.txt', 'utf8');
    const plain = await fs.readFile('src/engine/prompts/narrator_plain_v2.txt', 'utf8');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const form = page.locator('.editor-form');
    const system = form.getByRole('textbox', { name: /^시스템 프롬프트/ });
    await expect(system).toHaveValue(provided.replace(/\r\n/g, '\n'));
    expect(await system.inputValue()).not.toMatch(/STYLE:|RATIO:|PACING:|LENGTH:|VIEWPOINT:/);
    await changeStored(page, 'workspaces', { customSystem: legacy });
    await page.reload();
    await expect(system).toHaveValue(provided.replace(/\r\n/g, '\n'));
    await changeStored(page, 'workspaces', { customSystem: plain });
    await page.reload();
    await expect(system).toHaveValue(provided.replace(/\r\n/g, '\n'));
    const custom = legacy + '\n내가 직접 추가한 연기 규칙';
    await changeStored(page, 'workspaces', { customSystem: custom });
    await page.reload();
    await expect(system).toHaveValue(custom.replace(/\r\n/g, '\n'));
    await form.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(system).toHaveValue(provided.replace(/\r\n/g, '\n'));
    await page.reload();
    await expect(system).toHaveValue(provided.replace(/\r\n/g, '\n'));
    await fs.mkdir('docs/screenshots/prompt-revision', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/prompt-revision/default-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('실제 전송 경로의 새 서사·언어 규칙·선택 품질 지침·캐시 경계', async ({ page }) => {
  const payloads: any[] = [];
  const model = {
    id: 'anthropic/prompt-test',
    name: '프롬프트 검증 모델',
    context_length: 200000,
    supported_parameters: ['structured_outputs'],
  };
  await page.route('https://openrouter.ai/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/chat/completions')) {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  kind: 'turn',
                  requestedCharacterIds: [],
                  body: '@아리아: 정원에서 기다리겠습니다.',
                  choices: ['정원을 살핀다'],
                  delta: {
                    numeric: [],
                    text: [],
                    choice: [],
                    inventory: [],
                    presence: [],
                    relationships: [],
                  },
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 30,
            prompt_tokens_details: { cached_tokens: 50 },
            cost: 0.0001,
          },
        },
      });
    } else
      await route.fulfill({
        json: {
          data: url.endsWith('/models')
            ? [model]
            : url.endsWith('/credits')
              ? { total_credits: 100, total_usage: 0 }
              : { label: 'test', limit_remaining: 100 },
        },
      });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-prompt-test');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('dialog').getByRole('button', { name: model.name, exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
  await changeStored(page, 'rooms', {
    style: '무협',
    ratio: '대사 우선',
    length: '짧음',
    viewpoint: '1인칭 관찰자',
    viewpointActorId: 'aria',
    viewpointTargetId: 'user',
  });
  await page.reload();
  await page.locator('.model-trigger:visible').click();
  await page.getByRole('dialog').getByRole('button', { name: model.name, exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('정원을 살펴본다');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  expect(payloads).toHaveLength(1);
  const request = payloads[0];
  const fixed = request.messages[0].content[0].text;
  expect(fixed).toContain('## Character Performance');
  expect(fixed).toContain('schema keys; these are not translation targets');
  expect(fixed).not.toContain('STYLE:');
  expect(request.messages[0].content[0].cache_control.type).toBe('ephemeral');
  expect(typeof request.messages.at(-1).content).toBe('string');
  const directives = JSON.parse(request.messages.at(-1).content).turnDirectives;
  expect(directives.outputLanguage).toBe('Korean');
  expect(directives.qualityInstructions.join('\n')).toContain('wuxia');
  expect(directives.qualityInstructions.join('\n')).toContain('85%');
  expect(directives.qualityInstructions.join('\n')).toContain('1,000');
  expect(directives.qualityInstructions.join('\n')).toContain(
    'observer ID "aria", observing target ID "user"',
  );
});
