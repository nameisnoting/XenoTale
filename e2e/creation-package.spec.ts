import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: /^제목/ })).toBeVisible();
}
async function section(page: Page, width: number, name: string) {
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  if (!(await nav.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).count()))
    await nav.getByRole('button', { name: '고급설정', exact: false }).click();
  await nav.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).click();
}
for (const width of [1440, 393])
  test(`선택 캐릭터·기본 UI·접힌 고급설정·관계도 토글 ${width}`, async ({ page }) => {
    await start(page, width);
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    await expect(
      nav.getByRole(width < 800 ? 'tab' : 'button', { name: '등장 캐릭터', exact: true }),
    ).toBeVisible();
    await expect(nav.getByText('대화방 UI', { exact: true })).toHaveCount(0);
    await expect(nav.getByText('플레이가이드', { exact: true })).toHaveCount(0);
    await expect(nav.getByText('추천 페르소나', { exact: true })).toBeVisible();
    await expect(nav.getByText('단축어', { exact: true })).toBeVisible();
    await expect(nav.getByText('상태값', { exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: /^제목/ }).fill('캐릭터 없는 작품');
    await page
      .getByRole('textbox', { name: /^프롬프트/ })
      .fill('주인공과 세계는 이 프롬프트로 설정합니다.');
    await page.getByRole('radio', { name: '비주얼노벨', exact: true }).click();
    await section(page, width, '도입부');
    await page.getByRole('textbox', { name: /^내용/ }).fill('이야기가 시작됩니다.');
    await expect(page.getByRole('button', { name: '제작완료', exact: true })).toBeEnabled();
    await section(page, width, '관계도');
    await expect(page.getByRole('switch', { name: '관계도 사용', exact: true })).not.toBeChecked();
    await expect(page.locator('.optional-feature')).toHaveCount(0);
    await page.getByRole('switch', { name: '관계도 사용', exact: true }).click();
    await expect(page.locator('.optional-feature')).toBeVisible();
    await page.screenshot({ path: `test-results/creation-options-${width}.png` });
  });

test('직접 이미지 · xeno 내보내기/가져오기 · 빈 캐릭터 제외', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      value: {
        setConsumer: (consumer: unknown) => {
          (window as any).__xenoFileConsumer = consumer;
        },
      },
    }),
  );
  await start(page);
  const original = await page.evaluate(
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
  original.defaultUi = 'visual-novel';
  original.prompt = '작품의 세계관과 등장인물 설정입니다.';
  original.openings[0].body = '시작합니다.';
  original.title = '내장 이미지 작품';
  original.characters = [];
  original.relations = [];
  original.cover = '';
  original.openings[0].presence = [];
  await page.locator('input[accept*=".charx"]').setInputFiles({
    name: '작품.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ kind: 'xenotale.work', schemaVersion: 2, work: original }),
    ),
  });
  await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^제목/ })).toHaveValue('내장 이미지 작품');
  await section(page, 1440, '미디어');
  await page.locator('.local-media input[type=file]').setInputFiles('public/artwork.png');
  await expect(page.locator('.local-media-grid img')).toBeVisible();
  await expect(page.locator('.local-media-usage')).toContainText('1개');
  await page.getByRole('textbox', { name: 'artwork 이미지 이름', exact: true }).fill('웃음');
  await section(page, 1440, '도입부');
  await page.getByRole('textbox', { name: /^내용/ }).fill('{{웃음}}\n@안내인: 시작합니다.');
  await page.getByText('저장완료', { exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '작품 파일 내보내기', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xeno$/);
  await download.saveAs('.test-tmp/roundtrip.xeno');
  expect((await fs.readFile('.test-tmp/roundtrip.xeno')).subarray(0, 2).toString()).toBe('PK');
  await page.locator('input[accept*=".charx"]').setInputFiles('.test-tmp/roundtrip.xeno');
  await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
  await section(page, 1440, '미디어');
  await expect(page.locator('.local-media-grid img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('textbox', { name: '웃음 이미지 이름', exact: true })).toHaveValue(
    '웃음',
  );
  await page.reload();
  await section(page, 1440, '미디어');
  await expect(page.locator('.local-media-grid img')).toHaveJSProperty('naturalWidth', 480);
  const fileBytes = Array.from(await fs.readFile('.test-tmp/roundtrip.xeno'));
  await page.evaluate(async (bytes) => {
    await (window as any).__xenoFileConsumer({
      files: [{ getFile: async () => new File([new Uint8Array(bytes)], '작품.xeno') }],
    });
  }, fileBytes);
  await expect(page.locator('.visual-novel')).toBeVisible();
  await expect(page.locator('.visual-novel-image')).toHaveJSProperty('naturalWidth', 480);
});

test('자동연출의 HTML·SVG·버튼 스크립트는 격리 실행하고 원문은 유지', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('rooms', 'readwrite'),
            store = tx.objectStore('rooms'),
            get = store.getAll();
          get.onsuccess = () => {
            const room = get.result.at(-1);
            room.work.openings[0].body =
              '[상태\n\n창]<button id="raw" onclick="this.textContent=\'실행됨\'">원문 버튼</button>';
            room.work.displayRules = [
              {
                id: 'display',
                name: '설정창',
                pattern: '\\[상태\\s+창\\]',
                flags: 'g',
                enabled: true,
                replacement:
                  '<div><svg width="20" height="20"><circle cx="10" cy="10" r="9" fill="red"/></svg><button onclick="this.textContent=\'전사 선택됨\'">전사 선택</button></div>',
              },
            ];
            room.revision++;
            store.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const frame = page.frameLocator('iframe.story-html').first();
  await expect(frame.locator('svg')).toBeVisible();
  await frame.getByRole('button', { name: '전사 선택', exact: true }).click();
  await expect(frame.getByRole('button', { name: '전사 선택됨', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '원문 버튼', exact: true }).click();
  await expect(frame.locator('#raw')).toHaveText('원문 버튼');
  expect(
    await frame.locator('body').evaluate(() => {
      try {
        return parent.document.body.innerText;
      } catch {
        return 'isolated';
      }
    }),
  ).toBe('isolated');
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
});

test('관계도 내면 해금·재잠금과 미사용 메뉴 숨김', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
  const roomUrl = page.url();
  const update = async (enabled: boolean, owned: boolean) =>
    page.evaluate(
      ({ enabled, owned }) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction('rooms', 'readwrite');
            const store = tx.objectStore('rooms');
            const read = store.getAll();
            read.onsuccess = () => {
              const room = read.result.at(-1);
              room.work.relationsEnabled = enabled;
              room.work.relationSplit = true;
              room.work.innerUnlock = {
                mode: 'all',
                conditions: [{ id: 'key', kind: 'item', ref: 'key', op: 'eq', value: true }],
              };
              room.work.relations[0].innerLabel = '숨겨진 내면';
              room.current.runtime.innerRelationships = { 'aria-user': '숨겨진 내면' };
              room.current.runtime.inventory.key.owned = owned;
              room.revision++;
              store.put(room);
            };
            tx.oncomplete = () => {
              database.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      { enabled, owned },
    );
  await update(true, false);
  await page.goto(`${roomUrl}/panel/relations`);
  await expect(page.locator('.relationship-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '내면으로', exact: true })).toHaveCount(0);
  await expect(page.getByText('숨겨진 내면', { exact: true })).toHaveCount(0);
  await update(true, true);
  await page.reload();
  await page.getByRole('button', { name: '내면으로', exact: true }).click();
  await expect(page.getByRole('button', { name: '표면으로', exact: true })).toBeVisible();
  await update(true, false);
  await page.reload();
  await expect(page.getByRole('button', { name: '내면으로', exact: true })).toHaveCount(0);
  await expect(page.getByText('숨겨진 내면', { exact: true })).toHaveCount(0);
  await update(false, false);
  await page.reload();
  await expect(page.getByRole('button', { name: '관계도', exact: true })).toHaveCount(0);
  await expect(page.locator('.relationship-canvas')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '작품', exact: true })).toBeVisible();
});
