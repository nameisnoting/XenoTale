import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.context().route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function support(page: Page, width: number, tab = '대화 테스트') {
  if (width < 800) {
    if (!(await page.locator('.editor-rail').isVisible()))
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-rail')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function personas(page: Page, width: number) {
  if (width < 800) {
    await page
      .locator('.editor-rail')
      .getByRole('button', { name: '작업공간', exact: true })
      .click();
  }
  const nav = page.locator('.editor-nav');
  if (!(await nav.getByRole('button', { name: '추천 페르소나', exact: false }).count()))
    await nav.getByRole('button', { name: '추가 요소', exact: false }).click();
  await nav.getByRole('button', { name: '추천 페르소나', exact: false }).click();
}
async function seedWorkspace(page: Page) {
  const workspaceId = page.url().split('/create/')[1];
  await page.getByText('저장완료', { exact: true }).waitFor();
  await page.evaluate(
    (workspaceId) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction(['workspaces', 'works'], 'readwrite');
          const table = tx.objectStore('workspaces');
          const read = table.get(workspaceId);
          read.onsuccess = () => {
            const value = read.result;
            const fixture = tx.objectStore('works').getAll();
            fixture.onsuccess = () => {
              const work = fixture.result[0].work;
              work.id = value.work.id;
              work.characters[0].name = '세리';
              work.openings[0].body = '@세리: {{user}}님, 안내합니다.';
              work.personas = [
                { id: 'persona-first', name: '안정민', image: '', prompt: '첫 번째 인물' },
                { id: 'persona-second', name: '이수민', image: '', prompt: '두 번째 인물' },
              ];
              table.put({ ...value, work, revision: value.revision + 1 });
            };
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    workspaceId,
  );
  await page.reload();
  return workspaceId;
}
async function savedWorkspace(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<any>((resolve) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const database = request.result;
          const read = database.transaction('workspaces').objectStore('workspaces').get(id);
          read.onsuccess = () => {
            database.close();
            resolve(read.result);
          };
        };
      }),
    id,
  );
}
async function messageStyle(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((row) => {
      const body = row.querySelector('.markdown')!;
      const text = row.querySelector('strong')!;
      const rs = getComputedStyle(row),
        bs = getComputedStyle(body),
        ts = getComputedStyle(text);
      return {
        gap: rs.gap,
        padding: bs.padding,
        radius: bs.borderRadius,
        nameGap: ts.marginBottom,
      };
    });
}

for (const width of [1440, 393]) {
  test(`테스트 기록·페르소나·입력 초안 복원 및 작업공간 분리 (${width})`, async ({
    page,
    context,
  }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.locator('.chat-shell .character-message')).toBeVisible();
    const chatStyle = await messageStyle(page, '.chat-shell .character-message');
    await page.goto('/#/');
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.waitForURL(/#\/create\//);
    const firstUrl = page.url();
    const workspaceId = await seedWorkspace(page);
    await support(page, width);
    const panel = page.locator('.creator-test');
    const transcript = panel.locator('.support-transcript');
    const input = panel.getByRole('textbox', { name: '테스트 메시지', exact: true });
    await expect(transcript).toContainText('안정민님');
    expect(await messageStyle(page, '.creator-test .character-message')).toEqual(chatStyle);
    await personas(page, width);
    const labels = page.locator('.creator-personas .selection-pill-label');
    await labels.nth(1).click();
    await support(page, width);
    await expect(transcript).toContainText('이수민님');
    await input.fill('전송 전 테스트 초안');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    await support(page, width);
    await expect(input).toHaveValue('전송 전 테스트 초안');
    await expect(transcript).toContainText('이수민님');
    await panel.getByRole('button', { name: '테스트 전송', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(transcript.locator('.support-user')).toHaveCount(1);
    await expect
      .poll(
        async () => (await savedWorkspace(page, workspaceId)).testRoom.current.runtime.turnCount,
      )
      .toBe(1);
    await personas(page, width);
    await labels.first().click();
    await page
      .locator('.persona-card')
      .getByRole('textbox', { name: '이름', exact: true })
      .fill('박정민');
    await support(page, width);
    await expect(transcript.locator('.story-body').first()).toContainText('이수민님');
    await input.fill('계속 쓸 테스트 초안');
    await page.getByRole('tab', { name: 'AI 에이전트', exact: true }).click();
    const agent = page.getByRole('textbox', { name: '서포터 메시지', exact: true });
    await agent.fill('별도의 에이전트 초안');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.goto('/#/');
    await page.goto(firstUrl);
    await support(page, width, 'AI 에이전트');
    await expect(agent).toHaveValue('별도의 에이전트 초안');
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(input).toHaveValue('계속 쓸 테스트 초안');
    await expect(transcript.locator('.support-user')).toHaveCount(1);
    await page.reload();
    await support(page, width);
    await expect(transcript.locator('.support-user')).toHaveCount(1);
    await expect(input).toHaveValue('계속 쓸 테스트 초안');
    await page.screenshot({ path: `test-results/creator-test-state-${width}.png` });
    if (width < 800)
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '작업공간', exact: true })
        .click();
    const opened = context.waitForEvent('page');
    await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
    const other = await opened;
    await other.waitForURL(/#\/create\//);
    await other.setViewportSize({ width, height: 1000 });
    await support(other, width, 'AI 에이전트');
    await expect(other.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue(
      '',
    );
    await other.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(other.getByRole('textbox', { name: '테스트 메시지', exact: true })).toHaveValue(
      '',
    );
    await expect(other.locator('.creator-test .support-user')).toHaveCount(0);
    await other.close();
    await support(page, width);
    await panel.getByRole('button', { name: '현재 설정으로 다시 시작', exact: true }).click();
    await expect(transcript.locator('.support-user')).toHaveCount(0);
    await expect(transcript).toContainText('박정민님');
    await expect(input).toHaveValue('');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    await support(page, width);
    await expect(transcript.locator('.support-user')).toHaveCount(0);
    await expect(input).toHaveValue('');
    await page.getByRole('tab', { name: 'AI 에이전트', exact: true }).click();
    await expect(agent).toHaveValue('별도의 에이전트 초안');
    await page.getByRole('button', { name: '서포터 전송', exact: true }).click();
    await expect(agent).toHaveValue('');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    await support(page, width, 'AI 에이전트');
    await expect(agent).toHaveValue('');
  });

  test(`대화방 입력 초안: 즉시 새로고침·페이지 이탈·방별 분리·전송 후 삭제 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.waitForURL(/#\/chat\//);
    const firstUrl = page.url();
    const input = page.getByRole('textbox', { name: '메시지', exact: true });
    await input.fill('첫 번째 방의\n미전송 초안');
    await page.reload();
    await expect(input).toHaveValue('첫 번째 방의\n미전송 초안');
    await page.goto('/#/profile');
    await page.goto(firstUrl);
    await expect(input).toHaveValue('첫 번째 방의\n미전송 초안');
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.waitForURL(/#\/chat\//);
    const secondUrl = page.url();
    expect(secondUrl).not.toBe(firstUrl);
    await expect(input).toHaveValue('');
    await input.fill('두 번째 방 초안');
    await page.goto(firstUrl);
    await expect(input).toHaveValue('첫 번째 방의\n미전송 초안');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(page.locator('.conversation-turn')).toHaveCount(1);
    await page.reload();
    await expect(input).toHaveValue('');
    await page.goto(secondUrl);
    await expect(input).toHaveValue('두 번째 방 초안');
  });
}
