import { test, expect, type Page } from '@playwright/test';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
}
const section = (page: Page, name: string) =>
  page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1kAAAAASUVORK5CYII=',
  'base64',
);

test('시안 3열 · 패널을 열고 대화 · 페르소나 이미지와 성별 자동저장', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  expect(
    await page.locator('.chat-shell').evaluate((e) => getComputedStyle(e).gridTemplateColumns),
  ).toBe('365px 711px 364px');
  await page.getByRole('button', { name: '페르소나', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '페르소나 추가', exact: true }).click();
  const panel = page.getByRole('region', { name: '페르소나', exact: true });
  await panel.getByRole('textbox', { name: '이름', exact: true }).fill('은하');
  await panel.getByRole('radio', { name: '여성', exact: true }).check();
  await panel
    .locator('input[type=file]')
    .setInputFiles({ name: 'persona.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(panel.getByAltText('페르소나 이미지')).toHaveAttribute('src', /^data:image\/png/);
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('정원을 둘러볼게요.');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.user-message')).toContainText('은하');
  await expect(panel).toBeVisible();
  expect(
    await page
      .locator('.character-message .markdown')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
  await page.reload();
  await page.getByRole('button', { name: '페르소나', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: '이름', exact: true })).toHaveValue('은하');
  await expect(panel.getByRole('radio', { name: '여성', exact: true })).toBeChecked();
  await expect(page.locator('.user-message img')).toHaveAttribute('src', /^data:image\/png/);
});

test('제작 누락 항목 · 그룹 프롬프트 · 시점 대상 · 상태창 HTML 미리보기', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('설정 검증');
  await page.getByRole('textbox', { name: /^프롬프트/, exact: false }).fill('고요한 정원');
  await page.getByRole('button', { name: '1인칭 관찰자', exact: true }).click();
  await expect(page.getByRole('group', { name: '관찰자', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: '관찰 대상', exact: true })).toBeVisible();
  await section(page, '등장 캐릭터');
  await page.getByRole('textbox', { name: '이름', exact: false }).fill('안내인');
  await page
    .getByRole('textbox', { name: '캐릭터 프롬프트', exact: false })
    .fill('정원을 안내한다.');
  await page.getByRole('button', { name: '캐릭터 그룹화', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: '추가', exact: true }).click();
  await modal.getByRole('textbox', { name: '그룹 이름', exact: false }).fill('관리인');
  await modal.getByRole('button', { name: /안내인/ }).click();
  await modal
    .getByRole('textbox', { name: '그룹 프롬프트', exact: true })
    .fill('저택의 비밀을 공유한다.');
  await modal.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByRole('button', { name: '관리인', exact: true })).toBeVisible();
  await section(page, '상태창');
  await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('체력');
  await page.getByRole('radio', { name: '현재값 / 최댓값', exact: true }).check();
  await page.getByRole('button', { name: '레벨 추가', exact: true }).click();
  await page.getByPlaceholder('설정한 구간의 특징을 정의해 주세요.').fill('지친 상태');
  await page
    .getByRole('textbox', { name: '문법 입력', exact: true })
    .fill('<h2>체력 {{체력}}</h2><script>parent.document.body.dataset.unsafe="yes"</script>');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="상태창"]').getByRole('heading', { name: '체력 0' }),
  ).toBeVisible();
  expect(await page.locator('body').getAttribute('data-unsafe')).toBeNull();
  await page.reload();
  await section(page, '상태창');
  await expect(page.getByRole('radio', { name: '현재값 / 최댓값', exact: true })).toBeChecked();
  await expect(page.getByPlaceholder('설정한 구간의 특징을 정의해 주세요.')).toHaveValue(
    '지친 상태',
  );
  expect(errors).toEqual([]);
});

test('관계도 연결과 내면 · 시나리오 노드 편집 · 작업 공간 재진입', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await section(page, '등장 캐릭터');
  await page.getByRole('textbox', { name: '이름', exact: false }).fill('안내인');
  await section(page, '관계도');
  await page.getByRole('button', { name: '안내인 관계 연결', exact: true }).click();
  await page.getByRole('button', { name: '{{user}} 관계 연결', exact: true }).click();
  await page
    .getByRole('textbox', { name: '안내인 → {{user}} 표면 관계', exact: true })
    .fill('친구');
  await page.getByRole('switch', { name: '표면 / 내면 분리', exact: true }).click();
  await page.getByRole('button', { name: '⇄ 내면으로', exact: true }).click();
  await page
    .getByRole('textbox', { name: '안내인 → {{user}} 내면 관계', exact: true })
    .fill('신뢰');
  await section(page, '시나리오');
  await page.getByRole('button', { name: '도입부 1 다음 챕터 추가', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '제목', exact: true }).fill('정원');
  await page.getByRole('dialog').getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.locator('.scenario-node')).toContainText(['도입부 1', '정원']);
  await page.reload();
  await section(page, '관계도');
  await page.getByRole('button', { name: '⇄ 내면으로', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '안내인 → {{user}} 내면 관계', exact: true }),
  ).toHaveValue('신뢰');
  await section(page, '시나리오');
  await page.getByRole('button', { name: /정원.*조건 0개/, exact: false }).click();
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: '제목', exact: true }),
  ).toHaveValue('정원');
});

test('작업 패널의 노트 그룹 편집 · 기억 설정 · 대화방 폴더 메뉴', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await page.getByRole('button', { name: '노트 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '프롬프트', exact: true }).fill('존댓말로 대화한다.');
  await page.getByRole('button', { name: '노트 그룹 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: true }).fill('문체');
  await page.getByRole('checkbox', { name: '노트 1', exact: true }).check();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByRole('switch', { name: '문체 전체 적용' })).toBeChecked();
  await page.getByRole('button', { name: '기억관리', exact: true }).click();
  await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
  await page.getByRole('button', { name: '요약 간격 늘리기', exact: true }).click();
  await expect(page.locator('.stepper').first()).toContainText('15 턴');
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '대화방 관리', exact: true }).click();
  await page.getByRole('button', { name: '폴더 생성', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: true }).fill('테스트 폴더');
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화방 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '이름 / 폴더 변경', exact: true }).click();
  await page
    .getByRole('combobox', { name: '폴더', exact: true })
    .selectOption({ label: '테스트 폴더' });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: /테스트 폴더.*대화방/ }).click();
  await expect(page.locator('.folder-rooms')).toContainText('정원 앞에서');
});
