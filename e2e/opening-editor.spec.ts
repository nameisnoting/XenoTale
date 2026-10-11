import { test, expect, type Page, type Locator } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
}
async function section(page: Page, width: number, name: string) {
  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function support(page: Page, width: number) {
  if (width < 800) {
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-rail')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
}
async function editing(page: Page, width: number) {
  if (width < 800) {
    await page
      .locator('.editor-rail')
      .getByRole('button', { name: '작업공간', exact: true })
      .click();
    await page.locator('.editor-nav').getByRole('button', { name: '도입부', exact: false }).click();
  }
}
async function choose(page: Page, name: string) {
  await page
    .locator('.creator-test')
    .getByRole('button', { name: '도입부 변경', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}
async function confirm(page: Page, cancel = false) {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: cancel ? '취소' : '삭제', exact: true })
    .click();
}
async function position(area: Locator, start: number, end = start) {
  await area.focus();
  await area.evaluate(
    (e: HTMLTextAreaElement, range) => e.setSelectionRange(range[0], range[1]),
    [start, end],
  );
}

for (const width of [1440, 393]) {
  test(`버튼 삽입과 직접 입력의 Ctrl+Z·Ctrl+Y 및 자동 저장 (${width})`, async ({ page }) => {
    await start(page, width);
    await section(page, width, '도입부');
    const form = page.locator('.openings-form');
    const area = form.getByRole('textbox', { name: /^내용/ });
    await area.pressSequentially('앞뒤');
    for (const [label, inserted] of [
      ['지문', '앞**뒤'],
      ['{{user}}', '앞{{user}}뒤'],
      ['@캐릭터', '앞@캐릭터: 뒤'],
    ]) {
      await position(area, 1);
      await form.getByRole('button', { name: label, exact: true }).click();
      await expect(area).toHaveValue(inserted);
      await area.press('Control+z');
      await expect(area).toHaveValue('앞뒤');
      await area.press('Control+y');
      await expect(area).toHaveValue(inserted);
      await area.press('Control+z');
      await expect(area).toHaveValue('앞뒤');
    }
    await position(area, 1);
    await form.getByRole('button', { name: '지문', exact: true }).click();
    await area.press('a');
    await expect(area).toHaveValue('앞*a*뒤');
    await area.press('Control+z');
    await expect(area).toHaveValue('앞**뒤');
    await area.press('Control+z');
    await expect(area).toHaveValue('앞뒤');
    await position(area, 0, 1);
    await form.getByRole('button', { name: '{{user}}', exact: true }).click();
    await expect(area).toHaveValue('{{user}}뒤');
    await area.press('Control+z');
    await expect(area).toHaveValue('앞뒤');
    await page.reload();
    await section(page, width, '도입부');
    await expect(area).toHaveValue('앞뒤');
  });

  test(`도입부 알약 삭제·중간 커서 삽입·선택 영역 교체 (${width})`, async ({ page }) => {
    await start(page, width);
    await section(page, width, '도입부');
    const form = page.locator('.openings-form');
    const tabs = form.locator('.tab-pills').first();
    const area = form.getByRole('textbox', { name: /^내용/ });
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(form.getByRole('button', { name: '미리보기', exact: true })).toHaveCount(0);
    await expect(form.getByRole('button', { name: '도입부 삭제', exact: true })).toHaveCount(0);
    expect(
      await tabs
        .locator('.is-selected .selection-pill-label')
        .evaluate((e) => getComputedStyle(e).fontWeight),
    ).toBe('700');
    await area.fill('앞뒤');
    await position(area, 1);
    await form.getByRole('button', { name: '지문', exact: true }).click();
    await expect(area).toHaveValue('앞**뒤');
    await expect(area).toBeFocused();
    expect(
      await area.evaluate((e: HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd]),
    ).toEqual([2, 2]);
    await area.pressSequentially('지문');
    await expect(area).toHaveValue('앞*지문*뒤');
    await area.fill('앞뒤');
    await position(area, 1);
    await form.getByRole('button', { name: '{{user}}', exact: true }).click();
    await expect(area).toHaveValue('앞{{user}}뒤');
    expect(await area.evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe(9);
    await position(area, 1, 9);
    await form.getByRole('button', { name: '{{user}}', exact: true }).click();
    await expect(area).toHaveValue('앞{{user}}뒤');
    await expect(area).toBeFocused();
    expect(
      await area.evaluate((e: HTMLTextAreaElement) => [e.selectionStart, e.selectionEnd]),
    ).toEqual([9, 9]);
    await area.fill('앞지울내용뒤');
    await position(area, 1, 5);
    await form.getByRole('button', { name: '@캐릭터', exact: true }).click();
    await expect(area).toHaveValue('앞@캐릭터: 뒤');
    await expect(area).toBeFocused();
    expect(await area.evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe(7);
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(2);
    await tabs.getByRole('button', { name: '도입부 2 삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await tabs.getByRole('button', { name: '추가', exact: true }).click();
    await area.fill('남길 도입부');
    await tabs.getByRole('button', { name: '도입부 1 삭제', exact: true }).click();
    await confirm(page, true);
    await expect(tabs.locator('.selection-pill')).toHaveCount(2);
    await expect(area).toHaveValue('남길 도입부');
    await tabs.getByRole('button', { name: '도입부 1 삭제', exact: true }).click();
    await confirm(page);
    await expect(tabs.locator('.selection-pill-delete')).toHaveCount(0);
    await expect(area).toHaveValue('남길 도입부');
    await page.reload();
    await section(page, width, '도입부');
    await expect(area).toHaveValue('남길 도입부');
  });

  test(`실시간 도입부 렌더링·변경해도 테스트 유지·다시 시작만 초기화 (${width})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, width);
    await section(page, width, '도입부');
    const form = page.locator('.openings-form');
    await form.getByRole('textbox', { name: /^내용/ }).fill('*미완성 작품의 도입부*');
    await support(page, width);
    const panel = page.locator('.creator-test');
    const transcript = panel.locator('.support-transcript');
    await expect(transcript.locator('em')).toHaveText('미완성 작품의 도입부');
    await expect(panel.getByRole('button', { name: '도입부 변경', exact: true })).toHaveCount(0);
    await editing(page, width);
    await section(page, width, '작품 개요');
    await page
      .locator('.editor-form')
      .getByRole('textbox', { name: /^제목/ })
      .fill('도입부 테스트');
    await page
      .locator('.editor-form')
      .getByRole('textbox', { name: /^프롬프트/ })
      .fill('도입부를 검증할 정원');
    await section(page, width, '등장 캐릭터');
    await page.locator('.editor-form').getByRole('textbox', { name: /^이름/ }).fill('안내인');
    await page
      .locator('.editor-form')
      .getByRole('textbox', { name: /^캐릭터 프롬프트/ })
      .fill('정원을 안내한다');
    await section(page, width, '도입부');
    await form
      .getByRole('textbox', { name: /^내용/ })
      .fill('*첫 장면*\n\n@안내인: 여행자님, 안녕하세요.');
    await form
      .locator('.tab-pills')
      .first()
      .getByRole('button', { name: '추가', exact: true })
      .click();
    await form
      .getByRole('textbox', { name: /^내용/ })
      .fill('*둘째 장면*\n\n@안내인: 다른 입구입니다.');
    await support(page, width);
    await expect(transcript.locator('em')).toHaveText('둘째 장면');
    await expect(transcript.locator('.character-message strong')).toHaveText('안내인');
    const change = panel.getByRole('button', { name: '도입부 변경', exact: true });
    const button = await change.boundingBox();
    const composer = await panel.locator('.support-composer').boundingBox();
    expect(button!.width).toBeCloseTo(composer!.width, 0);
    expect(button!.y + button!.height).toBeLessThan(composer!.y);
    await choose(page, '도입부 1');
    await expect(transcript.locator('em')).toHaveText('첫 장면');
    const send = async (input: string, count: number) => {
      await panel.getByRole('textbox', { name: '테스트 메시지' }).fill(input);
      await panel.getByRole('button', { name: '테스트 전송', exact: true }).click();
      await expect(transcript.locator('.support-user')).toHaveCount(count);
      await expect(panel.getByRole('button', { name: '테스트 전송', exact: true })).toBeVisible();
    };
    await send('첫 테스트 입력', 1);
    await choose(page, '도입부 2');
    await expect(transcript.locator('.story-body').first()).toContainText('첫 장면');
    await expect(transcript.locator('.support-user')).toHaveCount(1);
    await send('두 번째 테스트 입력', 2);
    await page.getByRole('tab', { name: 'AI 에이전트', exact: true }).click();
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(transcript.locator('.support-user')).toHaveCount(2);
    await editing(page, width);
    await form.getByRole('textbox', { name: /^내용/ }).fill('*수정한 둘째 장면*');
    await form.getByRole('button', { name: '도입부 1 삭제', exact: true }).click();
    await confirm(page);
    await support(page, width);
    await expect(transcript.locator('.support-user')).toHaveCount(2);
    await expect(transcript.locator('.story-body').first()).toContainText('첫 장면');
    await panel.getByRole('button', { name: '현재 설정으로 다시 시작', exact: true }).click();
    await expect(transcript.locator('.support-user')).toHaveCount(0);
    await expect(transcript.locator('em')).toHaveText('수정한 둘째 장면');
    await expect(change).toHaveCount(0);
    await send('다시 시작한 테스트', 1);
    await page.screenshot({ path: `test-results/opening-test-${width}.png` });
    expect(errors).toEqual([]);
  });
}

test('챕터에서 참조하는 도입부는 X로 삭제할 수 없다', async ({ page }) => {
  await start(page, 1440);
  await section(page, 1440, '도입부');
  await page
    .locator('.openings-form .tab-pills')
    .first()
    .getByRole('button', { name: '추가', exact: true })
    .click();
  await section(page, 1440, '시나리오');
  await page.getByRole('button', { name: '도입부 1 다음 챕터 추가', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '완료', exact: true }).click();
  await section(page, 1440, '도입부');
  await expect(
    page.locator('.openings-form').getByRole('button', { name: '도입부 1 삭제', exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.openings-form').getByRole('button', { name: '도입부 2 삭제', exact: true }),
  ).toBeEnabled();
});
