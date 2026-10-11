import { test, expect, type Page } from '@playwright/test';

async function section(page: Page, width: number, name = '등장 캐릭터') {
  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
  await section(page, width);
}
async function confirm(page: Page, cancel = false) {
  const modal = page.getByRole('dialog').last();
  await modal.getByRole('button', { name: cancel ? '취소' : '삭제', exact: true }).click();
  await expect(modal).toHaveCount(0);
}
async function workspace(page: Page, seedReferences = false) {
  return page.evaluate(
    (seed) =>
      new Promise<any>((resolve, reject) => {
        const open = indexedDB.open('xenotale-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const tx = database.transaction('workspaces', seed ? 'readwrite' : 'readonly');
          const store = tx.objectStore('workspaces');
          const read = store.getAll();
          let entry: any;
          read.onsuccess = () => {
            entry = read.result[0];
            if (seed) {
              const target = entry.work.characters[1].id;
              entry.work.quality.viewpointActorId = target;
              entry.work.quality.viewpointTargetId = target;
              entry.work.relations = [
                { id: 'reference-relation', from: target, to: 'user', label: '친구' },
              ];
              entry.work.openings[0].presence.push(target);
              entry.work.media.characters.push({ characterId: target, code: '2' });
              entry.revision += 1;
              store.put(entry);
            }
          };
          tx.oncomplete = () => {
            database.close();
            resolve(entry.work);
          };
          tx.onerror = () => {
            database.close();
            reject(tx.error);
          };
        };
      }),
    seedReferences,
  );
}

for (const width of [1440, 393]) {
  test(`등장 캐릭터 선택·알약 삭제·프로필 배치·구분선 (${width})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page, width);
    const form = page.locator('.characters-form');
    const tabs = form.locator('.tab-pills');
    const name = form.getByRole('textbox', { name: /^이름/ });
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(form.getByRole('button', { name: '캐릭터 삭제', exact: true })).toHaveCount(0);
    await expect(form.getByRole('group', { name: '그룹', exact: true })).toHaveCount(0);
    await name.fill('첫 캐릭터');
    expect(
      await tabs
        .locator('.is-selected .selection-pill-label')
        .evaluate((e) => getComputedStyle(e).fontWeight),
    ).toBe('700');
    await tabs.locator('.is-selected .selection-pill-label').hover();
    expect(
      await tabs
        .locator('.is-selected .selection-pill-label')
        .evaluate((e) => getComputedStyle(e).color),
    ).toBe('rgb(34, 34, 34)');
    const image = await form
      .locator('.character-portrait .image-upload > button')
      .first()
      .boundingBox();
    const input = await name.boundingBox();
    expect(image!.x + image!.width).toBeLessThan(input!.x);
    expect(image!.width).toBeCloseTo(image!.height, 0);
    const identity = await form.locator('.character-identity').evaluate((e) => {
      const row = e.getBoundingClientRect();
      const fields = e.querySelectorAll('.character-identity-fields .field');
      const first = fields[0].getBoundingClientRect();
      const last = fields[1].getBoundingClientRect();
      return {
        gap: last.top - first.bottom,
        center: (first.top + last.bottom) / 2 - (row.top + row.bottom) / 2,
      };
    });
    expect(identity.gap).toBeCloseTo(20, 0);
    expect(identity.center).toBeCloseTo(0, 0);
    const spacing = await form.evaluate((e) => {
      const prompt = e.querySelector('.character-prompt textarea')!.getBoundingClientRect();
      const divider = e.querySelector('.character-lore-divider')!.getBoundingClientRect();
      const heading = e.querySelector('.character-lore-title')!.getBoundingClientRect();
      return {
        before: divider.top - prompt.bottom,
        after: heading.top - divider.bottom,
        overflow: e.scrollWidth - e.clientWidth,
      };
    });
    expect(spacing.before).toBeCloseTo(36, 0);
    expect(spacing.after).toBeCloseTo(36, 0);
    expect(spacing.overflow).toBeLessThan(2);
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(2);
    await tabs.getByRole('button', { name: '캐릭터 2 삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tabs.locator('.selection-pill')).toHaveCount(1);
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await name.fill('추가 캐릭터');
    await tabs.getByRole('button', { name: '첫 캐릭터', exact: true }).click();
    await tabs.getByRole('button', { name: '추가 캐릭터 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(name).toHaveValue('첫 캐릭터');
    await expect(tabs.locator('.selection-pill')).toHaveCount(2);
    await form.getByRole('button', { name: '캐릭터 그룹화', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: '추가', exact: true }).click();
    await modal.getByRole('textbox', { name: /^그룹 이름/ }).fill('그룹이름1');
    await modal.getByRole('button', { name: /추가 캐릭터/ }).click();
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    const group = form.locator('.group-filter');
    await group.getByRole('button', { name: '그룹이름1', exact: true }).click();
    await expect(name).toHaveValue('추가 캐릭터');
    // A group filter showing one character must not hide deletion if others exist.
    await expect(tabs.locator('.selection-pill')).toHaveCount(1);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(1);
    expect(
      await group
        .locator('.is-selected .selection-pill-label')
        .evaluate((e) => getComputedStyle(e).fontWeight),
    ).toBe('700');
    await page.screenshot({ path: `test-results/characters-group-${width}.png` });
    await group.getByRole('button', { name: '전체', exact: true }).click();
    await tabs.getByRole('button', { name: '첫 캐릭터', exact: true }).click();
    await page.screenshot({ path: `test-results/characters-all-${width}.png` });
    await group.getByRole('button', { name: '그룹이름1 그룹 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(name).toHaveValue('첫 캐릭터');
    await group.getByRole('button', { name: '그룹이름1', exact: true }).click();
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await expect(tabs.locator('.selection-pill')).toHaveCount(3);
    await expect(name).toHaveValue('');
    await tabs.getByRole('button', { name: '캐릭터 3 삭제', exact: true }).click();
    await group.getByRole('button', { name: '그룹이름1 그룹 삭제', exact: true }).click();
    await confirm(page);
    await expect(group).toHaveCount(0);
    await expect(tabs.locator('.selection-pill')).toHaveCount(2);
    await tabs.getByRole('button', { name: '추가 캐릭터 삭제', exact: true }).click();
    await confirm(page);
    await expect(name).toHaveValue('첫 캐릭터');
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    await page.reload();
    await section(page, width);
    await expect(name).toHaveValue('첫 캐릭터');
    await expect(form.locator('.group-filter')).toHaveCount(0);
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await name.fill('남길 캐릭터');
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(2);
    await tabs.getByRole('button', { name: '첫 캐릭터 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(tabs.locator('.selection-pill')).toHaveCount(2);
    await tabs.getByRole('button', { name: '첫 캐릭터 삭제', exact: true }).click();
    await confirm(page);
    await expect(name).toHaveValue('남길 캐릭터');
    await expect(tabs.locator('.selection-pill')).toHaveCount(1);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    await page.reload();
    await section(page, width);
    await expect(name).toHaveValue('남길 캐릭터');
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('캐릭터 X 삭제 시 관계·시점·도입부·미디어 연결 정리 유지', async ({ page }) => {
  await start(page, 1440);
  const form = page.locator('.characters-form');
  await form.getByRole('textbox', { name: /^이름/ }).fill('보존 캐릭터');
  await form.locator('.tab-pills').getByRole('button', { name: '추가', exact: true }).click();
  await form.getByRole('textbox', { name: /^이름/ }).fill('연결 캐릭터');
  await expect.poll(async () => (await workspace(page)).characters[1]?.name).toBe('연결 캐릭터');
  await workspace(page, true);
  await page.reload();
  await section(page, 1440);
  await form.getByRole('button', { name: '연결 캐릭터 삭제', exact: true }).click();
  await confirm(page);
  await expect.poll(async () => (await workspace(page)).characters.length).toBe(1);
  const saved = await workspace(page);
  expect(saved.characters[0].name).toBe('보존 캐릭터');
  expect(saved.quality.viewpointActorId).toBe('user');
  expect(saved.quality.viewpointTargetId).toBe('user');
  expect(saved.relations).toEqual([]);
  expect(saved.openings[0].presence).toEqual([saved.characters[0].id]);
  expect(saved.media.characters).toEqual([]);
});
