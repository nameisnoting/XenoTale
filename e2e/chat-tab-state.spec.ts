import { test, expect, type Page } from '@playwright/test';

async function section(page: Page, panel: 'info' | 'memory' | 'gallery' | 'notes') {
  const mobile = page.viewportSize()!.width <= 800;
  if (mobile) {
    if (page.url().includes('/panel/'))
      await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  }
  const names = mobile
    ? { info: '작품정보', memory: '기억 관리', gallery: '갤러리', notes: '유저노트' }
    : { info: '작품정보', memory: '기억관리', gallery: '미디어', notes: '유저노트' };
  await page.getByRole('button', { name: names[panel], exact: true }).click();
}

for (const width of [1440, 1000, 393]) {
  test(`작품·기억·미디어 탭 유지와 화면 전환 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.route('**/tab-fixture/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
      }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('xenotale-v1');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const database = open.result;
            const transaction = database.transaction('rooms', 'readwrite');
            const store = transaction.objectStore('rooms');
            const read = store.getAll();
            read.onsuccess = () => {
              const room = read.result[0];
              room.work.characters.push({
                ...structuredClone(room.work.characters[0]),
                id: 'bera',
                name: '베라',
              });
              room.work.media = {
                ...room.work.media,
                template: '/tab-fixture/{{char_code}}-{{situation_code}}.svg',
                characters: [
                  { code: '1', characterId: room.work.characters[0].id },
                  { code: '2', characterId: 'bera' },
                ],
                situations: [{ code: '0', name: '기본' }],
              };
              room.revision++;
              store.put(room);
            };
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
          };
        }),
    );
    await page.reload();
    await section(page, 'info');
    await page.getByRole('tab', { name: '플레이 가이드', exact: true }).click();
    await section(page, 'notes');
    await section(page, 'info');
    await expect(page.getByRole('tab', { name: '플레이 가이드', exact: true })).toHaveAttribute(
      'aria-selected',
      width > 800 ? 'true' : 'false',
    );
    if (width > 800) await expect(page.locator('.work-guide')).toBeVisible();
    else
      await expect(page.getByRole('tab', { name: '작품', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    await page.getByRole('tab', { name: '작품', exact: true }).click();
    await page.getByRole('button', { name: '캐릭터', exact: true }).click();
    await page.getByRole('button', { name: '베라', exact: true }).click();
    await section(page, 'memory');
    await page.getByRole('tab', { name: '장기요약', exact: true }).click();
    await section(page, 'gallery');
    await page.getByRole('button', { name: '베라', exact: true }).click();
    await section(page, 'notes');
    await section(page, 'memory');
    await expect(page.getByRole('tab', { name: '장기요약', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
    await section(page, 'gallery');
    await expect(page.getByRole('button', { name: '베라', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.chat-gallery img')).toHaveAttribute('src', '/tab-fixture/2-0.svg');
    await section(page, 'info');
    await expect(page.getByRole('button', { name: '캐릭터', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: '베라', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.work-info-byline h3')).toHaveText('베라');
    await section(page, 'memory');
    await expect(page.getByRole('tab', { name: '요약 설정', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    if (width > 800) {
      await page.getByRole('button', { name: '대화 기능 접기', exact: true }).click();
      await expect(page.getByRole('tab', { name: '요약 설정', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '대화 기능 펼치기', exact: true }).click();
      await expect(page.getByRole('tab', { name: '요약 설정', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
    // Moving the panel between desktop and mobile surfaces must keep its selection.
    if (page.url().includes('/panel/'))
      await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
    await page.setViewportSize({ width: width > 800 ? 393 : 1440, height: 1000 });
    await section(page, 'memory');
    await expect(page.getByRole('tab', { name: '요약 설정', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await section(page, 'gallery');
    await expect(page.getByRole('button', { name: '베라', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await section(page, 'info');
    await expect(page.getByRole('button', { name: '베라', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
}
