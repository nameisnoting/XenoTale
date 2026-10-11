import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function confirm(page: Page, cancel = false) {
  const modal = page.getByRole('dialog').last();
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: cancel ? '취소' : '삭제', exact: true }).click();
  await expect(modal).toHaveCount(0);
}

for (const width of [1440, 393]) {
  test(`마이페이지·대화방 노트/페르소나 빈 항목·변경 제목·본문 삭제 보호 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page.goto('/#/profile/notes');
    const addNote = page.getByRole('button', { name: '노트 추가', exact: true });
    const notes = page.locator('.note-card');
    await addNote.click();
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await expect(notes).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await addNote.click();
    await notes.first().getByRole('button', { name: '노트 이름 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '노트 이름', exact: true }).fill('노트 99');
    await page.getByRole('textbox', { name: '노트 이름', exact: true }).press('Enter');
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(notes).toHaveCount(1);
    await page.reload();
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await confirm(page);
    await expect(notes).toHaveCount(0);
    await addNote.click();
    await notes.first().getByRole('textbox', { name: '프롬프트', exact: true }).fill('보존할 노트');
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(notes.first().getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '보존할 노트',
    );
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await confirm(page);

    await page.goto('/#/profile/personas');
    const addPersona = page.getByRole('button', { name: '페르소나 추가', exact: true });
    const cards = page.locator('.persona-card');
    await addPersona.click();
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await expect(cards).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await addPersona.click();
    await cards.last().getByRole('radio', { name: '남성', exact: true }).check();
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await confirm(page, true);
    await expect(cards.last().getByRole('radio', { name: '남성', exact: true })).toBeChecked();
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await confirm(page);

    await page.goto('/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    const chatBase = page.url();
    if (width === 393) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('button', { name: '유저노트', exact: true }).click();
    await addNote.click();
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await expect(notes).toHaveCount(0);
    await addNote.click();
    await notes.first().getByRole('textbox', { name: '프롬프트', exact: true }).fill('대화방 노트');
    await notes.first().getByRole('button', { name: '노트 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(notes).toHaveCount(1);
    await page.goto(chatBase);
    if (width === 393) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '유저 페르소나' : '페르소나', exact: true })
      .click();
    await addPersona.click();
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await expect(cards).toHaveCount(1); // Authored recommendation remains.
    await addPersona.click();
    await cards.last().getByRole('textbox', { name: '이름', exact: true }).fill('대화방 이름');
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await confirm(page, true);
    await expect(cards).toHaveCount(2);
    await cards.last().getByRole('button', { name: /삭제$/ }).click();
    await confirm(page);
    await expect(cards).toHaveCount(1);
  });

  test(`제작 공통 카드 아이콘·접기·빈 항목 즉시 삭제·작성 항목 확인 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const section = async (name: string) => {
      if (width === 393)
        await page
          .locator('.editor-mobile-stages')
          .getByRole('tab', { name, exact: false })
          .click();
      else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
    };
    const editor = page.locator('.editor-form');
    const matrix = [
      ['작품 개요', '로어북 추가', '로어북 삭제', '프롬프트'],
      ['상태창', '상태값 추가', '상태값 삭제', '프롬프트'],
      ['아이템', '아이템 추가', '아이템 삭제', '프롬프트'],
      ['단축어', '단축어 추가', '단축어 삭제', '설명'],
      ['연출', '연출 추가', '연출 삭제', '코드 입력'],
    ];
    for (const [name, addLabel, deleteLabel, field] of matrix) {
      await section(name);
      const add = editor.getByRole('button', { name: addLabel, exact: true });
      const cards = editor.locator('.creator-card');
      await add.click();
      const card = cards.last();
      const icon = card.getByRole('button', { name: deleteLabel, exact: true });
      expect(await icon.locator('svg').getAttribute('width')).toBe('16');
      expect(await card.locator('.disclosure-chevron').getAttribute('width')).toBe('16');
      expect(await card.evaluate((e) => getComputedStyle(e).padding)).toBe('16px');
      expect(
        await card.locator('summary').evaluate((e) => getComputedStyle(e, '::after').content),
      ).toBe('none');
      await card.locator('summary').click();
      await expect(card.getByRole('textbox', { name: field, exact: true })).toBeHidden();
      await card.locator('summary').click();
      await icon.click();
      await expect(cards).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await add.click();
      await card.getByRole('textbox', { name: field, exact: true }).fill('작성한 내용');
      await icon.click();
      await expect(card).toHaveAttribute('open', '');
      await confirm(page, true);
      await expect(card.getByRole('textbox', { name: field, exact: true })).toHaveValue(
        '작성한 내용',
      );
      await icon.click();
      await confirm(page);
      await expect(cards).toHaveCount(0);
    }
    await section('추천 페르소나');
    await editor.getByRole('button', { name: '추가', exact: true }).click();
    await editor.getByRole('button', { name: '추가', exact: true }).click();
    const persona = editor.locator('.persona-card').last();
    await persona.getByRole('textbox', { name: '프롬프트', exact: true }).fill('제작자 페르소나');
    await editor.locator('.selection-pill-delete').last().click();
    await confirm(page, true);
    await expect(persona).toBeVisible();
    await fs.mkdir('docs/screenshots/delete-guard', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/delete-guard/persona-${width}.png` });
    await editor.locator('.selection-pill-delete').last().click();
    await page.screenshot({ path: `docs/screenshots/delete-guard/confirm-${width}.png` });
    await confirm(page);
    await expect(editor.locator('.selection-pill-label')).toHaveCount(1);
    await expect(editor.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(persona.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue('');
  });
}
