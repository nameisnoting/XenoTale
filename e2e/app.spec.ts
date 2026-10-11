import { test, expect, type Page } from '@playwright/test';
async function start(page: Page) {
  await page.route('https://openrouter.ai/api/v1/models', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await expect(page.getByRole('button', { name: '정원 앞에서 대화 시작' })).toBeVisible();
}
test('빈 입력 전송 · 리롤 후보 상태 복원 · 과거 분기 · 재접속', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.screenshot({ path: 'test-results/library-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await expect(page.locator('.user-message')).toContainText('이어서 내용 전개');
  await page.getByRole('button', { name: '리롤', exact: true }).click();
  await page.getByRole('button', { name: '다른 응답 생성' }).click();
  await expect(page.locator('.candidate-pager')).toContainText('2 / 2');
  await expect(page.getByTestId('status-affinity')).toHaveText('13');
  await page.getByRole('button', { name: '이전 응답', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await page.getByRole('button', { name: '다음 응답', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('13');
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('정원에 갈게요');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('15');
  await expect(page.getByTestId('status-place')).toHaveText('정원');
  await page.screenshot({ path: 'test-results/chat-desktop.png', fullPage: true });
  const oldURL = page.url();
  await page.getByRole('button', { name: '이 지점에서 분기', exact: true }).first().click();
  await page.getByRole('button', { name: '분기 만들기' }).click();
  await expect(page).not.toHaveURL(oldURL);
  await expect(page.getByTestId('status-affinity')).toHaveText('13');
  await expect(page.getByTestId('status-place')).toHaveText('문 앞');
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('status-affinity')).toHaveText('13');
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
test('제작 자동저장 · 작업내역 · 시점 · 작품 반영', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('자동저장 검증');
  await page
    .getByRole('textbox', { name: /^프롬프트/, exact: false })
    .fill('작은 정원에서 시작하는 대화');
  await expect(page.getByText('저장완료')).toBeVisible();
  await expect(page.getByRole('button', { name: '1인칭 주인공', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2인칭', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '자동저장 검증',
  );
  await page.getByRole('button', { name: '작업내역', exact: true }).click();
  await expect(page.locator('.recent-workspaces')).toContainText('자동저장 검증');
  await page.getByRole('button', { name: '작업공간', exact: true }).click();
  await page.getByRole('button', { name: '등장 캐릭터', exact: false }).click();
  await page.getByRole('textbox', { name: '이름', exact: false }).fill('안내인');
  await page
    .getByRole('textbox', { name: '캐릭터 프롬프트', exact: false })
    .fill('친절한 안내인이다.');
  await page.getByRole('button', { name: '도입부', exact: false }).click();
  await page.getByRole('textbox', { name: '내용', exact: false }).fill('@안내인: 반갑습니다.');
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '제작완료', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '작품 v1' })).toBeVisible();
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await expect(page.getByRole('button', { name: '자동저장 검증 대화 시작' })).toBeVisible();
});
test('모바일 바텀시트 · 케밥 로그 · 창의성 슬라이더', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await expect(page.locator('dialog.bottom-sheet')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-sheet.png' });
  await page.getByRole('button', { name: '소지품', exact: true }).last().click();
  await expect(page.getByRole('main', { name: '소지품' })).toContainText('수련검');
  await expect(page.getByRole('button', { name: '사용', exact: true })).toHaveCount(0);
  await page.locator('.inventory-tile').filter({ hasText: '수련검' }).click();
  await page.getByRole('button', { name: '강화하기', exact: true }).click();
  await expect(page.getByRole('main', { name: '소지품' })).toContainText('+1 수련검');
  await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
  await page.locator('.model-trigger').click();
  await expect(page.getByRole('slider', { name: '창의성' })).toBeVisible();
  await page.getByRole('button', { name: '매우 높음', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveValue('4');
  await page.screenshot({ path: 'test-results/mobile-model.png' });
  await page.getByRole('button', { name: '선택 완료' }).click();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  await expect(page.locator('.side-drawer')).toContainText('이어서 내용 전개');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.screenshot({ path: 'test-results/chat-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('body').evaluate((e) => getComputedStyle(e).fontFamily)).toContain(
    'Pretendard',
  );
});
test('전체 백업 파일 가져오기는 현재 대화를 보존하고 복사본을 추가', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
  const file = await download;
  const path = await file.path();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path!);
  await page.getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.locator('.room-sidebar .room-list-item')).toHaveCount(2);
  await page.locator('.room-sidebar .room-list-item .room-list-open').last().click();
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
});
test('실제 연결 경로의 요청 형식 · 빈 입력 continue · 추론 토큰 (API 모의 응답)', async ({
  page,
}) => {
  const model = {
    id: 'anthropic/test-model',
    name: '연결 테스트 모델',
    context_length: 200000,
    supported_parameters: ['structured_outputs'],
    reasoning: { supports_max_tokens: true },
  };
  await page.route('https://openrouter.ai/api/v1/models', (r) =>
    r.fulfill({ json: { data: [model] } }),
  );
  await page.route('https://openrouter.ai/api/v1/key', (r) =>
    r.fulfill({ json: { data: { label: 'test' } } }),
  );
  await page.route('https://openrouter.ai/api/v1/credits', (r) =>
    r.fulfill({
      json: { data: { total_credits: 10, total_usage: 0 } },
    }),
  );
  let payload: any;
  let calls = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    payload = route.request().postDataJSON();
    calls++;
    await route.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                kind: 'turn',
                requestedCharacterIds: [],
                body: '@아리아: 새로운 이야기를 시작할까요?',
                choices: ['모의 선택지'],
                delta: {
                  numeric: [{ fieldId: 'affinity', amount: 4 }],
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
          completion_tokens: 25,
          prompt_tokens_details: { cached_tokens: 70 },
          cost: 0.0001,
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-test-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: '연결 테스트 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료' }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await page.getByRole('button', { name: '추천 선택지 표시', exact: true }).click();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('14');
  expect(JSON.parse(payload.messages.at(-1).content).turnDirectives.choicesEnabled).toBe(true);
  await expect(page.locator('.suggestions')).toHaveCount(0);
  await page.getByRole('button', { name: '추천 선택지 표시', exact: true }).click();
  await expect(page.locator('.suggestions')).toContainText('모의 선택지');
  expect(calls).toBe(1);
  expect(payload.model).toBe(model.id);
  expect(payload.reasoning.max_tokens).toBe(4096);
  expect(JSON.parse(payload.messages.at(-1).content).playerInput.kind).toBe('continue');
  expect(payload.response_format.type).toBe('json_schema');
  expect(payload.messages[0].content[0].cache_control.type).toBe('ephemeral');
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  await page.getByRole('menuitem', { name: '단축어 추가', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('textbox', { name: '이름', exact: true }).fill('산책');
  await modal.getByRole('textbox', { name: '설명', exact: true }).fill('정원 산책');
  await modal
    .getByRole('textbox', { name: '프롬프트', exact: true })
    .fill('주변 풍경을 자세히 묘사한다.');
  await modal.getByRole('button', { name: '저장', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  await page.getByRole('menuitem', { name: '/산책 정원 산책', exact: true }).click();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeVisible();
  expect(JSON.parse(payload.messages.at(-1).content).retryDirective).toContain(
    '주변 풍경을 자세히 묘사한다.',
  );
  expect(calls).toBe(2);
  await page.reload();
  await expect(page.locator('.suggestions')).toContainText('모의 선택지');
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '/산책 정원 산책', exact: true })).toBeVisible();
});
