import { test, expect, type Locator, type Page } from '@playwright/test';

async function checkComposer(page: Page, input: Locator, sendLabel: string, mobile: boolean) {
  await expect(input).toHaveAttribute('enterkeyhint', mobile ? 'enter' : 'send');
  await input.fill('첫 번째 줄');
  await input.press('End');
  if (!mobile) {
    // Korean/Japanese composition confirmation must never trigger a request.
    for (const composing of [true, false]) {
      const prevented = await input.evaluate((element, composing) => {
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
          isComposing: composing,
          keyCode: composing ? 13 : 229,
        });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      }, composing);
      expect(prevented).toBe(false);
      await expect(input).toHaveValue('첫 번째 줄');
    }
  }
  await input.press(mobile ? 'Enter' : 'Shift+Enter');
  await input.pressSequentially('두 번째 줄');
  await expect(input).toHaveValue('첫 번째 줄\n두 번째 줄');
  await expect(input).toBeEnabled();
  await expect(page.getByRole('button', { name: sendLabel, exact: true })).toBeEnabled();
  // Only the explicit button sends on mobile; desktop still supports Enter.
  if (mobile) await page.getByRole('button', { name: sendLabel, exact: true }).click();
  else await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeEnabled();
}

for (const { width, touch } of [
  { width: 393, touch: true },
  { width: 1024, touch: true },
  { width: 393, touch: false },
  { width: 1440, touch: false },
]) {
  test.describe(`메시지 엔터 정책 (${width}px, touch=${touch})`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch });
    test('대화방·서포터·대화 테스트의 줄바꿈과 전송 및 PC 한글 조합 보호', async ({ page }) => {
      let requests = 0;
      await page.route('https://openrouter.ai/**', (route) => {
        if (route.request().method() === 'POST') requests++;
        return route.fulfill({ json: { data: [] } });
      });
      await page.goto('/');
      await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
      await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
      const mobile = width <= 800 || touch;
      await checkComposer(
        page,
        page.getByRole('textbox', { name: '메시지', exact: true }),
        '전송',
        mobile,
      );
      await expect(page.locator('.conversation-turn')).toHaveCount(1);
      await page.goto('/#/');
      await page
        .getByRole('button', { name: width <= 800 ? '만들기' : '작품 만들기', exact: true })
        .click();
      const form = page.locator('.editor-form');
      await form.getByRole('textbox', { name: /^제목/ }).fill('입력 동작 검증');
      await form.getByRole('textbox', { name: /^프롬프트/ }).fill('정원에서 나누는 대화');
      const nav = page.locator(width <= 800 ? '.editor-mobile-stages' : '.editor-nav');
      const sectionRole = width <= 800 ? 'tab' : 'button';
      await nav.getByRole(sectionRole, { name: /^등장 캐릭터/ }).click();
      await form.getByRole('textbox', { name: /^이름/ }).fill('안내인');
      await form.getByRole('textbox', { name: /^캐릭터 프롬프트/ }).fill('친절한 안내인');
      await nav.getByRole(sectionRole, { name: /^도입부/ }).click();
      await form
        .getByRole('textbox', { name: /^내용/ })
        .fill('@안내인: 정원에 오신 것을 환영합니다.');
      const supporter = page.getByRole('textbox', { name: '서포터 메시지', exact: true });
      if (!(await supporter.isVisible())) {
        if (!(await page.locator('.editor-rail').isVisible()))
          await page.getByRole('button', { name: '제작 도구', exact: true }).click();
        await page
          .locator('.editor-rail')
          .getByRole('button', { name: '제작 서포터', exact: true })
          .click();
      }
      await checkComposer(page, supporter, '서포터 전송', mobile);
      await expect(page.locator('.assistant .support-user')).toHaveCount(1);
      await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
      await checkComposer(
        page,
        page.getByRole('textbox', { name: '테스트 메시지', exact: true }),
        '테스트 전송',
        mobile,
      );
      await expect(page.locator('.creator-test .support-user')).toHaveCount(1);
      // All sends use the isolated demo fixture, never a paid model.
      expect(requests).toBe(0);
    });
  });
}
