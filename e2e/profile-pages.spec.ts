import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function stored(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('xenotale-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<any>((resolve, reject) => {
      const transaction = database.transaction('profiles', 'readonly');
      const request = transaction.objectStore('profiles').get('profile');
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

for (const width of [1440, 393]) {
  test(`마이 라이브러리 페이지 · 동일 여백 · 새로고침 · 편집과 뒤로 가기 (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.goto('/#/profile');
    const github = page.getByRole('link', { name: '개발자 GitHub', exact: true });
    for (const row of [
      github,
      page.getByRole('button', { name: '공지사항', exact: true }),
      page.getByRole('button', { name: '마이 캐릭터', exact: true }),
    ]) {
      await expect(row).toHaveCSS('font-size', '16px');
      await expect(row).toHaveCSS('border-bottom-width', '0px');
      await expect(row).toHaveCSS('padding-top', '16px');
    }
    await expect(github).toHaveAttribute('href', 'https://github.com/nameisnoting');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const spacing = await page.locator('.profile-content').evaluate((content) => {
      const groups = content.querySelectorAll('.settings-list');
      const line = groups[0].getBoundingClientRect().bottom - 0.5;
      const character = groups[0].lastElementChild!.querySelector('span')!.getBoundingClientRect();
      const notice = groups[1].firstElementChild!.querySelector('span')!.getBoundingClientRect();
      const hint = content.querySelector('p.muted')!.getBoundingClientRect();
      return {
        above: line - character.bottom,
        below: notice.top - line,
        hint: hint.top - groups[1].getBoundingClientRect().bottom,
      };
    });
    expect(Math.abs(spacing.above - spacing.below)).toBeLessThan(2);
    expect(spacing.hint).toBe(8);
    await fs.mkdir('docs/screenshots/profile-pages', { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/profile-pages/menu-${width}.png`,
      fullPage: true,
    });
    const originalHeader = (await page.locator('.page-header').boundingBox())!;
    const libraryList = [
      ['notes', '유저노트'],
      ['personas', '유저 페르소나'],
      ['lore', '마이 로어북'],
      ['characters', '마이 캐릭터'],
    ] as const;
    await fs.mkdir('docs/screenshots/profile-pages', { recursive: true });
    for (const [id, name] of libraryList) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#/profile/${id}$`));
      const library = page.getByRole('main', { name, exact: true });
      await expect(library).toBeVisible();
      await expect(library.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const header = (await library.locator('.page-header').boundingBox())!;
      expect(header.x).toBe(originalHeader.x);
      expect(header.width).toBe(originalHeader.width);
      const content = (await library.locator('.profile-library-content').boundingBox())!;
      expect(content.x).toBe(header.x);
      expect(content.width).toBe(header.width);
      if (width === 393) {
        await expect(page.getByRole('button', { name: '마이', exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
      } else {
        expect(content.width).toBeLessThan(width / 2);
      }
      if (id === 'notes') {
        await library.getByRole('button', { name: '노트 추가', exact: true }).click();
        await library
          .getByRole('textbox', { name: '프롬프트', exact: true })
          .fill('페이지에서 저장한 노트');
        await expect
          .poll(async () => (await stored(page)).notes[0]?.body)
          .toBe('페이지에서 저장한 노트');
        await library.getByRole('button', { name: '노트 그룹 추가', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('textbox', { name: '제목', exact: true }).fill('페이지 그룹');
        await dialog.getByRole('checkbox', { name: '노트 1', exact: true }).check();
        await dialog.getByRole('button', { name: '완료', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(library.locator('.note-group')).toContainText('페이지 그룹');
        expect(
          await library.locator('.note-card').evaluate((e) => getComputedStyle(e).backgroundColor),
        ).toBe('rgb(0, 0, 0)');
        expect(
          await page.locator('html').evaluate((e) => getComputedStyle(e).backgroundColor),
        ).not.toBe('rgb(0, 0, 0)');
      } else if (id === 'personas') {
        await library.getByRole('button', { name: '페르소나 추가', exact: true }).click();
        await library.getByRole('textbox', { name: '이름', exact: true }).fill('페이지 페르소나');
        await library
          .getByRole('textbox', { name: '프롬프트', exact: true })
          .fill('페이지에서 저장한 페르소나');
        await expect
          .poll(async () => (await stored(page)).personas[0]?.prompt)
          .toBe('페이지에서 저장한 페르소나');
      } else {
        await expect(
          library.getByText(
            `제작 화면에서 ${id === 'lore' ? '로어북을' : '캐릭터를'} 저장하면 여기에 나타납니다.`,
            { exact: true },
          ),
        ).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `docs/screenshots/profile-pages/${id}-${width}.png`,
        fullPage: true,
      });
      await page.reload();
      await expect(library).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (id === 'notes') {
        await expect(library.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
          '페이지에서 저장한 노트',
        );
      } else if (id === 'personas') {
        await expect(library.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
          '페이지 페르소나',
        );
      }
      await page.goBack();
      await expect(page).toHaveURL(/#\/profile$/);
      await page.goForward();
      await expect(library).toBeVisible();
      await library.getByRole('button', { name: '마이페이지로 돌아가기', exact: true }).click();
      await expect(page).toHaveURL(/#\/profile$/);
    }

    await page.evaluate(async () => {
      const request = indexedDB.open('xenotale-v1');
      const database = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const transaction = database.transaction('profiles', 'readwrite');
        const store = transaction.objectStore('profiles');
        const read = store.get('profile');
        read.onsuccess = () => {
          const profile = read.result;
          profile.savedLore = [{ id: 'saved-lore', name: '저장한 로어북', entries: [] }];
          profile.savedCharacters = [
            { id: 'saved-characters', name: '저장한 캐릭터', characters: [] },
          ];
          store.put(profile);
        };
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      });
    });
    // Native IndexedDB fixture writes do not emit Dexie's live-query notifications.
    await page.reload();
    for (const [id, name, savedName, deleteLabel] of [
      ['lore', '마이 로어북', '저장한 로어북', '로어북 삭제'],
      ['characters', '마이 캐릭터', '저장한 캐릭터', '캐릭터 모음 삭제'],
    ]) {
      await page.goto(`/#/profile/${id}`);
      const library = page.getByRole('main', { name, exact: true });
      await expect(library.locator('.manage-row')).toContainText(savedName);
      await library.getByRole('button', { name: deleteLabel, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
      await expect(library.locator('.manage-row')).toHaveCount(0);
      await library.getByRole('button', { name: '마이페이지로 돌아가기', exact: true }).click();
      await expect(page).toHaveURL(/#\/profile$/);
    }
    await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
