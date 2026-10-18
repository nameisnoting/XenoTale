import { readDownloadedJson } from './read-file';
import { test, expect, type Page } from '@playwright/test';

const model = {
  id: 'test/creator',
  name: '제작 테스트 모델',
  context_length: 200000,
  supported_parameters: ['response_format', 'structured_outputs'],
  top_provider: { max_completion_tokens: 16000 },
};
async function start(page: Page, mobile = false) {
  await page.setViewportSize({ width: mobile ? 393 : 1440, height: 852 });
  await page
    .context()
    .route('https://openrouter.ai/api/v1/models', (r) => r.fulfill({ json: { data: [model] } }));
  await page
    .context()
    .route('https://openrouter.ai/api/v1/key', (r) =>
      r.fulfill({ json: { data: { label: 'test' } } }),
    );
  await page
    .context()
    .route('https://openrouter.ai/api/v1/credits', (r) =>
      r.fulfill({ json: { data: { total_credits: 10, total_usage: 0 } } }),
    );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-creator-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: '제작 테스트 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료' }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  if (mobile) await page.getByRole('button', { name: '만들기', exact: true }).click();
  else await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toBeVisible();
  if (mobile) {
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-workspace')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
}
async function ask(
  page: Page,
  message = '정원을 배경으로 전체 작품을 만들어줘. 상태와 챕터, 연출까지 넣어줘.',
) {
  await page.getByRole('textbox', { name: '서포터 메시지' }).fill(message);
  await page.getByRole('button', { name: '서포터 전송', exact: true }).click();
}
function result(draft: any) {
  const d = structuredClone(draft);
  const c = d.characters.characters[0].id;
  const o = d.openings.openings[0].id;
  d.overview.title = '약속의 정원';
  d.overview.description = '정원에 숨은 약속을 찾는 이야기';
  d.overview.prompt = '조용한 정원에서 단서를 찾아간다.';
  d.overview.lore = [
    { id: 'garden-lore', name: '정원', keywords: ['정원'], prompt: '오래된 열쇠가 숨겨져 있다.' },
  ];
  d.characters.characters[0].name = '아리아';
  d.characters.characters[0].prompt = '정원 안내인. 친절한 존댓말을 쓴다.';
  d.openings.openings[0].body = '@아리아: 정원에 오신 걸 환영합니다. {{레일건}}';
  d.openings.openings[0].suggestions = ['여기는 어디죠?', '열쇠를 찾아볼게요.', '함께 가요.'];
  d.media.media = {
    template: '',
    characters: [{ characterId: c, code: '1' }],
    situations: [{ code: '1', name: '기본' }],
  };
  d.relations.relationsEnabled = true;
  d.relations.relations = [{ id: 'first-relation', from: 'user', to: c, label: '초면' }];
  d.relations.relationNodeIds = ['user', c];
  d.statuses.statuses = [
    {
      id: 'trust',
      name: '신뢰',
      type: 'number',
      initial: 0,
      min: 0,
      max: 100,
      unit: '',
      options: [],
      prompt: '협력하면 증가한다.',
    },
  ];
  d.statuses.statusTemplate = '신뢰';
  d.items.items = [
    {
      id: 'key',
      name: '정원의 열쇠',
      image: '',
      owned: false,
      prompt: '문을 여는 열쇠.',
      enhancement: null,
    },
  ];
  d.scenarios.chapters = [
    {
      id: 'promise',
      name: '다시 만날 약속',
      type: 'chapter',
      from: o,
      mode: 'all',
      conditions: [{ id: 'trust-check', kind: 'number', ref: 'trust', op: 'gte', value: 10 }],
      prologue: '문이 천천히 열린다.',
      prompt: '약속을 떠올린다.',
      afterstory: false,
    },
  ];
  d.shortcuts.shortcuts = [
    {
      id: 'look',
      name: '주변 둘러보기',
      description: '단서를 찾는다',
      prompt: '주변 단서를 관찰한다.',
    },
  ];
  d.effects.effects = [
    {
      id: 'railgun',
      name: '레일건',
      prompt: '빛이 나타나면 {{레일건}}을 출력한다.',
      content:
        '<div>섬광</div><script>XenoTale.ready.then(()=>XenoTale.screen("shake",800));</script>',
    },
  ];
  d.personas.personas = [
    { id: 'visitor', name: '여행자', image: '', prompt: '정원을 방문한 여행자.' },
  ];
  d.overview.description += '\n신뢰를 쌓아 다음 챕터를 열어보세요.';
  return {
    reply: '전체 작품 초안을 준비했습니다.',
    proposals: Object.entries(d).map(([section, replacement]) => ({
      section,
      reason: '요청한 정원 이야기에 맞게 작성했습니다.',
      replacement,
    })),
    questions: [],
  };
}
async function exported(page: Page) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: '작품 파일 내보내기', exact: true }).click();
  const download = await wait;
  return (await readDownloadedJson((await download.path())!)).workspace.work;
}

test('전체 구조 전달 · 12개 섹션 제안 · 클릭 전 미적용 · 일괄 적용/취소 · 저장/재접속', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let payload: any;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
    payload = r.request().postDataJSON();
    const data = JSON.parse(payload.messages[1].content);
    await r.fulfill({
      json: {
        choices: [
          { finish_reason: 'stop', message: { content: JSON.stringify(result(data.draft)) } },
        ],
      },
    });
  });
  await start(page);
  await ask(page);
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeVisible();
  const data = JSON.parse(payload.messages[1].content);
  expect(data.sections).toHaveLength(12);
  expect(Object.keys(data.draftSchema)).toHaveLength(12);
  expect(data.draftSchema.effects.properties.effects.items.properties.content.type).toBe('string');
  expect(payload.messages[0].content).toContain('XenoTale.complete');
  expect(payload.messages[0].content).toContain('{{ExactEffectName}}');
  expect(payload.max_tokens).toBe(16000);
  expect(JSON.stringify(payload)).not.toContain('fake-creator-key');
  await expect(page.getByRole('button', { name: '도움받을 항목' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('');
  await expect(page.locator('.support-proposal details')).toHaveCount(12);
  await page.screenshot({ path: 'test-results/creator-assistant-desktop.png' });
  await page.getByRole('button', { name: '적용하기', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '약속의 정원',
  );
  const saved = await exported(page);
  expect(saved.characters[0].name).toBe('아리아');
  expect(saved.chapters[0].conditions[0].ref).toBe(saved.statuses[0].id);
  expect(saved.chapters[0].from).toBe(saved.openings[0].id);
  expect(saved.effects[0].content).toContain('XenoTale.screen');
  expect(saved.personas[0].name).toBe('여행자');
  expect(saved.media.characters[0].characterId).toBe(saved.characters[0].id);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('');
  const undone = await exported(page);
  expect(undone.statuses).toHaveLength(0);
  expect(undone.chapters).toHaveLength(0);
  expect(undone.effects).toHaveLength(0);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '약속의 정원',
  );
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '약속의 정원',
  );
  expect((await exported(page)).effects).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('모바일 제안 수정 요청 · 임시 제안 전달 · 사이드메뉴에서 적용', async ({ page }) => {
  let calls = 0,
    followUp: any;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
    const data = JSON.parse(r.request().postDataJSON().messages[1].content);
    const raw = result(data.draft);
    calls++;
    if (calls === 2) {
      followUp = data;
      raw.proposals.find((p) => p.section === 'overview')!.replacement.title = '수정한 정원';
    }
    await r.fulfill({
      json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] },
    });
  });
  await start(page, true);
  await ask(page);
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeVisible();
  await ask(page, '아까 제안의 제목만 수정한 정원으로 바꿔줘');
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeVisible();
  expect(followUp.pendingDraft.overview.title).toBe('약속의 정원');
  expect(followUp.draft.overview.title).toBe('');
  expect(followUp.conversation.length).toBe(2);
  await page.screenshot({ path: 'test-results/creator-assistant-mobile.png' });
  await page.getByRole('button', { name: '적용하기', exact: true }).last().click();
  await page.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '수정한 정원',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '수정한 정원',
  );
});

test('제안 후 직접 수정한 대상은 오류로 표시하고 현재 내용을 보존', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
    const data = JSON.parse(r.request().postDataJSON().messages[1].content);
    await r.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                reply: '제목 변경안',
                proposals: [
                  {
                    section: 'overview',
                    reason: '제목만 변경',
                    replacement: { ...data.draft.overview, title: 'AI 제목' },
                  },
                ],
                questions: [],
              }),
            },
          },
        ],
      },
    });
  });
  await start(page);
  await ask(page, '제목만 써줘');
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeVisible();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('직접 수정');
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeDisabled();
  await expect(page.locator('.support-proposal')).toContainText('요청 후 직접 수정한 항목');
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('직접 수정');
  await ask(page, '제목만 다시 써줘');
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeVisible();
  await page.getByRole('textbox', { name: '작품 설명', exact: false }).fill('사용자가 작성한 설명');
  await page.getByRole('button', { name: '적용하기', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('AI 제목');
  await expect(page.getByRole('textbox', { name: '작품 설명', exact: false })).toHaveValue(
    '사용자가 작성한 설명',
  );
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('직접 수정');
  await expect(page.getByRole('textbox', { name: '작품 설명', exact: false })).toHaveValue(
    '사용자가 작성한 설명',
  );
});

test('잘못된 연결은 부분 적용 · 잘린 응답은 원문 보존 · Q&A는 제안 추가 없음', async ({ page }) => {
  let calls = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
    const data = JSON.parse(r.request().postDataJSON().messages[1].content);
    calls++;
    const raw = result(data.draft);
    raw.proposals.find((p) => p.section === 'scenarios')!.replacement.chapters[0].from = 'missing';
    await r.fulfill({
      json: {
        choices: [
          {
            finish_reason: calls === 2 ? 'length' : 'stop',
            message: {
              content: JSON.stringify(
                calls === 3
                  ? { reply: '구조에 대한 답변입니다.', proposals: [], questions: [] }
                  : raw,
              ),
            },
          },
        ],
      },
    });
  });
  await start(page);
  await ask(page);
  await expect(page.locator('.assistant .support-transcript')).toContainText('이전 노드');
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeEnabled();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('');
  await ask(page);
  await expect(page.locator('.assistant .support-transcript')).toContainText(
    '응답이 완성되지 않았거나',
  );
  await expect(page.getByRole('button', { name: '적용하기', exact: true }).last()).toBeDisabled();
  await expect(page.locator('.support-proposal')).toHaveCount(2);
  await ask(page, '구조가 어떻게 되니?');
  await expect(page.locator('.assistant .support-transcript')).toContainText(
    '구조에 대한 답변입니다',
  );
  await expect(page.locator('.support-proposal')).toHaveCount(2);
});

test('서포터 잔액 · 에이전트와 대화 테스트 후 갱신 · 모바일 공유 · 조회 실패 복구', async ({
  page,
}) => {
  await start(page);
  let usage = 0;
  let denied = false;
  await page.route('https://openrouter.ai/api/v1/credits', (r) =>
    denied
      ? r.fulfill({ status: 403, json: {} })
      : r.fulfill({ json: { data: { total_credits: 10, total_usage: usage } } }),
  );
  await page.route('https://openrouter.ai/api/v1/chat/completions', (r) => {
    const payload = JSON.parse(r.request().postDataJSON().messages[1].content);
    usage += 0.25;
    const answer = payload.draft
      ? result(payload.draft)
      : {
          kind: 'turn',
          requestedCharacterIds: [],
          body: '*여기에 지문이 나옵니다.*',
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
    return r.fulfill({
      json: {
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.25 },
      },
    });
  });
  const desktop = page.locator('.assistant-desktop');
  const credit = desktop.getByRole('button', { name: '잔액 새로고침', exact: true });
  await expect(credit).toHaveText('$10');
  await ask(page, '현재 구조를 설명해줘');
  await expect(credit).toHaveText('$9.75');
  await page.getByRole('button', { name: '적용하기', exact: true }).last().click();
  await desktop.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await desktop.getByRole('textbox', { name: '테스트 메시지', exact: true }).fill('안녕');
  await desktop.getByRole('button', { name: '테스트 전송', exact: true }).click();
  await expect(credit).toHaveText('$9.5');
  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    const menu = page.locator('.editor-workspace');
    await menu.getByRole('button', { name: '제작 서포터', exact: true }).click();
    await expect(menu.getByRole('button', { name: '잔액 새로고침', exact: true })).toHaveText(
      '$9.5',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 852 });
  denied = true;
  await credit.click();
  await expect(credit).toHaveText('조회 불가');
  await expect(credit).toHaveAttribute('title', /계정 잔액 조회 권한/);
  denied = false;
  usage = 0.75;
  await credit.click();
  await expect(credit).toHaveText('$9.25');
});

test('작업공간별 대화·미적용/적용 제안 복원 · 이전 제안 보존 · 백업 포함', async ({
  page,
  context,
}) => {
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
    const payload = r.request().postDataJSON();
    expect(payload.stream).toBe(true);
    const data = JSON.parse(payload.messages[1].content);
    await r.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                reply: '제목 변경 제안을 준비했습니다.',
                proposals: [
                  {
                    section: 'overview',
                    reason: '제목을 변경합니다.',
                    replacement: { ...data.draft.overview, title: '기록되는 제목' },
                  },
                ],
                questions: [],
              }),
            },
          },
        ],
      },
    });
  });
  await start(page);
  const firstUrl = page.url();
  await ask(page, '기록될 제목을 제안해줘');
  await expect(page.getByRole('button', { name: '적용하기', exact: true })).toBeVisible();
  await expect(page.getByText('기록될 제목을 제안해줘', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '제안 닫기', exact: true })).toHaveCount(0);
  await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('기록될 제목을 제안해줘', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '적용하기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '적용하기', exact: true }).click();
  await expect(page.locator('.support-proposal')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '적용 완료', exact: true })).toBeDisabled();
  await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '기록되는 제목',
  );
  await expect(page.getByRole('button', { name: '적용 완료', exact: true })).toBeDisabled();
  const saved = await exported(page);
  expect(saved.title).toBe('기록되는 제목');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '작품 파일 내보내기', exact: true }).click();
  const exportedFile = await download;
  const metadata = (await readDownloadedJson((await exportedFile.path())!)).workspace;
  expect(metadata.assistantHistory).toHaveLength(2);
  expect(metadata.assistantHistory[1].applied).toBe(true);
  expect(metadata.assistantHistory[1].proposal.sections[0].replacement.title).toBe('기록되는 제목');
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
  const other = await opened;
  await other.waitForURL(/#\/create\//);
  await expect(other.getByRole('textbox', { name: '서포터 메시지' })).toBeVisible();
  await expect(other.getByText('기록될 제목을 제안해줘', { exact: true })).toHaveCount(0);
  await expect(other.locator('.support-proposal')).toHaveCount(0);
  await other.close();
  await page.goto(firstUrl);
  await expect(page.getByRole('button', { name: '적용 완료', exact: true })).toBeDisabled();
  await page.route('https://openrouter.ai/api/v1/chat/completions', (r) =>
    r.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                reply: '질문에 대한 답변입니다.',
                proposals: [],
                questions: [],
              }),
            },
          },
        ],
      },
    }),
  );
  await ask(page, '그냥 질문할게');
  await expect(page.getByText('질문에 대한 답변입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '적용 완료', exact: true })).toBeDisabled();
});

for (const mobile of [false, true])
  test(`스트리밍 중 전송문 비우기 · 새 초안 보존 · 완료 전 적용 불가 (${mobile ? '모바일' : 'PC'})`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (String(args[0]).endsWith('/chat/completions')) {
          const encoder = new TextEncoder();
          const prefix = '{"reply":"설명을 먼저 보여드립니다.';
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: prefix } }] })}\n\n`,
                ),
              );
              (window as any).finishCreatorStream = () => {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: '","proposals":[],"questions":[]}' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
                  ),
                );
                controller.close();
              };
            },
          });
          return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
        }
        return original(...args);
      };
    });
    await start(page, mobile);
    await ask(page, '설명해줘');
    const preview = page.getByLabel('작성 중인 답변');
    await expect(preview).toContainText('설명을 먼저 보여드립니다.');
    await expect(preview.getByRole('status')).toContainText('자 수신');
    await expect(page.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue('');
    await page.getByRole('textbox', { name: '서포터 메시지', exact: true }).fill('다음 요청 초안');
    await expect(page.getByRole('button', { name: '적용하기', exact: true })).toHaveCount(0);
    await page.evaluate(() => (window as any).finishCreatorStream());
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue(
      '다음 요청 초안',
    );
    await expect(page.locator('.assistant .support-transcript')).toContainText(
      '설명을 먼저 보여드립니다.',
    );
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    if (mobile) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await expect(page.locator('.assistant .support-transcript')).toContainText(
      '설명을 먼저 보여드립니다.',
    );
    await expect(page.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue(
      '다음 요청 초안',
    );
  });

for (const mobile of [false, true]) {
  test(`잘못된 챕터만 빨간 테두리 · 정상 변경 적용 · 오류와 원문 재접속 보존 (${mobile ? '모바일' : 'PC'})`, async ({
    page,
  }) => {
    let calls = 0;
    let followUp: any;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
      const payload = JSON.parse(route.request().postDataJSON().messages[1].content);
      const raw = result(payload.draft);
      calls++;
      if (calls === 2) followUp = payload;
      const scenarios = raw.proposals.find((p) => p.section === 'scenarios')!.replacement;
      scenarios.title = '시나리오에는 없는 필드';
      const good = structuredClone(scenarios.chapters[0]);
      scenarios.chapters[0].from = 'not-an-opening';
      scenarios.chapters.push({ ...good, id: 'valid-second', name: '정상 챕터' });
      raw.reply = '비용을 쓴 답변과 제안을 모두 보존합니다.';
      await route.fulfill({
        json: { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] },
      });
    });
    await start(page, mobile);
    await ask(page);
    const proposal = page.locator('.support-proposal').last();
    await expect(page.locator('.assistant')).toContainText(
      '비용을 쓴 답변과 제안을 모두 보존합니다.',
    );
    await proposal.locator('summary').filter({ hasText: '시나리오' }).click();
    const overview = proposal
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: '작품 개요' }) });
    const scenario = proposal
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: '시나리오' }) });
    await expect(
      overview
        .locator('.proposal-field')
        .filter({ has: page.locator('strong').filter({ hasText: /^제목$/ }) }),
    ).not.toHaveClass(/proposal-invalid/);
    await expect(
      scenario
        .locator('.proposal-field')
        .filter({ has: page.locator('strong').filter({ hasText: /^제목$/ }) }),
    ).toHaveClass(/proposal-invalid/);
    const bad = proposal.locator('.proposal-item.proposal-invalid');
    await expect(bad).toHaveCount(1);
    await expect(bad).toContainText('이전 노드');
    expect(await bad.evaluate((e) => getComputedStyle(e).borderColor)).toBe('rgb(198, 72, 80)');
    await expect(
      proposal.locator('.proposal-item').filter({ hasText: '정상 챕터' }),
    ).not.toHaveClass(/proposal-invalid/);
    await proposal.getByRole('button', { name: '적용하기', exact: true }).click();
    await expect(proposal.getByRole('button', { name: '적용 완료', exact: true })).toBeDisabled();
    await expect(proposal).toContainText('오류 표시된 부분을 제외하고 적용했습니다.');
    if (mobile) await page.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
      '약속의 정원',
    );
    const work = await exported(page);
    expect(work.chapters.map((chapter: any) => chapter.id)).toEqual(['valid-second']);
    expect(work.statuses).toHaveLength(1);
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('');
    expect((await exported(page)).chapters).toHaveLength(0);
    await page.getByRole('button', { name: '다시 실행', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
      '약속의 정원',
    );
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    if (mobile) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await expect(page.locator('.assistant')).toContainText(
      '비용을 쓴 답변과 제안을 모두 보존합니다.',
    );
    await expect(proposal).toContainText('not-an-opening');
    await proposal.locator('summary').filter({ hasText: '시나리오' }).click();
    await expect(proposal.locator('.proposal-item.proposal-invalid')).toContainText('이전 노드');
    await ask(page, '제목만 후속 수정해줘');
    await expect(page.locator('.support-proposal')).toHaveCount(2);
    expect(followUp.draft.scenarios.chapters.map((chapter: any) => chapter.id)).toEqual([
      'valid-second',
    ]);
  });

  test(`429 실패 시 전송문 복원 · 새 초안은 덮어쓰지 않음 (${mobile ? '모바일' : 'PC'})`, async ({
    page,
  }) => {
    let release = () => {};
    let calls = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
        calls++;
      });
      await route.fulfill({ status: 429, json: { error: { message: 'Rate limit exceeded' } } });
    });
    await start(page, mobile);
    const input = page.getByRole('textbox', { name: '서포터 메시지', exact: true });
    for (const [index, nextDraft] of ['', '새로 쓰던 요청'].entries()) {
      await ask(page, '실패하면 복원할 문장');
      await expect(input).toHaveValue('');
      await expect(
        page.getByRole('button', { name: '서포터 생성 중단', exact: true }),
      ).toBeVisible();
      if (nextDraft) await input.fill(nextDraft);
      await expect.poll(() => calls).toBe(index + 1);
      release();
      await expect(page.getByRole('button', { name: '서포터 전송', exact: true })).toBeVisible();
      await expect(input).toHaveValue(nextDraft || '실패하면 복원할 문장');
    }
    await page.reload();
    if (mobile) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await expect(input).toHaveValue('새로 쓰던 요청');
  });

  test(`스트리밍 중단 시 복원 · 생성 중 새로고침해도 전송문 보존 (${mobile ? '모바일' : 'PC'})`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (!String(args[0]).endsWith('/chat/completions')) return original(...args);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: '{"reply":"진행 중인 답변' } }] })}\n\n`,
                ),
              );
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      };
    });
    await start(page, mobile);
    const input = page.getByRole('textbox', { name: '서포터 메시지', exact: true });
    for (const nextDraft of ['', '중단해도 남을 새 초안']) {
      await ask(page, '중단하면 복원할 문장');
      await expect(page.getByLabel('작성 중인 답변')).toContainText('진행 중인 답변');
      await expect(input).toHaveValue('');
      if (nextDraft) await input.fill(nextDraft);
      await page.getByRole('button', { name: '서포터 생성 중단', exact: true }).click();
      await expect(input).toHaveValue(nextDraft || '중단하면 복원할 문장');
      await expect(page.getByRole('button', { name: '서포터 전송', exact: true })).toBeVisible();
    }
    await ask(page, '새로고침 때 복원할 문장');
    await expect(page.getByLabel('작성 중인 답변')).toContainText('진행 중인 답변');
    await expect(input).toHaveValue('');
    await page.reload();
    if (mobile) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await expect(input).toHaveValue('새로고침 때 복원할 문장');
  });
}
