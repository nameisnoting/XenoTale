import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`기본/고급 제작 흐름·숫자/계산식·표식 자동연출 ${width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    const role = width < 800 ? 'tab' : 'button';
    for (const name of ['추천 페르소나', '단축어'])
      await expect(nav.getByRole(role, { name, exact: true })).toBeVisible();
    await expect(nav.getByRole(role, { name: '상태값', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '로어북 추가', exact: true }).click();
    const lore = page.locator('.overview-form .creator-card').first();
    await expect(lore.getByRole('radio')).toHaveCount(2);
    await lore.getByRole('radio', { name: '항상 전달', exact: true }).click();
    await expect(lore.getByPlaceholder('키워드 입력 후 Enter')).toHaveCount(0);
    await nav.getByRole('button', { name: '고급설정', exact: true }).click();
    await nav.getByRole(role, { name: '상태값', exact: true }).click();
    await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
    await page.getByRole('textbox', { name: '이름', exact: true }).fill('HP');
    await page
      .locator('.creator-sticky-tabs')
      .getByRole('tab', { name: '세부규칙', exact: true })
      .click();
    await page.getByRole('button', { name: '규칙 추가', exact: true }).click();
    await page.getByRole('button', { name: '작업 추가', exact: true }).click();
    await expect(page.getByRole('radio', { name: '숫자 입력', exact: true })).toBeChecked();
    await page.getByRole('spinbutton', { name: '변경할 값', exact: true }).fill('20');
    await page.getByRole('radio', { name: '계산식 사용', exact: true }).click();
    await page.getByRole('textbox', { name: '계산식', exact: true }).fill('{{HP}} * 0.1');
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    await expect(nav.getByRole('button', { name: '고급설정', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByRole('radio', { name: '계산식 사용', exact: true })).toBeChecked();
    await expect(page.getByRole('textbox', { name: '계산식', exact: true })).toHaveValue(
      '{{HP}} * 0.1',
    );
    await page.getByRole('radio', { name: '숫자 입력', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '변경할 값', exact: true })).toHaveValue('0');
    await nav.getByRole(role, { name: '연출', exact: true }).click();
    await page.getByRole('button', { name: '자동연출 추가', exact: true }).click();
    await expect(page.getByRole('radio', { name: '표식 찾기', exact: true })).toBeChecked();
    await expect(page.getByRole('textbox', { name: '옵션', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: '찾을 표식', exact: true }).fill('회복+20');
    await page
      .getByRole('textbox', { name: '무엇으로 보여줄까요?', exact: true })
      .fill('❤️ 회복 완료');
    await page.getByRole('switch', { name: '사용', exact: true }).click();
    await page.getByRole('radio', { name: '정규식', exact: true }).click();
    const pattern = await page
      .getByRole('textbox', { name: '찾을 정규식', exact: true })
      .inputValue();
    expect(new RegExp(pattern, 'g').test('{{회복+20}}')).toBe(true);
    await page.getByRole('radio', { name: '표식 찾기', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '찾을 표식', exact: true })).toHaveValue(
      '회복+20',
    );
    await page.getByText('저장완료', { exact: true }).waitFor();
    const workspaceId = new URL(page.url()).hash.split('/').at(-1)!;
    await page.reload();
    await expect(page.getByRole('textbox', { name: '찾을 표식', exact: true })).toHaveValue(
      '회복+20',
    );
    await page.screenshot({ path: `docs/screenshots/simple-effects-${width}.png`, fullPage: true });
    const rules = await page.evaluate(
      (key) =>
        new Promise<any[]>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction('workspaces').objectStore('workspaces').get(key);
            get.onsuccess = () => {
              db.close();
              resolve(get.result.work.displayRules);
            };
            get.onerror = () => reject(get.error);
          };
        }),
      workspaceId,
    );
    await page.goto('/#/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.assistant-section')).toBeVisible();
    await page.evaluate(
      (rules) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              tx = db.transaction('rooms', 'readwrite'),
              store = tx.objectStore('rooms'),
              get = store.getAll();
            get.onsuccess = () => {
              const room = get.result.at(-1);
              room.work.displayRules = rules;
              for (const event of room.timeline)
                for (const candidate of event.candidates ?? [])
                  candidate.body = '전 {{회복+20}} 후 {{회복+20}}';
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
      rules,
    );
    await page.reload();
    await expect(page.locator('.assistant-section')).toContainText(
      '전 ❤️ 회복 완료 후 ❤️ 회복 완료',
    );
    await expect(page.locator('.assistant-section')).not.toContainText('{{회복+20}}');
    expect(errors).toEqual([]);
  });
}
