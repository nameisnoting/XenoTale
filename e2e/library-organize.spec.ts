import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const output = 'docs/screenshots/library-organize';
async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.context().route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('xenotale-v1');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['profiles', 'works', 'rooms'], 'readwrite');
      const profiles = tx.objectStore('profiles'),
        works = tx.objectStore('works'),
        rooms = tx.objectStore('rooms');
      const profile = profiles.get('profile');
      profile.onsuccess = () => {
        const value = profile.result;
        value.carousels = [
          { id: 'a', name: '첫 캐러셀', mode: 'slide', workIds: ['one'] },
          { id: 'b', name: '둘째 캐러셀', mode: 'slide', workIds: ['one'] },
        ];
        value.carouselOrder = ['a', 'b', 'library-examples'];
        profiles.put(value);
      };
      const example = works.get('example-garden');
      example.onsuccess = () => {
        for (let i = 0; i < 8; i++) {
          const entry = structuredClone(example.result);
          entry.id = i ? `work-${i}` : 'one';
          entry.work.id = entry.id;
          entry.work.title = i ? `추가 작품 ${i}` : '같은 작품';
          works.put(entry);
        }
      };
      const room = rooms.getAll();
      room.onsuccess = () => {
        rooms.clear();
        for (let i = 0; i < 3; i++) {
          const entry = structuredClone(room.result[0]);
          entry.id = `room-${i}`;
          entry.name = `대화방 ${i + 1}`;
          rooms.put(entry);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  // Native IndexedDB fixture writes bypass Dexie's change notifications.
  await page.reload();
  await fs.mkdir(output, { recursive: true });
  await expect(page.locator('[data-carousel-id="a"]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('xenotale-v1');
      r.onsuccess = () => resolve(r.result);
    });
    return await new Promise<{ profile: any; works: any[]; rooms: any[] }>((resolve) => {
      const tx = db.transaction(['profiles', 'works', 'rooms'], 'readonly');
      const profile = tx.objectStore('profiles').get('profile'),
        works = tx.objectStore('works').getAll(),
        rooms = tx.objectStore('rooms').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve({ profile: profile.result, works: works.result, rooms: rooms.result });
      };
    });
  });
}
for (const width of [1440, 393]) {
  test(`캐러셀 메뉴 단일 표시·스크롤 밖 표시·작품 이동·추가·캐러셀 삭제 (${width})`, async ({
    page,
  }) => {
    await setup(page, width);
    const first = page.locator('[data-carousel-id="a"]'),
      second = page.locator('[data-carousel-id="b"]');
    const trigger = first.getByRole('button', { name: '같은 작품 메뉴', exact: true });
    await trigger.click();
    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(
      second.getByRole('button', { name: '같은 작품 메뉴', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    const menu = page.getByRole('menu');
    expect(await menu.evaluate((e) => e.parentElement === document.body)).toBe(true);
    await expect(menu.getByRole('menuitem', { name: '작품 삭제', exact: true })).toBeVisible();
    await page.screenshot({ path: `${output}/work-menu-${width}.png` });
    await second.getByRole('button', { name: '같은 작품 메뉴', exact: true }).click();
    await expect(menu).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    if (width === 1440) {
      await first.locator('.work-card').dragTo(second.locator('.collection-heading'));
    } else {
      const transfer = await page.evaluateHandle(() => {
        const data = new DataTransfer();
        data.setData('workId', 'one');
        return data;
      });
      await second.dispatchEvent('drop', { dataTransfer: transfer });
    }
    await expect(first.locator('.work-card')).toHaveCount(0);
    await expect(second.locator('.work-card')).toHaveCount(1);
    const before = await stored(page);
    expect(before.works).toHaveLength(9);
    await second.getByRole('button', { name: '작품 추가', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('작품 추가');
    await expect(dialog.getByRole('button', { name: '완료', exact: true })).toBeDisabled();
    await page.screenshot({ path: `${output}/work-picker-${width}.png` });
    await dialog.getByRole('textbox', { name: '작품 검색', exact: true }).fill('추가 작품 1');
    await expect(dialog.locator('.work-card')).toHaveCount(1);
    await dialog.getByRole('button', { name: '추가 작품 1 선택', exact: true }).click();
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(second.locator('.work-card')).toHaveCount(2);
    await second.getByRole('button', { name: '둘째 캐러셀 캐러셀 삭제', exact: true }).click();
    await expect(dialog).toContainText('작품과 대화방은 유지');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(second).toBeVisible();
    await second.getByRole('button', { name: '둘째 캐러셀 캐러셀 삭제', exact: true }).click();
    await dialog.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(second).toHaveCount(0);
    const after = await stored(page);
    expect(after.works).toEqual(before.works);
    expect(after.rooms).toEqual(before.rooms);
    expect(after.profile.carouselOrder).not.toContain('b');
    await page.reload();
    await expect(page.locator('[data-carousel-id="b"]')).toHaveCount(0);
  });
  test(`폴더 생성·대화 선택·고정·이름 변경·이동·삭제 후 대화 보존 (${width})`, async ({ page }) => {
    await setup(page, width);
    if (width < 800) await page.getByRole('button', { name: '대화목록', exact: true }).click();
    await page.getByRole('button', { name: '폴더 생성', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '완료', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox', { name: '제목', exact: true }).fill('여행');
    await dialog.getByRole('button', { name: '대화방 1 선택', exact: true }).click();
    await dialog.getByRole('button', { name: '대화방 2 선택', exact: true }).click();
    await page.screenshot({ path: `${output}/folder-create-${width}.png` });
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.folder-list-text').filter({ hasText: '여행' })).toContainText(
      '대화방 2개',
    );
    await page.getByRole('button', { name: '여행 폴더 메뉴', exact: true }).click();
    await page.screenshot({ path: `${output}/folder-menu-${width}.png` });
    await page.getByRole('menuitem', { name: '상단 고정', exact: true }).click();
    expect((await stored(page)).profile.folders[0].pinned).toBe(true);
    await page.getByRole('button', { name: '여행 폴더 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '이름 변경', exact: true }).click();
    await dialog.getByRole('textbox', { name: '제목', exact: true }).fill('여행 수정');
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '여행 수정 폴더 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '대화방 추가', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: '대화방 1 선택', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: '대화방 3 선택', exact: true }).click();
    await dialog.getByRole('button', { name: '완료', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const before = await stored(page);
    await page.getByRole('button', { name: '여행 수정 폴더 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '폴더 삭제', exact: true }).click();
    await expect(dialog).toContainText('일반 목록으로 돌아갑니다');
    await dialog.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const after = await stored(page);
    expect(after.profile.folders).toHaveLength(0);
    expect(after.rooms).toHaveLength(3);
    expect(after.rooms.every((r) => r.folderId === null)).toBe(true);
    expect(after.rooms.map((r) => r.timeline)).toEqual(before.rooms.map((r) => r.timeline));
    await expect(page.locator('.room-list-item')).toHaveCount(3);
  });
}
