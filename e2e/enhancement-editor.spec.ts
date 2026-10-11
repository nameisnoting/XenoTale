import { test, expect, type Page } from '@playwright/test';

async function section(page: Page, width: number, name: string) {
  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}

for (const width of [1440, 393]) {
  test(`compact enhancement rates, percentage bounds and failure ratio guidance (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/create\/[^/]+$/);
    await section(page, width, '상태창');
    for (const name of ['골드', '공격력']) {
      await page.getByRole('button', { name: '상태값 추가', exact: true }).click();
      await page.getByRole('textbox', { name: '이름', exact: true }).last().fill(name);
    }
    await section(page, width, '아이템');
    await page.getByRole('button', { name: '아이템 추가', exact: true }).click();
    const imageField = page.getByRole('group', { name: '이미지', exact: true });
    await expect(imageField.locator('.field-label')).toHaveText('이미지');
    await expect(imageField.locator('.field-label')).toHaveCSS('font-size', '14px');
    expect(
      await imageField.evaluate((field) => {
        const label = field.querySelector('.field-label')!.getBoundingClientRect();
        const image = field.querySelector('.image-upload > button')!.getBoundingClientRect();
        return image.top - label.bottom;
      }),
    ).toBe(8);
    await page.getByRole('radio', { name: '강화 가능', exact: true }).check();
    for (const [label, option] of [
      ['소모할 상태값', '골드'],
      ['강화할 상태값', '공격력'],
    ]) {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    }
    const editor = page.locator('.enhancement-editor');
    await expect(
      editor.getByRole('heading', { name: '강화 실패 확률', exact: true }),
    ).toBeVisible();
    await expect(editor.getByText('실패 시 유지 비율', { exact: true })).toHaveCount(0);
    await expect(editor.getByText('실패 시 초기화 비율', { exact: true })).toHaveCount(0);
    await expect(editor.getByRole('group', { name: '유지 비율', exact: true })).toBeVisible();
    await expect(editor.getByRole('group', { name: '초기화 비율', exact: true })).toBeVisible();
    await expect(editor.locator('.enhancement-failure-hint')).toContainText('100% − 성공 확률');
    await expect(editor.locator('.enhancement-failure-hint')).toContainText('유지 14%, 초기화 6%');
    const first = editor.getByRole('spinbutton', { name: '강화 1단계 확률', exact: true });
    const second = editor.getByRole('spinbutton', { name: '강화 2단계 확률', exact: true });
    const third = editor.getByRole('spinbutton', { name: '강화 3단계 확률', exact: true });
    await first.fill('87.5');
    await expect(first).toHaveValue('87.5');
    await first.fill('999');
    await expect(first).toHaveValue('100');
    await second.fill('-25');
    await expect(second).toHaveValue('0');
    await third.fill('0.5');
    await expect(third).toHaveValue('0.5');
    const inputStyles = await first.evaluate((input) => ({
      width: input.getBoundingClientRect().width,
      alignment: getComputedStyle(input).textAlign,
      height: input.getBoundingClientRect().height,
    }));
    expect(inputStyles.width).toBeLessThan(90);
    expect(inputStyles.width).toBeGreaterThan(50);
    expect(inputStyles.alignment).toBe('left');
    expect(inputStyles.height).toBe(32);
    await expect(first).toHaveCSS('font-size', '14px');
    const spacing = await editor.evaluate((element) => {
      const sections = Array.from(element.querySelectorAll(':scope > .edit-card-section'));
      const bodies = sections.map((section) => section.querySelector('.edit-card-section-body')!);
      const failureBody = bodies[2];
      return {
        headingGaps: sections.map(
          (section, index) =>
            bodies[index].getBoundingClientRect().top -
            section.querySelector('h3')!.getBoundingClientRect().bottom,
        ),
        sectionGaps: sections
          .slice(1)
          .map(
            (section, index) =>
              section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom,
          ),
        settingsRowGap:
          bodies[0].children[1].getBoundingClientRect().top -
          bodies[0].children[0].getBoundingClientRect().bottom,
        descriptionAtBottom: failureBody.lastElementChild!.classList.contains(
          'enhancement-failure-hint',
        ),
        descriptionGap:
          failureBody.lastElementChild!.getBoundingClientRect().top -
          failureBody.firstElementChild!.getBoundingClientRect().bottom,
      };
    });
    expect(spacing).toEqual({
      headingGaps: [16, 16, 16],
      sectionGaps: [24, 24],
      settingsRowGap: 16,
      descriptionAtBottom: true,
      descriptionGap: 16,
    });
    const centerOffset = await editor.locator('.probabilities').evaluate((grid) => {
      const bounds = grid.getBoundingClientRect();
      const labels = Array.from(grid.querySelectorAll('label')).map((label) =>
        label.getBoundingClientRect(),
      );
      const row = labels.filter((label) => Math.abs(label.top - labels[0].top) < 1);
      return (row[0].left + row.at(-1)!.right) / 2 - (bounds.left + bounds.right) / 2;
    });
    expect(Math.abs(centerOffset)).toBeLessThan(1);
    await expect(editor.locator('.enhancement-level').first()).toHaveCSS('font-size', '14px');
    await expect(editor.locator('.enhancement-level').last()).toHaveText('+20');
    expect(
      await editor.locator('.probabilities label').evaluateAll((labels) =>
        labels.every((label) => {
          const box = label.getBoundingClientRect();
          const grid = label.parentElement!.getBoundingClientRect();
          return box.width <= 128.1 && box.left >= grid.left - 1 && box.right <= grid.right + 1;
        }),
      ),
    ).toBe(true);
    await expect(page.getByText('저장완료', { exact: true })).toBeVisible();
    await editor.screenshot({ path: `test-results/enhancement-editor-${width}.png` });
    await page.reload();
    await expect(first).toHaveValue('100');
    await expect(second).toHaveValue('0');
    await expect(third).toHaveValue('0.5');
    await expect(
      editor.getByRole('group', { name: '유지 비율', exact: true }).getByRole('spinbutton'),
    ).toHaveValue('7');
    await expect(
      editor.getByRole('group', { name: '초기화 비율', exact: true }).getByRole('spinbutton'),
    ).toHaveValue('3');
    expect(errors).toEqual([]);
  });
}
