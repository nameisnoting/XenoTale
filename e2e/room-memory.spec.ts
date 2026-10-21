import { jsonPromptBlock } from './helpers/prompt';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
async function rooms(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('xenotale-v1');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<any[]>((resolve) => {
      const r = db.transaction('rooms').objectStore('rooms').getAll();
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
    });
  });
}
async function open(page: Page, width: number) {
  if (width === 393) {
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('button', { name: '기억 관리', exact: true }).click();
  } else await page.getByRole('button', { name: '기억관리', exact: true }).click();
}
async function close(page: Page, width: number) {
  if (width === 393)
    await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
}
async function send(page: Page, count: number) {
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(count);
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeVisible();
}
async function setupSummary(page: Page) {
  const requests: any[] = [];
  await page.route('https://openrouter.ai/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/models'))
      return route.fulfill({
        json: {
          data: [
            {
              id: 'test/summary',
              name: '실제 요약 검증 모델',
              context_length: 200000,
              supported_parameters: ['response_format'],
            },
          ],
        },
      });
    if (url.endsWith('/chat/completions')) {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  content: '안내인과 정원에서 나눈 대화와 서고에 대한 약속을 기억한다.',
                }),
              },
            },
          ],
        },
      });
    }
    return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-summary-only');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
  await page.getByRole('group', { name: '요약용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: /^실제 요약 검증 모델/ }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  return requests;
}
for (const width of [1440, 393])
  test(`요약 모델 미지정 안내·예시 기억 제외·원래 10턴으로 복구 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await setupSummary(page);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('profiles', 'readwrite'),
              store = tx.objectStore('profiles'),
              read = store.get('profile');
            read.onsuccess = () => {
              const profile = read.result;
              profile.summaryModel = 'demo';
              store.put(profile);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    for (let i = 1; i <= 10; i++) await send(page, i);
    expect(requests).toHaveLength(0);
    expect((await rooms(page))[0].current.context.memories).toEqual([]);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('rooms', 'readwrite'),
              store = tx.objectStore('rooms'),
              read = store.getAll();
            read.onsuccess = () => {
              const room = read.result[0];
              room.current.context.memories = [
                {
                  id: 'legacy-placeholder',
                  body: '여기에 단기기억 요약이 나옵니다.',
                  kind: 'short',
                  manual: false,
                  active: true,
                  createdAt: 1,
                  sources: room.timeline
                    .filter((event: any) => event.kind === 'turn')
                    .map((event: any) => `${event.id}:${event.selectedId}`),
                },
              ];
              store.put(room);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await open(page, width);
    await expect(
      page.getByText('현재 요약용 LLM이 지정되지 않았습니다.', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.memory-card')).toHaveCount(0);
    await expect(page.locator('.memory-countdown')).toHaveText('다음 요약까지 0턴');
    await page.getByRole('button', { name: '요약용 LLM 선택', exact: true }).click();
    await page.getByRole('button', { name: /^실제 요약 검증 모델/ }).click();
    await page.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: '지금 요약', exact: true }).click();
    await expect(page.locator('.memory-card summary')).toContainText('1 ~ 10턴');
    expect(requests).toHaveLength(1);
    expect(
      jsonPromptBlock(requests[0].messages[1].content).entries.filter(
        (entry: any) => entry.kind === 'turn',
      ),
    ).toHaveLength(10);
    const saved = (await rooms(page))[0];
    expect(saved.current.context.memories).toHaveLength(1);
    expect(saved.current.context.memories[0].body).toBe(
      '안내인과 정원에서 나눈 대화와 서고에 대한 약속을 기억한다.',
    );
    expect(saved.current.context.memories[0].id).not.toBe('legacy-placeholder');
    await page.reload();
    if (width !== 393) await open(page, width);
    await expect(page.locator('.memory-card summary')).toContainText('1 ~ 10턴');
    await expect(page.getByText(/내용이 없는 예시 요약은 기억에서 제외했습니다/)).toHaveCount(0);
  });
for (const width of [1440, 393])
  test(`기억 카드·설정 초기화·단기 기록 보존과 장기 턴 표시 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setupSummary(page);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    await open(page, width);
    await expect(page.getByRole('button', { name: '직접 기억 추가', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: '장기요약', exact: true }).click();
    await expect(page.locator('.memory-countdown')).toHaveText('다음 요약까지 100턴');
    expect(
      await page.locator('.memory-countdown em').evaluate((e) => getComputedStyle(e).color),
    ).toBe('rgb(198, 72, 80)');
    await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
    expect(
      await page
        .getByRole('group', { name: '요약용 LLM', exact: true })
        .locator('.field-label')
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('12px');
    expect(
      await page
        .locator('.memory-settings > .setting-card')
        .first()
        .evaluate((e) => getComputedStyle(e).padding),
    ).toBe('16px');
    const settingGaps = await page
      .locator('.memory-settings > .setting-card')
      .evaluateAll((cards) => {
        return cards.map((card, i) => ({
          margin: getComputedStyle(card).margin,
          gap: i
            ? card.getBoundingClientRect().top - cards[i - 1].getBoundingClientRect().bottom
            : 16,
        }));
      });
    for (const spacing of settingGaps) {
      expect(spacing.margin).toBe('0px');
      expect(spacing.gap).toBe(16);
    }
    for (const [index, label] of ['단기요약 프롬프트', '장기요약 프롬프트'].entries()) {
      const input = page.getByRole('textbox', { name: label, exact: true });
      const original = await input.inputValue();
      expect(original).toContain('"title"');
      expect(original).toContain('"content"');
      await input.fill('사용자 요약 규칙');
      await page
        .locator('.memory-prompt-card')
        .nth(index)
        .getByRole('button', { name: '초기화', exact: true })
        .click();
      await expect(input).toHaveValue(original);
      await input.fill('');
      await expect(input).toHaveValue('');
      await page
        .locator('.memory-prompt-card')
        .nth(index)
        .getByRole('button', { name: '초기화', exact: true })
        .click();
      await expect(input).toHaveValue(original);
    }
    await page.getByRole('button', { name: '요약 간격 줄이기', exact: true }).click();
    await close(page, width);
    for (let i = 1; i <= 5; i++) await send(page, i);
    if (width === 393) await open(page, width);
    await page.getByRole('tab', { name: '단기요약', exact: true }).click();
    const card = page.locator('.memory-card').first();
    await expect(card.locator('summary')).toContainText('1 ~ 5턴');
    expect(await card.evaluate((e) => getComputedStyle(e).padding)).toBe('16px');
    expect(await card.locator('summary').evaluate((e) => getComputedStyle(e).fontSize)).toBe(
      '16px',
    );
    expect(
      await card.locator('.disclosure-chevron').evaluate((e) => e.getBoundingClientRect().width),
    ).toBe(16);
    await card.locator('summary').click();
    expect(
      await card
        .getByRole('textbox', { name: '요약내용', exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('14px');
    expect(
      await card
        .getByRole('group', { name: '요약내용', exact: true })
        .locator('.field-label')
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('14px');
    await card.getByRole('textbox', { name: '제목', exact: true }).fill('수정한 기억 제목');
    const body = card.getByRole('textbox', { name: '요약내용', exact: true });
    await body.fill('');
    await body.pressSequentially('직접 수정한 요약 내용');
    await expect
      .poll(async () => (await rooms(page))[0].current.context.memories[0].body)
      .toBe('직접 수정한 요약 내용');
    await fs.mkdir('docs/screenshots/room-memory', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/room-memory/short-${width}.png` });
    await close(page, width);
    for (let i = 6; i <= 10; i++) await send(page, i);
    if (width === 393) await open(page, width);
    await page.getByRole('tab', { name: '장기요약', exact: true }).click();
    await expect(page.locator('.memory-countdown')).toHaveText('다음 요약까지 40턴');
    await page.getByRole('button', { name: '지금 단기기억 전체 요약', exact: true }).click();
    await expect(page.locator('.memory-card summary')).toContainText('1 ~ 10턴');
    await expect
      .poll(
        async () =>
          (await rooms(page))[0].current.context.memories.filter((m: any) => m.active === false)
            .length,
      )
      .toBe(2);
    await page.locator('.memory-card summary').click();
    await expect(page.getByRole('textbox', { name: '요약내용', exact: true })).toContainText(
      '안내인과 정원에서 나눈 대화와 서고에 대한 약속을 기억한다.',
    );
    await page.screenshot({ path: `docs/screenshots/room-memory/long-${width}.png` });
    await page.getByRole('tab', { name: '단기요약', exact: true }).click();
    await expect(page.locator('.memory-card')).toHaveCount(2);
    await expect(page.getByText('비활성', { exact: true })).toHaveCount(2);
    await page.locator('.memory-card').last().locator('summary').click();
    await page
      .locator('.memory-card')
      .last()
      .getByRole('textbox', { name: '요약내용', exact: true })
      .fill('비활성 기록도 수정 가능');
    await expect
      .poll(async () => (await rooms(page))[0].current.context.memories[0].body)
      .toBe('비활성 기록도 수정 가능');
    await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
    await page.locator('.chat-workspace-panel, .mobile-page-body').evaluateAll((elements) => {
      for (const e of elements) e.scrollTop = 0;
    });
    await page.screenshot({ path: `docs/screenshots/room-memory/settings-${width}.png` });
  });

test('AI 제목 JSON·잘못된 JSON 대체 제목·장기요약만 대화 프롬프트로 전달', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const model = {
    id: 'test/summary',
    name: '요약 검증 모델',
    context_length: 200000,
    supported_parameters: ['response_format', 'structured_outputs'],
  };
  let summaries = 0;
  let chatPayload: any;
  const summaryPayloads: any[] = [];
  await page.route('https://openrouter.ai/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/models')) return route.fulfill({ json: { data: [model] } });
    if (url.endsWith('/key')) return route.fulfill({ json: { data: { limit_remaining: 100 } } });
    if (url.endsWith('/credits'))
      return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
    const payload = route.request().postDataJSON();
    const input = jsonPromptBlock(payload.messages[1].content, 0);
    let content: string;
    if (input.entries) {
      summaryPayloads.push(payload);
      summaries++;
      content =
        summaries === 1
          ? '{"title":"AI가 정한 첫 제목","content":"첫 요약의 내용"}'
          : summaries === 2
            ? 'JSON 파싱이 실패해도 보존할 요약 내용'
            : '{"title":"AI 장기 제목","content":"두 단기요약을 통합한 장기 내용"}';
    } else {
      chatPayload = payload;
      content = JSON.stringify({
        kind: 'turn',
        requestedCharacterIds: [],
        body: '요약을 기억한 응답',
        choices: [],
        delta: {
          numeric: [],
          text: [],
          choice: [],
          inventory: [],
          presence: [],
          relationships: [],
        },
      });
    }
    return route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content } }] } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-memory-test');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  await page.getByRole('group', { name: '요약용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: '요약 검증 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await open(page, 1440);
  await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
  await page.getByRole('switch', { name: '자동 요약', exact: true }).click();
  await page
    .getByRole('textbox', { name: '단기요약 프롬프트', exact: true })
    .fill('사용자가 작성한 전체 요약 규칙');
  await send(page, 1);
  await page.getByRole('tab', { name: '단기요약', exact: true }).click();
  await page.getByRole('button', { name: '지금 요약', exact: true }).click();
  await expect(page.locator('.memory-card summary')).toContainText('AI가 정한 첫 제목');
  expect(summaryPayloads[0].messages[0].content).toBe('사용자가 작성한 전체 요약 규칙');
  await send(page, 2);
  await page.getByRole('button', { name: '지금 요약', exact: true }).click();
  await expect(page.locator('.memory-card').first().locator('summary')).toContainText('2턴');
  await page.locator('.memory-card').first().locator('summary').click();
  await expect(page.getByRole('textbox', { name: '요약내용', exact: true })).toHaveValue(
    'JSON 파싱이 실패해도 보존할 요약 내용',
  );
  await page.getByRole('tab', { name: '장기요약', exact: true }).click();
  await page.getByRole('button', { name: '지금 단기기억 전체 요약', exact: true }).click();
  await expect(page.locator('.memory-card summary')).toContainText('AI 장기 제목');
  await page.locator('.model-trigger').click();
  await page.getByRole('button', { name: '요약 검증 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await send(page, 3);
  expect(jsonPromptBlock(chatPayload.messages[1].content, 0).verifiedMemory).toEqual([
    { title: 'AI 장기 제목', content: '두 단기요약을 통합한 장기 내용' },
  ]);
});
