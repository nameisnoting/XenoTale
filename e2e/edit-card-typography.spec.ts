import { test, expect, type Page, type Locator } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1100 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}

async function typography(card: Locator) {
  await expect(card).toBeVisible();
  await expect(card.locator('.card-header > .disclosure-title')).toHaveCSS('font-size', '16px');
  const sizes = await card.evaluate((element) => {
    const controls = element.querySelectorAll(
      '.field-label, input:not([type=radio]):not([type=checkbox]):not([type=range]):not([type=file]), textarea, .radio-options, .design-select-trigger, .segmented button, .keyword-pills > span, .toggle-row > span',
    );
    return Array.from(controls).map((control) => ({
      label: control.getAttribute('aria-label') || control.className,
      font: getComputedStyle(control).fontSize,
      placeholder: control.matches('input, textarea')
        ? getComputedStyle(control, '::placeholder').fontSize
        : '14px',
    }));
  });
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter((size) => size.font !== '14px' || size.placeholder !== '14px')).toEqual([]);
  await expect(card).toHaveCSS('padding', '16px');
  const fields = await card.locator('.field').evaluateAll((elements) =>
    elements.map((element) => ({
      margin: getComputedStyle(element).margin,
      gap: getComputedStyle(element).gap,
    })),
  );
  expect(fields.filter((field) => field.margin !== '0px' || field.gap !== '8px')).toEqual([]);
  const body = card.locator(':scope > .disclosure-body, :scope > .persona-card-body');
  if (await body.count()) {
    await expect(body).toHaveCSS('gap', '16px');
    await expect(body).toHaveCSS('margin-top', '16px');
  }
  const identityGaps = await card
    .locator('.basic-info > div:not(.field) > .field')
    .evaluateAll((fields) =>
      fields
        .slice(1)
        .map(
          (field, index) =>
            field.getBoundingClientRect().top - fields[index].getBoundingClientRect().bottom,
        ),
    );
  for (const gap of identityGaps) expect(gap).toBe(16);
}

for (const width of [1440, 393]) {
  test(`creator lore, character lore, status, item, shortcut, effect and persona typography (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const section = async (name: string) => {
      if (width < 800)
        await page
          .locator('.editor-mobile-stages')
          .getByRole('tab', { name, exact: false })
          .click();
      else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
    };
    const editor = page.locator('.editor-form');
    for (const [name, add] of [
      ['작품 개요', '로어북 추가'],
      ['등장 캐릭터', '로어북 추가'],
      ['상태창', '상태값 추가'],
      ['아이템', '아이템 추가'],
      ['단축어', '단축어 추가'],
      ['연출', '연출 추가'],
    ]) {
      await section(name);
      await editor.getByRole('button', { name: add, exact: true }).click();
      const card = editor.locator('.creator-card').last();
      await typography(card);
      if (name === '상태창') {
        await card.getByRole('button', { name: '문자(객관식)', exact: true }).click();
        await card.getByRole('textbox', { name: '선택지', exact: true }).fill('선택지 예시');
        await card.getByRole('textbox', { name: '선택지', exact: true }).press('Enter');
        await card.getByRole('combobox', { name: '초기값', exact: true }).click();
        await expect(page.getByRole('option', { name: '선택지 예시', exact: true })).toHaveCSS(
          'font-size',
          '14px',
        );
        await page.getByRole('option', { name: '선택지 예시', exact: true }).click();
        await typography(card);
      }
      if (name === '단축어') {
        await card.getByRole('textbox', { name: '이름', exact: true }).fill('보기');
        await card
          .getByRole('textbox', { name: '설명', exact: true })
          .fill('입력 텍스트 크기 확인');
        await typography(card);
      }
      await card.screenshot({ path: `test-results/card-${name}-${width}.png` });
    }
    await section('추천 페르소나');
    await editor.getByRole('button', { name: '추가', exact: true }).click();
    await typography(editor.locator('.persona-card'));
    await editor
      .locator('.persona-card')
      .screenshot({ path: `test-results/card-persona-${width}.png` });
    expect(errors).toEqual([]);
  });

  test(`profile and chat share note/persona card typography (${width})`, async ({ page }) => {
    await start(page, width);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/profile/notes');
    await page.getByRole('button', { name: '노트 추가', exact: true }).click();
    await typography(page.locator('.note-card'));
    await page
      .locator('.note-card')
      .getByRole('textbox', { name: '프롬프트', exact: true })
      .fill('공유 노트');
    await page
      .locator('.note-card')
      .getByRole('button', { name: '노트 이름 수정', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: '노트 이름', exact: true })).toHaveCSS(
      'font-size',
      '16px',
    );
    await page.getByRole('textbox', { name: '노트 이름', exact: true }).press('Enter');
    await page.goto('/#/profile/personas');
    await page.getByRole('button', { name: '페르소나 추가', exact: true }).click();
    await typography(page.locator('.persona-card'));
    await page
      .locator('.persona-card')
      .screenshot({ path: `test-results/profile-persona-${width}.png` });
    await page.goto('/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
    const roomURL = page.url();
    if (width < 800) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('button', { name: '유저노트', exact: true }).click();
    await page.getByRole('button', { name: '노트 추가', exact: true }).click();
    await typography(page.locator('.note-card'));
    await page.goto(roomURL);
    if (width < 800) await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '유저 페르소나' : '페르소나', exact: true })
      .click();
    const recommendation = page.locator('.persona-card').first();
    await recommendation.locator('.card-header').click();
    await typography(recommendation);
    const own = page.locator('.persona-card').last();
    // Chat initially keeps the shared persona collapsed.
    if (!(await own.getAttribute('open'))) {
      const isOpen = await own.evaluate((element) => element.hasAttribute('open'));
      if (!isOpen) await own.locator('.card-header').click();
    }
    await typography(own);
    await recommendation.screenshot({ path: `test-results/chat-persona-${width}.png` });
    expect(errors).toEqual([]);
  });
}
