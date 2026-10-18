import { test, expect } from '@playwright/test';
for (const width of [1440, 393])
  test(`행동 편집·수량 소비·회복·저장 복원 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.getByText('저장완료', { exact: true }).waitFor();
    const work = await page.evaluate(
      () =>
        new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction('workspaces').objectStore('workspaces').getAll();
            get.onsuccess = () => {
              db.close();
              resolve(get.result[0].work);
            };
            get.onerror = () => reject(get.error);
          };
        }),
    );
    Object.assign(work, {
      title: '행동 테스트',
      prompt: '작품 설정',
      characters: [],
      lore: [],
      chapters: [],
      items: [
        {
          id: 'potion',
          name: '회복약',
          image: '',
          owned: true,
          quantity: 2,
          prompt: '회복약',
          enhancement: null,
        },
      ],
      statuses: [
        {
          id: 'hp',
          name: 'HP',
          type: 'number',
          initial: 30,
          min: 0,
          max: 100,
          unit: '',
          options: [],
          prompt: '',
        },
      ],
      actions: [
        {
          id: 'heal',
          name: '회복약 사용',
          trigger: 'button',
          mode: 'all',
          conditions: [{ id: 'q', kind: 'quantity', ref: 'potion', op: 'gte', value: 1 }],
          steps: [
            { kind: 'consume', target: 'potion', value: '1' },
            { kind: 'add', target: 'hp', value: '20' },
          ],
        },
      ],
    });
    work.openings[0].body = '행동을 시험합니다.';
    work.openings[0].presence = [];
    await page.locator('input[accept*=".charx"]').setInputFiles({
      name: '행동.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ kind: 'xenotale.work', schemaVersion: 2, work })),
    });
    await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    await nav.getByRole('button', { name: '추가 요소', exact: false }).click();
    await nav.getByRole(width < 800 ? 'tab' : 'button', { name: '규칙', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '행동 이름', exact: true })).toHaveValue(
      '회복약 사용',
    );
    await page.getByRole('textbox', { name: '값·계산식', exact: true }).nth(1).fill('25');
    await page.getByText('저장완료', { exact: true }).waitFor();
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await page
      .locator('.creator-test')
      .getByRole('button', { name: '회복약 사용', exact: true })
      .click();
    async function current() {
      return page.evaluate(
        () =>
          new Promise<any>((resolve, reject) => {
            const req = indexedDB.open('xenotale-v1');
            req.onsuccess = () => {
              const db = req.result,
                get = db.transaction('workspaces').objectStore('workspaces').getAll();
              get.onsuccess = () => {
                db.close();
                resolve(
                  get.result.find((w: any) => w.work.title === '행동 테스트').testRoom?.current
                    .runtime,
                );
              };
              get.onerror = () => reject(get.error);
            };
          }),
      );
    }
    await expect.poll(async () => (await current())?.status.hp).toBe(55);
    expect((await current()).inventory.potion.quantity).toBe(1);
    await page.reload();
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await page
      .locator('.creator-test')
      .getByRole('button', { name: '회복약 사용', exact: true })
      .click();
    await expect.poll(async () => (await current())?.status.hp).toBe(80);
    await expect(
      page.locator('.creator-test').getByRole('button', { name: '회복약 사용', exact: true }),
    ).toBeDisabled();
  });
