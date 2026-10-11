import { test, expect, type Page } from '@playwright/test';

function sectionControl(page: Page, width: number, name: string) {
  return width < 800
    ? page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false })
    : page.locator('.editor-nav').getByRole('button', { name, exact: false });
}

async function selected(page: Page, width: number, name: string) {
  const control = sectionControl(page, width, name);
  if (width < 800) await expect(control).toHaveAttribute('aria-selected', 'true');
  else await expect(control).toHaveClass('active');
}

for (const width of [1440, 393]) {
  test(`last creator section survives reload and reopening, separately per workspace (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/create\/[^/]+$/);
    await selected(page, width, '작품 개요');
    const firstUrl = page.url();
    const firstId = new URL(firstUrl).hash.split('/')[2];
    for (const name of ['관계도', '상태창', '플레이가이드']) {
      await sectionControl(page, width, name).click();
      await selected(page, width, name);
      await page.reload();
      await selected(page, width, name);
    }
    await page.goto('/#/');
    await page.goto(firstUrl);
    await selected(page, width, '플레이가이드');
    // Create a separate workspace in this isolated test database only.
    const secondId = await page.evaluate(
      (firstId) =>
        new Promise<string>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('workspaces', 'readwrite');
            const store = transaction.objectStore('workspaces');
            const read = store.get(firstId);
            const secondId = crypto.randomUUID();
            read.onsuccess = () => {
              const record = structuredClone(read.result);
              record.id = secondId;
              record.work.id = crypto.randomUUID();
              store.add(record);
            };
            transaction.oncomplete = () => {
              db.close();
              resolve(secondId);
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
      firstId,
    );
    const secondUrl = `/#/create/${secondId}`;
    await page.goto(secondUrl);
    await selected(page, width, '작품 개요');
    await sectionControl(page, width, '미디어').click();
    await page.reload();
    await selected(page, width, '미디어');
    await page.goto(firstUrl);
    await selected(page, width, '플레이가이드');
    // Unknown/removed section preferences recover to a valid screen.
    await page.evaluate((firstId) => {
      localStorage.setItem(`xenotale.editor-section.${firstId}`, 'removed-section');
    }, firstId);
    await page.reload();
    await selected(page, width, '작품 개요');
    await page.goto(secondUrl);
    await selected(page, width, '미디어');
    expect(errors).toEqual([]);
  });
}
