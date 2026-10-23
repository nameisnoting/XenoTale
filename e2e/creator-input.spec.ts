import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function verifyInput(input: Locator, transcript: Locator, followBottom = true) {
  // Long content isolates viewport anchoring from network and model response timing.
  await transcript.evaluate((e) => {
    const content = document.createElement('p');
    content.textContent = '이전에 읽던 긴 대화 내용입니다. '.repeat(500);
    e.appendChild(content);
  });
  await input.fill('첫 줄\n둘째 줄');
  const two = await input.evaluate((e) => e.getBoundingClientRect().height);
  await transcript.evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  await expect
    .poll(() => transcript.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
    .toBeLessThan(2);
  await input.focus();
  await input.press('End');
  await input.press('Shift+Enter');
  await input.pressSequentially('셋째 줄');
  const three = await input.evaluate((e) => e.getBoundingClientRect().height);
  expect(three).toBeGreaterThan(two + 15);
  const beforeGrowth = await transcript.evaluate((e) => e.scrollTop);
  const eightLines = Array.from({ length: 8 }, (_, i) => `${i + 1}번째 줄`).join('\n');
  await input.fill(eightLines);
  if (followBottom)
    await expect
      .poll(() => transcript.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
      .toBeLessThan(2);
  else await expect.poll(() => transcript.evaluate((e) => e.scrollTop)).toBe(beforeGrowth);
  const eight = await input.evaluate((e) => e.getBoundingClientRect().height);
  expect(eight - two).toBeCloseTo(132, 0);
  await input.fill(eightLines + '\n9번째 줄\n10번째 줄');
  expect(await input.evaluate((e) => e.getBoundingClientRect().height)).toBe(eight);
  expect(await input.evaluate((e) => getComputedStyle(e).overflowY)).toBe('auto');
  expect(await input.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await input.fill('짧은 메시지');
  await transcript.evaluate((e) => {
    e.scrollTop = 200;
  });
  await expect.poll(() => transcript.evaluate((e) => e.scrollTop)).toBe(200);
  await input.fill(eightLines);
  await expect.poll(() => transcript.evaluate((e) => e.scrollTop)).toBe(200);
  await input.fill('');
  expect(await input.evaluate((e) => e.getBoundingClientRect().height)).toBe(two);
}

for (const width of [1440, 393]) {
  test(`제작 벡터·공통 버튼·필수 검증·시스템 프롬프트 편집/초기화 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const publish = page.getByRole('button', { name: '제작완료', exact: true });
    await expect(publish).toBeDisabled();
    const rail = page.locator('.editor-rail');
    await expect(rail.locator('img')).toHaveCount(0);
    await expect(rail.locator('button[aria-label="작업공간"] svg')).toHaveCount(1);
    await expect(rail.locator('button[aria-label="작품참고"] svg')).toHaveCount(1);
    const form = page.locator('.editor-form');
    const system = form.getByRole('textbox', { name: /^시스템 프롬프트/ });
    const provided = await system.inputValue();
    expect(provided).toContain('Create an engaging interactive scene');
    await expect(form.getByRole('radio', { name: 'XenoTale 제공' })).toHaveCount(0);
    await expect(
      form.getByRole('group', { name: /^시스템 프롬프트/ }).locator('.field-label i'),
    ).toHaveText('*');
    await system.fill('수정한 서사 지시');
    await page.reload();
    await expect(system).toHaveValue('수정한 서사 지시');
    await form.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(system).toHaveValue(provided);
    expect(
      await form
        .locator('.segmented button.selected')
        .first()
        .evaluate((e) => getComputedStyle(e).fontWeight),
    ).toBe('700');
    expect(
      await form
        .getByRole('button', { name: '로어북 불러오기', exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('12px');
    await form.getByRole('textbox', { name: /^제목/ }).fill('완료 검증 작품');
    await form.getByRole('textbox', { name: /^프롬프트/ }).fill('작품 설정');
    const section = async (name: string) => {
      if (width === 393)
        await page
          .locator('.editor-mobile-stages')
          .getByRole('tab', { name, exact: false })
          .click();
      else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
    };
    await section('등장 캐릭터');
    await form.getByRole('textbox', { name: /^이름/ }).fill('안내인');
    await form.getByRole('textbox', { name: /^캐릭터 프롬프트/ }).fill('친절한 안내인');
    await expect(publish).toBeDisabled();
    await section('도입부');
    await form.getByRole('textbox', { name: /^내용/ }).fill('@안내인: 반갑습니다.');
    await expect(publish).toBeDisabled();
    await section('대화방 UI');
    await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
    await expect(page.locator('.code-validation')).toContainText('검사 완료');
    await expect(publish).toBeEnabled();
    expect(await publish.evaluate((e) => getComputedStyle(e).fontWeight)).toBe('700');
    await section('작품 개요');
    await system.fill('');
    await expect(publish).toBeDisabled();
    await form.getByRole('button', { name: '초기화', exact: true }).click();
    await expect(publish).toBeEnabled();
    await fs.mkdir('docs/screenshots/creator-input', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/creator-input/editor-${width}.png` });
  });

  test(`대화방·서포터·대화 테스트 입력창 2~8줄·스크롤 위치·드래그 유지 (${width})`, async ({
    page,
  }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    const input = page.getByRole('textbox', { name: '메시지', exact: true });
    await expect(input).toBeVisible();
    await expect(page.locator('.composer-hint')).toHaveCount(0);
    await verifyInput(input, page.locator('.chat-scroll'), false);
    const handle = page.getByRole('separator', { name: '메시지 입력창 크기 조절' });
    await handle.press('End');
    await expect(page.locator('.resizable-composer')).toHaveAttribute('data-manual', 'true');
    await input.fill('드래그 상태에서 작성한 메시지');
    await handle.press('Home');
    await expect(page.locator('.resizable-composer')).toHaveAttribute('data-manual', 'false');
    await expect.poll(() => input.evaluate((e) => e.getBoundingClientRect().height)).toBe(48);
    await input.fill('대화 테스트');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(input).toHaveValue('');
    await page.goto('/');
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    if (width === 393) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page.getByRole('button', { name: '제작 서포터', exact: true }).click();
    }
    await expect(page.locator('.support-hint')).toHaveCount(0);
    const supporter = page.locator('.assistant');
    await verifyInput(
      page.getByRole('textbox', { name: '서포터 메시지' }),
      supporter.locator('.support-transcript'),
    );
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(page.locator('.support-hint')).toHaveCount(0);
    await verifyInput(
      page.getByRole('textbox', { name: '테스트 메시지' }),
      page.locator('.creator-test .support-transcript'),
    );
    await expect(page.getByRole('separator', { name: '메시지 입력창 크기 조절' })).toHaveCount(0);
    await page
      .getByRole('textbox', { name: '테스트 메시지' })
      .fill(Array.from({ length: 8 }, (_, i) => `${i + 1}번째 줄`).join('\n'));
    await fs.mkdir('docs/screenshots/creator-input', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/creator-input/input-${width}.png` });
  });
}
