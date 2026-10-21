import { test, expect, type Page, type Route } from '@playwright/test';
import { creatorSection } from './helpers/creator';

async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('rooms').objectStore('rooms').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result.at(-1));
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

async function chapters(page: Page, width: number) {
  if (width === 393) {
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('button', { name: '챕터', exact: true }).click();
  } else await page.getByRole('button', { name: '시나리오', exact: true }).click();
}

for (const width of [1440, 393]) {
  test(`챕터 제작 AI 기본값·직접 작성 전환·초안 보존 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await creatorSection(page, width, '시나리오');
    await page
      .getByRole('button', { name: /다음 챕터 추가/ })
      .first()
      .click();
    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '챕터 설정', exact: true }) });
    await expect(dialog.getByRole('radio', { name: 'AI 출력', exact: true })).toBeChecked();
    const prologue = dialog.getByRole('group', { name: '프롤로그', exact: true });
    await expect(prologue.getByRole('textbox')).toHaveCount(0);
    await dialog.getByRole('radio', { name: '직접 작성', exact: true }).check();
    await prologue.getByRole('textbox').fill('직접 작성한 도입 장면');
    await dialog.getByRole('radio', { name: 'AI 출력', exact: true }).check();
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await creatorSection(page, width, '시나리오');
    await page.getByRole('button', { name: /^챕터 1 조건/ }).click();
    await expect(dialog.getByRole('radio', { name: 'AI 출력', exact: true })).toBeChecked();
    await dialog.getByRole('radio', { name: '직접 작성', exact: true }).check();
    await expect(prologue.getByRole('textbox')).toHaveValue('직접 작성한 도입 장면');
    await dialog.getByRole('button', { name: '엔딩', exact: true }).click();
    const endingScene = dialog.getByRole('group', { name: '엔딩 장면', exact: true });
    await expect(endingScene.getByRole('radio', { name: '직접 작성', exact: true })).toBeChecked();
    await expect(endingScene.getByRole('textbox')).toHaveValue('직접 작성한 도입 장면');
    await endingScene.getByRole('radio', { name: 'AI 출력', exact: true }).check();
    await expect(endingScene.getByRole('textbox')).toHaveCount(0);
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await creatorSection(page, width, '시나리오');
    await page.getByRole('button', { name: '챕터 1 엔딩', exact: true }).click();
    await expect(endingScene.getByRole('radio', { name: 'AI 출력', exact: true })).toBeChecked();
    await page.screenshot({ path: `docs/screenshots/chapter-prologue-editor-${width}.png` });
  });

  test(`AI ${width === 393 ? '엔딩' : '프롤로그'} 원자적 이동·실패/취소·수정·리롤·후보·삭제 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests: Route[] = [];
    await page.route('https://openrouter.ai/**', (route) => {
      if (route.request().url().endsWith('/models'))
        return route.fulfill({
          json: {
            data: [
              {
                id: 'test/chapter',
                name: '챕터 검증 모델',
                context_length: 200000,
                supported_parameters: ['structured_outputs'],
              },
            ],
          },
        });
      if (route.request().url().endsWith('/chat/completions')) {
        requests.push(route);
        return;
      }
      return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
    });
    const reply = async (index: number, body: string, amount = 0, error = false) => {
      await expect.poll(() => requests.length).toBeGreaterThan(index);
      await requests[index]
        .fulfill(
          error
            ? { status: 400, json: { error: { message: '프롤로그 오류 검증' } } }
            : {
                json: {
                  choices: [
                    {
                      finish_reason: 'stop',
                      message: {
                        content: JSON.stringify({
                          kind: 'turn',
                          requestedCharacterIds: [],
                          body,
                          choices: ['문 안을 살핀다.', '약속을 확인한다.', '잠시 기다린다.'],
                          delta: {
                            numeric: amount ? [{ fieldId: 'affinity', amount }] : [],
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
                  usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.002 },
                },
              },
        )
        .catch(() => {});
    };
    await page.goto('/');
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-chapter-key');
    await page.getByRole('button', { name: '키 확인', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
    await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
    await page.getByRole('button', { name: /^챕터 검증 모델/ }).click();
    await page.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.evaluate(
      (vn) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction('rooms', 'readwrite'),
              store = tx.objectStore('rooms'),
              read = store.getAll();
            read.onsuccess = () => {
              const room = read.result.at(-1);
              room.work.chapters = [
                {
                  ...room.work.chapters[0],
                  conditions: [],
                  prologueMode: 'ai',
                  type: vn ? 'ending' : 'chapter',
                  afterstory: !vn,
                  prologue: '이 고정 장면은 AI에 전달하지 않는다.',
                  prompt: '방금 맺은 약속을 이어 지하 서고로 들어간다.',
                },
                {
                  ...room.work.chapters[0],
                  id: 'manual',
                  name: '직접 작성 챕터',
                  conditions: [],
                  prologueMode: 'written',
                  prologue: '고정 프롤로그 장면입니다.',
                },
              ];
              room.current.context.settings.autoSummary = false;
              room.current.context.settings.rerollPrompt = false;
              room.current.context.settings.uiType = vn ? 'visual-novel' : 'novel';
              room.revision++;
              store.put(room);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      width === 393,
    );
    await page.reload();
    const field = page.getByRole('textbox', { name: '메시지', exact: true });
    await field.fill('아까 한 약속을 기억하면서 문을 열게.');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await reply(0, '아리아와 약속을 나눈 채 문 앞에 섰다.');
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
    await field.fill('작성하던 초안');
    const before = await stored(page);
    await chapters(page, width);
    const move = page
      .locator('.chapter-list > section')
      .filter({ hasText: '서고의 문' })
      .getByRole('button', { name: '챕터 이동', exact: true });
    await move.click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.getByRole('button', { name: '챕터 생성 중단', exact: true })).toBeVisible();
    expect((await stored(page)).current).toEqual(before.current);
    expect((await stored(page)).timeline).toEqual(before.timeline);
    await reply(1, '', 0, true);
    await expect(move).toBeEnabled();
    expect((await stored(page)).current).toEqual(before.current);
    await move.click();
    await expect.poll(() => requests.length).toBe(3);
    await page.getByRole('button', { name: '챕터 생성 중단', exact: true }).click();
    await expect(move).toBeEnabled();
    expect((await stored(page)).timeline).toEqual(before.timeline);
    await reply(2, '취소된 출력');
    await move.click();
    await expect.poll(() => requests.length).toBe(4);
    const payload = requests[3].request().postDataJSON();
    expect(JSON.stringify(payload.messages)).toContain('아리아와 약속을 나눈 채 문 앞에 섰다.');
    expect(JSON.stringify(payload.messages)).toContain(
      '방금 맺은 약속을 이어 지하 서고로 들어간다.',
    );
    expect(JSON.stringify(payload.messages)).not.toContain('이 고정 장면은 AI에 전달하지 않는다.');
    await reply(3, '아까의 약속을 떠올리며 서고의 문턱을 함께 넘는다.', 2);
    const text =
      width === 393
        ? page.locator('.visual-novel-copy')
        : page.locator('.chapter-scene .story-body');
    await expect(text).toContainText('아까의 약속을 떠올리며');
    if (width === 393) {
      await expect(field).toHaveValue('');
      await expect(field).toBeDisabled();
    } else await expect(field).toHaveValue('작성하던 초안');
    let saved = await stored(page);
    expect(saved.current.runtime.nodeId).toBe('archive');
    expect(saved.current.runtime.status.affinity).toBe(12);
    expect(saved.current.runtime.ending).toEqual(
      width === 393 ? { id: 'archive', allowAfterstory: false } : null,
    );
    expect(saved.timeline).toHaveLength(2);
    expect(saved.timeline[1]).toMatchObject({ kind: 'turn', chapterId: 'archive', input: '' });
    expect(saved.timeline[1].candidates).toHaveLength(1);
    await expect(page.locator('.chapter-scene .user-section')).toHaveCount(0);
    await page.getByRole('button', { name: '대사 수정', exact: true }).last().click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox').fill('직접 수정한 연결 장면');
    await modal.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(text).toContainText('직접 수정한 연결 장면');
    await page.getByRole('button', { name: '리롤', exact: true }).click();
    await expect.poll(() => requests.length).toBe(5);
    if (width === 393) await expect(text).not.toContainText('직접 수정한 연결 장면');
    else await expect(text).toHaveCount(0);
    expect(JSON.stringify(requests[4].request().postDataJSON().messages)).not.toContain(
      '직접 수정한 연결 장면',
    );
    const tail = JSON.parse(
      requests[4].request().postDataJSON().messages.at(-1).content.split('\n\n').at(-1),
    );
    expect(tail.runtimeContext.currentState.status.affinity).toBe(10);
    expect(tail.runtimeContext.chapter.id).toBe('archive');
    await reply(4, '다른 방식으로 약속을 이어 서고에 들어선다.', 5);
    await expect(text).toContainText('다른 방식으로 약속을 이어');
    await expect(page.locator('.candidate-pager')).toContainText('2 / 2');
    saved = await stored(page);
    expect(saved.timeline).toHaveLength(2);
    expect(saved.timeline[1].candidates).toHaveLength(2);
    expect(saved.current.runtime.status.affinity).toBe(15);
    expect(saved.current.runtime.visited.filter((id: string) => id === 'archive')).toHaveLength(1);
    await page.getByRole('button', { name: '이전 응답', exact: true }).click();
    await expect(text).toContainText('직접 수정한 연결 장면');
    expect((await stored(page)).current.runtime.status.affinity).toBe(12);
    await page.getByRole('button', { name: '마지막 대화 삭제', exact: true }).click();
    await page.getByRole('button', { name: '프롤로그 삭제 · 챕터 이동 취소', exact: true }).click();
    await expect
      .poll(async () => (await stored(page)).current.runtime.nodeId)
      .toBe(before.current.runtime.nodeId);
    saved = await stored(page);
    expect(saved.current.runtime.status.affinity).toBe(10);
    expect(saved.timeline).toHaveLength(1);
    expect(saved.current.runtime.visited).not.toContain('archive');
    await expect(field).toHaveValue('');
    await chapters(page, width);
    await page
      .locator('.chapter-list > section')
      .filter({ hasText: '직접 작성 챕터' })
      .getByRole('button', { name: '챕터 이동', exact: true })
      .click();
    await expect(
      width === 393
        ? page.locator('.visual-novel-copy')
        : page.locator('.chapter-scene .story-body'),
    ).toContainText('고정 프롤로그 장면입니다.');
    expect(requests).toHaveLength(5);
    await page.screenshot({ path: `docs/screenshots/chapter-prologue-play-${width}.png` });
  });
}
