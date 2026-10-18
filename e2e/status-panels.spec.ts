import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`여러 상태창 제작·공유 값·저장 복원·소설/VN 렌더링 ${width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    await nav.getByRole('button', { name: '추가 요소', exact: false }).click();
    await nav.getByRole(width < 800 ? 'tab' : 'button', { name: '상태 규칙', exact: true }).click();
    await expect(
      nav.getByRole(width < 800 ? 'tab' : 'button', { name: '규칙', exact: true }),
    ).toHaveCount(0);
    for (const [index, name, value] of [
      [0, 'HP', '30'],
      [1, 'MP', '10'],
    ] as const) {
      await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
      const card = page
        .getByRole('tabpanel', { name: '상태값', exact: true })
        .locator('.creator-card')
        .nth(index);
      await card.getByRole('textbox', { name: '이름', exact: true }).fill(name);
      await card.getByRole('spinbutton', { name: '초기값', exact: true }).fill(value);
    }
    await page.getByRole('tab', { name: '표시할 상태창', exact: true }).click();
    const cards = page.locator('.status-panel-editor');
    await cards.first().getByRole('textbox', { name: '상태창 이름', exact: true }).fill('전투');
    await cards.first().getByRole('button', { name: 'MP', exact: true }).click();
    await cards.first().getByRole('button', { name: '예시 마크다운', exact: true }).click();
    await page.getByRole('button', { name: '상태창 추가', exact: true }).click();
    await cards.nth(1).getByRole('textbox', { name: '상태창 이름', exact: true }).fill('자원');
    await cards.nth(1).getByRole('button', { name: 'HP', exact: true }).click();
    await cards.nth(1).getByRole('button', { name: 'MP', exact: true }).click();
    await expect(cards.nth(1).getByRole('textbox', { name: '문법 입력', exact: true })).toHaveValue(
      '{{HP}}\n{{MP}}',
    );
    await cards
      .nth(1)
      .getByRole('textbox', { name: '문법 입력', exact: true })
      .fill('HP = {{HP}} / MP = {{MP}}');
    await cards.nth(1).getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(cards.nth(1).locator('.status-preview')).toContainText('HP = 30 / MP = 10');
    await expect(cards.first()).toHaveCSS('padding', '16px');
    await expect(cards.first().locator('.disclosure-body').first()).toHaveCSS('gap', '16px');
    await expect(cards.first().locator('.field').first()).toHaveCSS('gap', '8px');
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    const workspaceId = new URL(page.url()).hash.split('/').at(-1)!;
    await page.reload();
    await page.getByRole('tab', { name: '표시할 상태창', exact: true }).click();
    await expect(cards).toHaveCount(2);
    await expect(
      cards.first().getByRole('textbox', { name: '상태창 이름', exact: true }),
    ).toHaveValue('전투');
    await expect(cards.nth(1).getByRole('textbox', { name: '문법 입력', exact: true })).toHaveValue(
      'HP = {{HP}} / MP = {{MP}}',
    );
    const work = await page.evaluate(
      (key) =>
        new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction('workspaces').objectStore('workspaces').get(key);
            get.onsuccess = () => {
              db.close();
              resolve(get.result.work);
            };
            get.onerror = () => reject(get.error);
          };
        }),
      workspaceId,
    );
    expect(work.statuses).toHaveLength(2);
    expect(work.statusPanels[0].statusIds).toEqual([work.statuses[0].id]);
    expect(work.statusPanels[1].statusIds).toEqual(work.statuses.map((s: any) => s.id));
    await page.screenshot({ path: `docs/screenshots/state-rules-${width}.png`, fullPage: true });

    // Render the authored panels against a saved response checkpoint, without a paid API request.
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.assistant-section .status-display')).toBeVisible();
    await page.evaluate(
      (draft) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              tx = db.transaction('rooms', 'readwrite'),
              store = tx.objectStore('rooms'),
              get = store.getAll();
            get.onsuccess = () => {
              const room = get.result.at(-1);
              room.work = { ...draft, statusTemplate: 'LEGACY_SHOULD_NOT_SHOW' };
              room.openingId = draft.openings[0].id;
              const setValues = (checkpoint: any) => {
                checkpoint.runtime.status = {
                  [draft.statuses[0].id]: 55,
                  [draft.statuses[1].id]: 10,
                };
                checkpoint.runtime.nodeId = room.openingId;
              };
              setValues(room.initial);
              setValues(room.current);
              for (const event of room.timeline) {
                setValues(event.before);
                for (const candidate of event.candidates ?? []) {
                  setValues(candidate.checkpoint);
                  candidate.usage.model = 'fixture';
                }
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
        }),
      work,
    );
    await page.reload();
    const panels = page.locator('.assistant-section .status-display');
    await expect(panels).toHaveCount(2);
    await expect(panels.first()).toContainText('HP: 55');
    await expect(panels.first()).not.toContainText('MP');
    await expect(panels.nth(1)).toContainText('HP = 55 / MP = 10');
    await expect(page.getByText('LEGACY_SHOULD_NOT_SHOW')).toHaveCount(0);
    await panels.first().getByLabel('전투 접기/펼치기', { exact: true }).click();
    await expect(panels.first().locator('.status-content')).toBeHidden();
    await expect(panels.nth(1).locator('.status-content')).toBeVisible();
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
    await page.getByRole('button', { name: '상태창 보기', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: '상태창', exact: true });
    await expect(overlay.locator('.status-display')).toHaveCount(2);
    await expect(overlay).toContainText('HP: 55');
    await expect(overlay).toContainText('HP = 55 / MP = 10');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}
