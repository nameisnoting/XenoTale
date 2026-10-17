import { test, expect, type Page, type Locator } from '@playwright/test';
import type { Work } from '../src/domain/types';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function section(page: Page, width: number, name: string) {
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  await nav.waitFor({state:'visible'});
  if (
    (await nav.count()) &&
    !(await nav.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).count())
  )
    await nav.getByRole('button', { name: '추가 요소', exact: false }).click();

  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function select(page: Page, control: Locator, name: string) {
  await control.click();
  await page.getByRole('option', { name, exact: true }).click();
  await expect(control).toContainText(name);
}
async function bold(control: Locator, selected: boolean) {
  await expect(control).toHaveAttribute('aria-pressed', String(selected));
  expect(await control.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(
    selected ? '700' : '400',
  );
}

for (const width of [1440, 393]) {
  test(`중간 챕터 삭제 · 다중 연결 · 조건 유지 · 취소와 복원 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    const workspaceId = new URL(page.url()).hash.split('/')[2];
    const before = await page.evaluate(
      (workspaceId) =>
        new Promise<Work>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('workspaces', 'readwrite');
            const store = transaction.objectStore('workspaces');
            const read = store.get(workspaceId);
            let work: Work;
            read.onsuccess = () => {
              const record = read.result;
              work = record.work;
              work.statuses = [
                {
                  id: 'health',
                  name: '체력',
                  type: 'number',
                  initial: 30,
                  min: 0,
                  max: 100,
                  unit: '',
                  options: [],
                  prompt: '',
                },
              ];
              const chapter = (id: string, from: string, amount: number) => ({
                id,
                name: id,
                from,
                type: 'chapter' as const,
                mode: 'all' as const,
                conditions: [
                  {
                    id: `${id}-condition`,
                    kind: 'number' as const,
                    ref: 'health',
                    op: 'gte' as const,
                    value: amount,
                  },
                ],
                prologue: `${id} 장면`,
                prompt: `${id} 설정`,
                afterstory: true,
              });
              work.chapters = [
                chapter('A', work.openings[0].id, 5),
                chapter('B', 'A', 90),
                chapter('C', 'B', 10),
                { ...chapter('D', 'B', 20), type: 'ending', mode: 'any', afterstory: false },
                chapter('E', 'C', 40),
                chapter('U', 'A', 1),
              ];
              store.put(record);
            };
            transaction.oncomplete = () => {
              database.close();
              resolve(work);
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
          };
        }),
      workspaceId,
    );
    await page.reload();
    await section(page, width, '시나리오');
    const canvas = page.getByRole('application', { name: '시나리오 캔버스', exact: true });
    const settings = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '챕터 설정', exact: true }) });
    const confirmation = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '챕터 삭제', exact: true }) });
    const readWork = () =>
      page.evaluate(
        (workspaceId) =>
          new Promise<Work>((resolve, reject) => {
            const request = indexedDB.open('xenotale-v1');
            request.onsuccess = () => {
              const database = request.result;
              const read = database
                .transaction('workspaces', 'readonly')
                .objectStore('workspaces')
                .get(workspaceId);
              read.onsuccess = () => {
                database.close();
                resolve(read.result.work);
              };
              read.onerror = () => {
                database.close();
                reject(read.error);
              };
            };
            request.onerror = () => reject(request.error);
          }),
        workspaceId,
      );
    await canvas.getByRole('button', { name: 'B 조건 1개', exact: true }).click();
    await settings.getByRole('button', { name: '챕터 삭제', exact: true }).click();
    await expect(confirmation).toContainText('다음 챕터 2개가 이전 노드에 자동 연결됩니다.');
    await expect(confirmation).toContainText('다른 챕터의 조건과 내용은 그대로 유지됩니다.');
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    expect((await readWork()).chapters).toEqual(before.chapters);
    await settings.getByRole('button', { name: '챕터 삭제', exact: true }).click();
    await confirmation.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    const after = await readWork();
    expect(after.chapters.map((c) => [c.id, c.from])).toEqual([
      ['A', before.openings[0].id],
      ['C', 'A'],
      ['D', 'A'],
      ['E', 'C'],
      ['U', 'A'],
    ]);
    for (const chapter of after.chapters) {
      const original = before.chapters.find((c) => c.id === chapter.id)!;
      expect({ ...chapter, from: original.from }).toEqual(original);
    }
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(canvas.getByRole('button', { name: 'B 조건 1개', exact: true })).toBeVisible();
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    expect((await readWork()).chapters).toEqual(before.chapters);
    await page.getByRole('button', { name: '다시 실행', exact: true }).click();
    await expect(canvas.getByRole('button', { name: 'B 조건 1개', exact: true })).toHaveCount(0);
    await page.reload();
    await section(page, width, '시나리오');
    expect((await readWork()).chapters).toEqual(after.chapters);
    await canvas.getByRole('button', { name: 'A 조건 1개', exact: true }).click();
    await settings.getByRole('button', { name: '챕터 삭제', exact: true }).click();
    await expect(confirmation).toContainText('다음 챕터 3개가 이전 노드에 자동 연결됩니다.');
    await confirmation.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    expect((await readWork()).chapters.map((c) => [c.id, c.from])).toEqual([
      ['C', before.openings[0].id],
      ['D', before.openings[0].id],
      ['E', 'C'],
      ['U', before.openings[0].id],
    ]);
  });

  test(`챕터 모달 바깥 클릭·드래그 유지와 삭제 색상 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await section(page, width, '시나리오');
    const canvas = page.getByRole('application', { name: '시나리오 캔버스', exact: true });
    await canvas.getByRole('button', { name: '도입부 1 다음 챕터 추가', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const title = dialog.getByRole('textbox', { name: '제목', exact: true });
    await title.fill('드래그 선택 테스트');
    const inputBox = (await title.boundingBox())!;
    const dialogBox = (await dialog.boundingBox())!;
    const outside = { x: 1, y: 1 };
    expect(outside.x < dialogBox.x || outside.y < dialogBox.y).toBeTruthy();
    await page.mouse.move(inputBox.x + inputBox.width - 10, inputBox.y + inputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(outside.x, outside.y, { steps: 8 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await title.fill('챕터 1');
    await page.mouse.click(outside.x, outside.y);
    await expect(dialog).toBeVisible();
    await expect(title).toHaveValue('챕터 1');
    const remove = dialog.getByRole('button', { name: '챕터 삭제', exact: true });
    await expect(remove).toBeEnabled();
    for (const control of [remove, remove.locator('svg')])
      await expect(control).toHaveCSS('color', 'rgb(198, 72, 80)');
    await expect(remove).toHaveCSS('border-top-color', 'rgb(198, 72, 80)');
    await remove.hover();
    await expect(remove).toHaveCSS('color', 'rgb(198, 72, 80)');
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await canvas.getByRole('button', { name: '챕터 1 다음 챕터 추가', exact: true }).click();
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await canvas.getByRole('button', { name: '챕터 1 조건 0개', exact: true }).click();
    await expect(remove).toBeEnabled();
    await expect(remove).toHaveClass(/button--danger/);
    await remove.click();
    const confirmation = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: '챕터 삭제', exact: true }),
    });
    await expect(confirmation).toContainText('다음 챕터 1개가 이전 노드에 자동 연결됩니다.');
    await confirmation.getByRole('button', { name: '취소', exact: true }).click();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });

  test(`공통 상태값·강화 드롭다운과 저장 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await section(page, width, '상태창');
    const add = page.getByRole('button', { name: '상태값 추가', exact: true });
    await add.click();
    await page.getByRole('textbox', { name: '이름', exact: true }).fill('골드');
    await add.click();
    await page.getByRole('textbox', { name: '이름', exact: true }).last().fill('체력');
    await add.click();
    const choice = page.locator('.creator-card').last();
    await choice.getByRole('textbox', { name: '이름', exact: true }).fill('위치');
    await choice.getByRole('button', { name: '문자(객관식)', exact: true }).click();
    const option = choice.getByRole('textbox', { name: '선택지', exact: true });
    await option.fill('집');
    await option.press('Enter');
    await option.fill('정원');
    await option.press('Enter');
    const initial = choice.getByRole('combobox', { name: '초기값', exact: true });
    await initial.focus();
    await initial.press('ArrowDown');
    await initial.press('End');
    await initial.press('Enter');
    await expect(initial).toContainText('정원');
    await section(page, width, '아이템');
    await page.getByRole('button', { name: '아이템 추가', exact: true }).click();
    await page.getByRole('radio', { name: '강화 가능', exact: true }).check();
    const currency = page.getByRole('combobox', { name: '소모할 상태값', exact: true });
    const target = page.getByRole('combobox', { name: '강화할 상태값', exact: true });
    await currency.click();
    await expect(page.getByRole('option', { name: '위치', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: '골드', exact: true }).click();
    await select(page, target, '체력');
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await page.reload();
    await section(page, width, '아이템');
    await expect(currency).toContainText('골드');
    await expect(target).toContainText('체력');
    await section(page, width, '상태창');
    await expect(initial).toContainText('정원');
  });

  test(`선택 박스 일치 · 캔버스 툴바 · 엔딩 다음 노드 차단 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const tabs = page.locator('.editor-form .tab-pills');
    await section(page, width, '등장 캐릭터');
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await bold(tabs.locator('.selection-pill-label').last(), true);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(2);
    const characterHeight = (await tabs.locator('.selection-pill').first().boundingBox())!.height;
    await section(page, width, '도입부');
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    const openingName = (await tabs.locator('.selection-pill-label').last().innerText()).trim();
    await bold(tabs.locator('.selection-pill-label').last(), true);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(2);
    expect((await tabs.locator('.selection-pill').first().boundingBox())!.height).toBe(
      characterHeight,
    );
    await section(page, width, '시나리오');
    await tabs.getByRole('button', { name: openingName, exact: true }).click();
    await bold(tabs.locator('.selection-pill-label').last(), true);
    await bold(tabs.locator('.selection-pill-label').first(), false);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    expect((await tabs.locator('.selection-pill').first().boundingBox())!.height).toBe(
      characterHeight,
    );
    const canvas = page.getByRole('application', { name: '시나리오 캔버스', exact: true });
    const toolbar = canvas.locator('.graph-toolbar');
    const box = (await canvas.boundingBox())!,
      toolBox = (await toolbar.boundingBox())!;
    expect(toolBox.x - box.x).toBeCloseTo(12, 0);
    expect(toolBox.y - box.y).toBeCloseTo(12, 0);
    await expect(toolbar.getByRole('button', { name: /삭제/ })).toHaveCount(0);
    const world = canvas.locator('.scenario-world');
    const original = await world.getAttribute('style');
    await toolbar.getByRole('button', { name: '시나리오 확대', exact: true }).click();
    await expect(toolbar.locator('output')).toHaveText('110%');
    await toolbar.getByRole('button', { name: '시나리오 보기 초기화', exact: true }).click();
    await expect(world).toHaveAttribute('style', original!);
    await canvas
      .getByRole('button', { name: `${openingName} 다음 챕터 추가`, exact: true })
      .click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox', { name: '제목', exact: true }).fill('마지막 장면');
    await modal.getByRole('button', { name: '엔딩', exact: true }).click();
    await expect(modal.getByRole('switch', { name: '후일담 허용', exact: true })).toBeChecked();
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await expect(
      canvas.getByRole('button', { name: '마지막 장면 다음 챕터 추가', exact: true }),
    ).toHaveCount(0);
    const endingNode = canvas.locator('.scenario-node.ending');
    await endingNode.scrollIntoViewIfNeeded();
    const endingBox = (await endingNode.boundingBox())!;
    await page.mouse.move(endingBox.x + 2, endingBox.y + 2);
    expect(await endingNode.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgb(56, 56, 56)',
    );
    await page.mouse.click(endingBox.x + 2, endingBox.y + 2);
    await expect(modal.getByRole('textbox', { name: '제목', exact: true })).toHaveValue(
      '마지막 장면',
    );
    await modal.getByRole('switch', { name: '후일담 허용', exact: true }).click();
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await expect(
      canvas.getByRole('button', { name: '마지막 장면 다음 챕터 추가', exact: true }),
    ).toHaveCount(0);
    await canvas
      .getByRole('button', { name: `${openingName} 다음 챕터 추가`, exact: true })
      .click();
    await expect(modal.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('챕터 2');
    await modal.getByRole('combobox', { name: '이전 노드', exact: true }).click();
    await expect(page.getByRole('option', { name: '마지막 장면', exact: true })).toHaveCount(0);
    await modal.getByRole('combobox', { name: '이전 노드', exact: true }).press('Escape');
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await canvas.getByRole('button', { name: '챕터 2 다음 챕터 추가', exact: true }).click();
    await expect(modal.getByRole('textbox', { name: '제목', exact: true })).toHaveValue('챕터 3');
    await expect(modal.getByRole('combobox', { name: '이전 노드', exact: true })).toContainText(
      '챕터 2',
    );
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/screenshots/creator-controls-${width}.png` });
    await section(page, width, '추천 페르소나');
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await bold(tabs.locator('.selection-pill-label').last(), true);
    await bold(tabs.locator('.selection-pill-label').first(), false);
  });

  for (const afterstory of [true, false]) {
    test(`엔딩 후 입력 ${afterstory ? '허용' : '비활성화'} · 복원 (${width})`, async ({ page }) => {
      await start(page, width);
      const work = await page.evaluate(
        () =>
          new Promise<Work>((resolve, reject) => {
            const request = indexedDB.open('xenotale-v1');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const read = database
                .transaction('works', 'readonly')
                .objectStore('works')
                .get('example-garden');
              read.onsuccess = () => {
                database.close();
                resolve(read.result.work);
              };
              read.onerror = () => {
                database.close();
                reject(read.error);
              };
            };
          }),
      );
      work.id = `ending-fixture-${afterstory}`;
      work.title = `후일담 ${afterstory ? '허용' : '종료'}`;
      work.chapters = [
        { ...work.chapters[1], from: work.openings[0].id, conditions: [], afterstory },
      ];
      await page.locator('input[type=file]').setInputFiles({
        name: 'ending-work.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ kind: 'xenotale.work', schemaVersion: 2, work })),
      });
      await page.getByRole('button', { name: '가져오기', exact: true }).click();
      await page.getByRole('button', { name: `${work.title} 대화 시작`, exact: true }).click();
      if (width < 800) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
      await page
        .getByRole('button', { name: width < 800 ? '챕터' : '시나리오', exact: true })
        .click();
      await page.getByRole('button', { name: '챕터 이동', exact: true }).click();
      if (width < 800)
        await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
      const input = page.getByRole('textbox', { name: '메시지', exact: true });
      const send = page.getByRole('button', { name: '전송', exact: true });
      if (afterstory) {
        await expect(input).toBeEnabled();
        await expect(send).toBeEnabled();
        await input.fill('이야기 이후에도 대화');
        await send.click();
        await expect(page.locator('.conversation-turn')).toHaveCount(1);
      } else {
        await expect(input).toBeDisabled();
        await expect(send).toBeDisabled();
        await expect(input).toHaveAttribute(
          'placeholder',
          '이 이야기는 끝났습니다. 이전 대화에서 분기할 수 있습니다.',
        );
        await expect(page.locator('.conversation-turn')).toHaveCount(0);
      }
      await page.reload();
      if (afterstory) await expect(input).toBeEnabled();
      else await expect(input).toBeDisabled();
    });
  }
}
