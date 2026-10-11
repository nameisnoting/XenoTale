import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('xenotale-v1');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<any>((resolve) => {
      const tx = db.transaction(['profiles', 'rooms'], 'readonly');
      const p = tx.objectStore('profiles').get('profile'),
        r = tx.objectStore('rooms').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve({ profile: p.result, rooms: r.result });
      };
    });
  });
}
async function open(page: Page, width: number) {
  if (width === 393 && page.url().endsWith('/panel/persona')) {
    await expect(page.locator('.chat-personas > h3')).toBeVisible();
    return;
  }
  if (width === 393) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await page
    .getByRole('button', { name: width === 393 ? '유저 페르소나' : '페르소나', exact: true })
    .click();
}
for (const width of [1440, 393])
  test(`페르소나 공유·읽기 전용 추천·복사 독립성·선택 삭제 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    const firstRoom = page.url().split('/').at(-1)!;
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open('xenotale-v1');
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('rooms', 'readwrite'),
          store = tx.objectStore('rooms'),
          r = store.getAll();
        r.onsuccess = () => {
          const room = r.result[0];
          Object.assign(room.work.personas[0], {
            name: '제작자 페르소나',
            gender: '여성',
            prompt: '제작자 설정',
          });
          room.current.context.persona = structuredClone(room.work.personas[0]);
          store.put(room);
        };
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await page.reload();
    await open(page, width);
    if (width === 1440) {
      const icon = page
        .getByRole('navigation', { name: '대화 기능 메뉴' })
        .getByRole('button', { name: '페르소나', exact: true })
        .locator('.rail-icon');
      await expect(icon.locator('img')).toHaveCount(0);
      await expect(icon.locator('svg')).toHaveAttribute('stroke-width', '1.75');
    }
    expect(
      await page.locator('.chat-personas > h3').evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    const authored = page.locator('.persona-card').first();
    await expect(authored).not.toHaveAttribute('open', '');
    expect(await authored.evaluate((e) => getComputedStyle(e).padding)).toBe('16px');
    await authored.locator('summary').click();
    await expect(authored.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
      '제작자 페르소나',
    );
    await expect(authored.getByRole('textbox', { name: '이름', exact: true })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(authored.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '제작자 설정',
    );
    await expect(authored.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(authored.getByRole('radio', { name: '여성', exact: true })).toBeChecked();
    await expect(authored.getByRole('radio', { name: '여성', exact: true })).toBeDisabled();
    await expect(authored.locator('input[type=file]')).toHaveCount(0);
    await expect(authored.getByText('이미지', { exact: true })).toHaveCount(0);
    const layout = await authored.evaluate((e) => {
      const fields = e.querySelector('.persona-fields')!,
        field = fields.querySelector('.field')!,
        img = fields.querySelector('.persona-image-preview')!.getBoundingClientRect(),
        box = e.getBoundingClientRect(),
        summary = e.querySelector('summary')!.getBoundingClientRect();
      return {
        padding: getComputedStyle(e).padding,
        partsGap: getComputedStyle(fields).gap,
        fieldGap: getComputedStyle(field).gap,
        labelSize: getComputedStyle(field.querySelector('.field-label')!).fontSize,
        inputSize: getComputedStyle(field.querySelector('input')!).fontSize,
        center: img.x + img.width / 2 - (box.x + box.width / 2),
        titleGap: img.top - summary.bottom,
        chevron: e.querySelector('.persona-chevron')!.getBoundingClientRect().width,
        copyGap:
          e.querySelector('.persona-card-body > .button')!.getBoundingClientRect().top -
          fields.getBoundingClientRect().bottom,
      };
    });
    expect(layout).toEqual({
      padding: '16px',
      partsGap: '16px',
      fieldGap: '8px',
      labelSize: '14px',
      inputSize: '14px',
      center: 0,
      titleGap: 16,
      chevron: 16,
      copyGap: 16,
    });
    await fs.mkdir('docs/screenshots/shared-personas', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/shared-personas/recommended-${width}.png` });
    await authored.getByRole('button', { name: '내 페르소나로 복사', exact: true }).click();
    await expect(page.locator('.persona-card')).toHaveCount(2);
    const personal = page.locator('.persona-card.selected');
    await expect(personal.getByRole('textbox', { name: '이름', exact: true })).not.toHaveAttribute(
      'readonly',
      '',
    );
    const nameInput = personal.getByRole('textbox', { name: '이름', exact: true });
    await nameInput.fill('');
    await nameInput.pressSequentially('공유할 내 페르소나');
    await expect(nameInput).toHaveValue('공유할 내 페르소나');
    await personal.getByRole('textbox', { name: '프롬프트', exact: true }).fill('내 설정');
    await personal.getByRole('radio', { name: '남성', exact: true }).check();
    await expect.poll(async () => (await stored(page)).profile.personas[0]?.prompt).toBe('내 설정');
    const personaId = (await stored(page)).profile.personas[0].id;
    expect(personaId).not.toBe((await stored(page)).rooms[0].work.personas[0].id);
    await authored.locator('summary').click();
    await page.locator('.chat-workspace-panel, .mobile-page-body').evaluateAll((elements) => {
      for (const element of elements) element.scrollTop = 0;
    });
    await page.screenshot({ path: `docs/screenshots/shared-personas/personas-${width}.png` });
    await page.goto('/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await open(page, width);
    const shared = page.locator('.persona-card').filter({ hasText: '공유할 내 페르소나' });
    await expect(shared).toHaveCount(1);
    await shared.getByRole('button', { name: '공유할 내 페르소나 선택', exact: true }).click();
    await shared.getByRole('textbox', { name: '프롬프트', exact: true }).fill('B 방에서 수정');
    await expect
      .poll(
        async () =>
          (await stored(page)).rooms.find((r: any) => r.id === firstRoom).current.context.persona
            .prompt,
      )
      .toBe('B 방에서 수정');
    await page.goto('/#/profile');
    await page.getByRole('button', { name: '유저 페르소나', exact: true }).click();
    const library = page.getByRole('main', { name: '유저 페르소나', exact: true });
    await expect(library.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
      '공유할 내 페르소나',
    );
    const profileName = library.getByRole('textbox', { name: '이름', exact: true });
    await profileName.fill('');
    await profileName.pressSequentially('마이페이지에서 수정');
    await expect(profileName).toHaveValue('마이페이지에서 수정');
    await expect
      .poll(async () =>
        (await stored(page)).rooms.every(
          (r: any) => r.current.context.persona.name === '마이페이지에서 수정',
        ),
      )
      .toBe(true);
    await library.getByRole('button', { name: '마이페이지로 돌아가기', exact: true }).click();
    await page.goto(`/#/chat/${firstRoom}`);
    await open(page, width);
    const mine = page.locator('.persona-card.selected');
    await expect(mine.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(
      '마이페이지에서 수정',
    );
    await mine.getByRole('button', { name: '마이페이지에서 수정 삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.locator('.persona-card')).toHaveCount(1);
    await expect.poll(async () => (await stored(page)).profile.personas.length).toBe(0);
    expect(
      (await stored(page)).rooms.every((r: any) => r.current.context.persona.id !== personaId),
    ).toBe(true);
    await page.reload();
    await open(page, width);
    await expect(page.locator('.persona-card')).toHaveCount(1);
    expect(
      (await stored(page)).rooms.find((r: any) => r.id === firstRoom).work.personas[0].prompt,
    ).toBe('제작자 설정');
  });
