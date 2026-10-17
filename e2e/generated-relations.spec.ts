import { readDownloadedJson } from './read-file';
import { test, expect, type Page } from '@playwright/test';

async function loadModel(page: Page) {
  await page.locator('.model-trigger').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '관계 검증 모델', exact: false })
    .click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
}

async function rooms(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('rooms').objectStore('rooms').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
}

for (const width of [1440, 393]) {
  test(`AI creates room-local arrows, updates saved IDs, reloads and restores backup (${width})`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests: any[] = [];
    const model = {
      id: 'test/relations',
      name: '관계 검증 모델',
      context_length: 200000,
      supported_parameters: ['structured_outputs'],
    };
    await page.route('https://openrouter.ai/**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/chat/completions')) {
        const payload = route.request().postDataJSON();
        requests.push(payload);
        const context = JSON.parse(payload.messages.at(-1).content).runtimeContext;
        const existing = context.relationships.find(
          (r: any) => r.from === 'user' && r.to === 'sera',
        );
        await route.fulfill({
          json: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    kind: 'turn',
                    requestedCharacterIds: [],
                    body: '*세라와 함께할 약속을 한다.*',
                    choices: [],
                    delta: {
                      numeric: [],
                      text: [],
                      choice: [],
                      inventory: [],
                      presence: [],
                      relationships: existing
                        ? [{ relationId: existing.id, label: '절친', innerLabel: null }]
                        : [{ from: 'user', to: 'sera', label: '동료', innerLabel: '신뢰' }],
                    },
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 30, cost: 0.0001 },
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
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-relations-test');
    await page.getByRole('button', { name: '키 확인', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
    await page.getByRole('button', { name: '관계 검증 모델', exact: false }).click();
    await page.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    const roomUrl = page.url();
    // Fresh test database only: exercise inner labels and a map that omits Sera.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('rooms', 'readwrite');
            const store = transaction.objectStore('rooms');
            const read = store.getAll();
            read.onsuccess = () => {
              const room = read.result[0];
              room.work.relationSplit = true;
              room.work.relationNodeIds = ['aria', 'user'];
              room.revision++;
              store.put(room);
            };
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
    );
    await page.reload();
    await loadModel(page);
    const original = (await rooms(page))[0].work;
    await page.getByRole('textbox', { name: '메시지', exact: true }).fill('세라와 동료가 된다');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect
      .poll(async () => (await rooms(page))[0].current.runtime.generatedRelations?.length)
      .toBe(1);
    const saved = (await rooms(page))[0];
    const edgeId = saved.current.runtime.generatedRelations[0].id;
    expect(saved.work).toEqual(original);
    expect(saved.initial.runtime.generatedRelations).toBeUndefined();
    await page.goto(`${roomUrl}/panel/relations`);
    await page.reload();
    const canvas = page.locator('.relationship-canvas').first();
    await expect(canvas.locator('.relation-edge')).toHaveCount(original.relations.length + 1);
    await expect(canvas.locator(`[data-relation-id="${edgeId}"]`)).toBeVisible();
    await canvas.getByRole('button', { name: '전체 관계', exact: true }).click();
    await expect(canvas.locator(`[data-relation-id="${edgeId}"]`)).toContainText('동료');
    await canvas.getByRole('button', { name: /내면으로/ }).click();
    await expect(canvas.locator(`[data-relation-id="${edgeId}"]`)).toContainText('신뢰');
    if (width >= 1200) {
      await canvas.getByRole('button', { name: '관계도 확대', exact: true }).click();
      await expect(
        page.getByRole('dialog').locator(`[data-relation-id="${edgeId}"]`),
      ).toContainText('신뢰');
    }
    await page.screenshot({ path: `test-results/generated-relations-${width}.png` });
    await page.goto(roomUrl);
    await loadModel(page);
    await page.getByRole('textbox', { name: '메시지', exact: true }).fill('더 가까워진다');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect
      .poll(async () => (await rooms(page))[0].current.runtime.relationships[edgeId])
      .toBe('절친');
    expect((await rooms(page))[0].current.runtime.generatedRelations).toHaveLength(1);
    expect(
      JSON.parse(requests[1].messages.at(-1).content).runtimeContext.relationships,
    ).toContainEqual(
      expect.objectContaining({ id: edgeId, from: 'user', to: 'sera', label: '동료' }),
    );
    expect(
      requests[0].response_format.json_schema.schema.properties.delta.properties.relationships.items
        .anyOf,
    ).toHaveLength(2);
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    const otherUrl = page.url();
    expect(otherUrl).not.toBe(roomUrl);
    await page.goto(`${otherUrl}/panel/relations`);
    await expect(
      page.locator('.relationship-canvas').first().locator('.relation-edge'),
    ).toHaveCount(original.relations.length);
    const allRooms = await rooms(page);
    expect(allRooms.filter((r) => r.current.runtime.generatedRelations?.length)).toHaveLength(1);
    await page.goto('/#/');
    await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
    const backupPath = (await (await download).path())!;
    const backup = await readDownloadedJson(backupPath);
    expect(
      backup.rooms.find((r: any) => r.id === saved.id).current.runtime.generatedRelations[0].id,
    ).toBe(edgeId);
    const restored = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      await restored.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
      const target = await restored.newPage();
      await target.goto('/');
      await target.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
      await target.locator('input[type=file]').setInputFiles(backupPath);
      await target.getByRole('button', { name: '가져오기', exact: true }).click();
      await expect(target.getByRole('dialog')).toHaveCount(0);
      await expect
        .poll(async () =>
          (await rooms(target)).some((r) => r.current.runtime.relationships[edgeId] === '절친'),
        )
        .toBe(true);
      const restoredRoom = (await rooms(target)).find(
        (r) => r.current.runtime.relationships[edgeId] === '절친',
      );
      await target.goto(`/#/chat/${restoredRoom.id}/panel/relations`);
      await expect(
        target.locator('.relationship-canvas').first().locator(`[data-relation-id="${edgeId}"]`),
      ).toBeVisible();
    } finally {
      await restored.close();
    }
    expect(errors).toEqual([]);
  });
}
