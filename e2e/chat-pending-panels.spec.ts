import { test, expect, type Page, type Route } from '@playwright/test';

async function start(page: Page, width: number, visualNovel = false) {
  await page.setViewportSize({ width, height: 1000 });
  const pending: Route[] = [];
  await page.route('https://openrouter.ai/**', async (route) => {
    if (route.request().url().endsWith('/models'))
      return route.fulfill({
        json: {
          data: [
            {
              id: 'test/pending',
              name: '대기 검증 모델',
              context_length: 200000,
              supported_parameters: ['structured_outputs'],
            },
          ],
        },
      });
    if (route.request().url().endsWith('/chat/completions')) {
      pending.push(route);
      return;
    }
    return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-pending-test-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: /^대기 검증 모델/ }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.evaluate(
    (vn) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('rooms', 'readwrite'),
            store = tx.objectStore('rooms');
          const read = store.getAll();
          read.onsuccess = () => {
            const room = read.result.at(-1);
            room.work.statusPanels = [
              {
                id: 'record',
                name: '헌터 기록',
                statusIds: ['affinity'],
                template: '현재 수치 {{affinity}}',
              },
              {
                id: 'terminal',
                name: '활동 단말',
                statusIds: [],
                template: '',
                blocks: [
                  {
                    id: 'routine',
                    title: '일과',
                    description: '현재 수치 {{affinity}}',
                    columns: 1,
                    mode: 'all',
                    conditions: [],
                    buttons: [{ id: 'practice', label: '수련하기', actionId: 'practice' }],
                  },
                ],
              },
              { id: 'extra', name: '추가 기록', statusIds: [], template: '마지막 상태창' },
            ];
            room.work.actions = [
              {
                id: 'practice',
                name: '수련',
                trigger: 'button',
                buttonLocation: 'screen',
                mode: 'all',
                conditions: [],
                steps: [{ kind: 'add', target: 'affinity', value: '5' }],
              },
            ];
            room.work.openings[0].suggestions = [
              '현재 상황을 아주 자세히 살피고 동료에게 다음 행동을 차분히 물어본다.',
              '주변을 살핀다.',
              '동료에게 묻는다.',
            ];
            for (const checkpoint of [room.initial, room.current]) {
              checkpoint.context.settings.rerollPrompt = false;
              checkpoint.context.settings.autoSummary = false;
              checkpoint.context.settings.uiType = vn ? 'visual-novel' : 'novel';
            }
            room.revision++;
            store.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    visualNovel,
  );
  await page.reload();
  const reply = async (index: number, error = false) => {
    await expect.poll(() => pending.length).toBeGreaterThan(index);
    await pending[index]
      .fulfill(
        error
          ? { status: 400, json: { error: { message: '잘못된 요청 테스트' } } }
          : {
              json: {
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: JSON.stringify({
                        kind: 'turn',
                        requestedCharacterIds: [],
                        body: `검증 응답 ${index + 1}`,
                        choices: [],
                        delta: {
                          numeric: [{ fieldId: 'affinity', amount: 1 }],
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
              },
            },
      )
      .catch(() => {});
  };
  return { pending, reply };
}

async function storedTurns(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const db = request.result,
            read = db.transaction('rooms').objectStore('rooms').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result.at(-1).timeline.filter((e: any) => e.kind === 'turn'));
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

for (const width of [1440, 393]) {
  test(`즉시 입력·대기 문구·리롤 교체와 복구·모든 상태창 ${width}`, async ({ page }) => {
    const { pending, reply } = await start(page, width);
    const scroll = page.locator('.chat-scroll');
    const field = page.getByRole('textbox', { name: '메시지', exact: true });
    await expect(page.locator('.suggestions')).toHaveAttribute('data-layout', 'split');
    const buttons = await page.locator('.suggestions button').all();
    const positions = await Promise.all(
      buttons.map(async (button) => (await button.boundingBox())!),
    );
    expect(positions[1].y).toBeGreaterThan(positions[0].y);
    expect(positions[1].y).toBeCloseTo(positions[2].y, 0);
    await page.screenshot({ path: `docs/screenshots/chat-choice-layout-${width}.png` });
    await field.fill('전송 직후 보여야 할 질문');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.pending-turn .user-section')).toContainText(
      '전송 직후 보여야 할 질문',
    );
    await expect(scroll.locator('.generation-status')).toHaveCount(1);
    await expect.poll(() => pending.length).toBe(1);
    const initial = await scroll.locator('.generation-status').textContent();
    await page.screenshot({ path: `docs/screenshots/chat-generating-${width}.png` });
    await expect
      .poll(() => scroll.locator('.generation-status').textContent(), { timeout: 6000 })
      .not.toBe(initial);
    expect(await storedTurns(page)).toHaveLength(0);
    await reply(0);
    await expect(scroll).toContainText('검증 응답 1');
    await expect(page.locator('.pending-turn')).toHaveCount(0);
    await expect(page.locator('.conversation-turn')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
    const assistant = page.locator('.conversation-turn .assistant-section').last();
    const group = assistant.locator('.status-panels');
    await expect(group).toHaveCount(1);
    await expect(group.locator(':scope > summary')).toHaveText('헌터 기록 / 활동 단말 / 추가 기록');
    const sections = group.locator(':scope > .status-content > .status-panel-section');
    expect(
      await sections.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
    ).toEqual(['헌터 기록', '활동 단말', '추가 기록']);
    await expect(group.locator('details')).toHaveCount(0);
    await group.locator(':scope > summary').click();
    await expect(group.getByRole('button', { name: '수련하기', exact: true })).toBeHidden();
    await expect(sections.first()).toBeHidden();
    await expect(sections.last()).toBeHidden();
    await field.fill('접은 동안 입력 편집');
    await expect(group.locator(':scope > .status-content')).toBeHidden();
    await expect(group.locator(':scope > summary')).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/grouped-status-collapsed-${width}.png` });
    await group.locator(':scope > summary').click();
    await expect(group.getByRole('button', { name: '수련하기', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '리롤', exact: true }).click();
    await expect(scroll.getByText('검증 응답 1', { exact: true })).toHaveCount(0);
    await expect(scroll.locator('.user-section')).toContainText('전송 직후 보여야 할 질문');
    await expect(scroll.locator('.generation-status')).toHaveCount(1);
    expect((await storedTurns(page))[0].candidates).toHaveLength(1);
    await reply(1);
    await expect(scroll).toContainText('검증 응답 2');
    await expect(scroll.locator('.candidate-pager')).toContainText('2 / 2');
    await page.getByRole('button', { name: '리롤', exact: true }).click();
    await expect(scroll.getByText('검증 응답 2', { exact: true })).toHaveCount(0);
    await reply(2, true);
    await expect(scroll).toContainText('검증 응답 2');
    expect((await storedTurns(page))[0].candidates).toHaveLength(2);
    await field.fill('실패하면 복원할 질문');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.pending-turn')).toContainText('실패하면 복원할 질문');
    await reply(3, true);
    await expect(page.locator('.pending-turn')).toHaveCount(0);
    await expect(field).toHaveValue('실패하면 복원할 질문');
    expect(await storedTurns(page)).toHaveLength(1);
    await field.fill('취소할 질문');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect.poll(() => pending.length).toBe(5);
    await page.getByRole('button', { name: '생성 중단', exact: true }).click();
    await expect(page.locator('.pending-turn')).toHaveCount(0);
    await expect(field).toHaveValue('취소할 질문');
    await reply(4);
    expect(await storedTurns(page)).toHaveLength(1);
    const before = await assistant.locator('.status-content').first().textContent();
    await assistant.getByRole('button', { name: '수련하기', exact: true }).click();
    await expect
      .poll(() => assistant.locator('.status-content').first().textContent())
      .not.toBe(before);
    expect(pending).toHaveLength(5);
    await field.fill('두 번째 정상 질문');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await reply(5);
    await expect(scroll).toContainText('검증 응답 6');
    await expect(
      page
        .locator('.conversation-turn')
        .first()
        .getByRole('button', { name: '수련하기', exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .locator('.conversation-turn')
        .last()
        .getByRole('button', { name: '수련하기', exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `docs/screenshots/chat-pending-panels-${width}.png` });
  });

  test(`비주얼 노벨 상태창 순서와 현재값·대기 표시 ${width}`, async ({ page }) => {
    const { pending, reply } = await start(page, width, true);
    await page.getByRole('button', { name: '상태창 보기', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '상태창', exact: true });
    const group = modal.locator('.status-panels');
    await expect(group).toHaveCount(1);
    await expect(group.locator(':scope > summary')).toHaveText('헌터 기록 / 활동 단말 / 추가 기록');
    expect(
      await group
        .locator('.status-panel-section')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))),
    ).toEqual(['헌터 기록', '활동 단말', '추가 기록']);
    await group.locator(':scope > summary').click();
    await expect(modal.getByRole('button', { name: '수련하기', exact: true })).toBeHidden();
    await expect(group.locator(':scope > .status-content')).toBeHidden();
    await group.locator(':scope > summary').click();
    const before = await modal.locator('.status-content').first().textContent();
    await modal.getByRole('button', { name: '수련하기', exact: true }).click();
    await expect
      .poll(() => modal.locator('.status-content').first().textContent())
      .not.toBe(before);
    await modal.getByRole('button', { name: '상태창 닫기', exact: true }).click();
    await page
      .getByRole('textbox', { name: '메시지', exact: true })
      .fill('노벨에서 바로 보일 입력');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.visual-novel-copy')).toContainText('노벨에서 바로 보일 입력');
    const waiting = page.locator('.visual-novel-waiting');
    await expect.poll(() => pending.length).toBe(1);
    const initial = await waiting.textContent();
    await expect.poll(() => waiting.textContent(), { timeout: 6000 }).not.toBe(initial);
    await reply(0);
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
    await expect(page.locator('.visual-novel-copy')).toContainText('검증 응답 1');
    await page.getByRole('button', { name: '리롤', exact: true }).click();
    await expect(page.locator('.visual-novel-copy')).toContainText('노벨에서 바로 보일 입력');
    await expect(page.locator('.visual-novel-copy')).not.toContainText('검증 응답 1');
    await reply(1);
    await expect(page.locator('.visual-novel-copy')).toContainText('검증 응답 2');
    await expect(page.locator('.visual-novel .candidate-pager')).toContainText('2 / 2');
    await page.getByRole('button', { name: '리롤', exact: true }).click();
    await expect.poll(() => pending.length).toBe(3);
    await page.getByRole('button', { name: '생성 중단', exact: true }).click();
    await expect(page.locator('.visual-novel-copy')).toContainText('검증 응답 2');
    await reply(2);
  });
}
