import { test, expect } from '@playwright/test';

for (const width of [1440, 393])
  test(`Gemini rejection shows provider explanation and restores input ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    let calls = 0,
      allowResponse = false;
    const requests: any[] = [];
    await page.route('https://openrouter.ai/**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/models'))
        return route.fulfill({
          json: {
            data: [
              {
                id: 'google/gemini-3.8-flash',
                name: 'Gemini 3.8 Flash',
                context_length: 1000000,
                supported_parameters: ['structured_outputs', 'response_format', 'reasoning'],
                reasoning: { supported_efforts: ['high', 'medium', 'low'] },
              },
            ],
          },
        });
      if (url.endsWith('/chat/completions')) {
        calls++;
        const request = route.request().postDataJSON();
        requests.push(request);
        if (allowResponse && request.response_format?.type === 'json_object')
          return route.fulfill({
            json: {
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content: JSON.stringify({
                      kind: 'turn',
                      requestedCharacterIds: [],
                      body: '*이제 정상적으로 장면이 이어집니다.*',
                      choices: ['주변을 살펴본다.'],
                      delta: {
                        numeric: [],
                        text: [],
                        choice: [],
                        inventory: [],
                        presence: [],
                        relationships: [],
                      },
                    }),
                  },
                },
              ],
            },
          });
        return route.fulfill({
          status: 400,
          json: {
            error: {
              code: 400,
              message: 'Provider returned error',
              metadata: {
                provider_name: 'Google',
                raw: JSON.stringify({
                  error: {
                    message:
                      'Invalid request parameter: response_format.json_schema. fake-error-key',
                  },
                }),
              },
            },
          },
        });
      }
      return route.fulfill({ json: { data: { total_credits: 100, total_usage: 0 } } });
    });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-error-key');
    await page.getByRole('button', { name: '키 확인', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
    await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
    await page.getByRole('button', { name: /^Gemini 3.8 Flash/ }).click();
    await page.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.getByRole('textbox', { name: /^제목/ }).fill('오류 설명 검증');
    await page
      .getByRole('textbox', { name: /^프롬프트/ })
      .first()
      .fill('대화와 상태를 검증하는 작품.');
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    await nav.getByRole(width < 800 ? 'tab' : 'button', { name: /^도입부/ }).click();
    await page.getByRole('textbox', { name: /^내용/ }).fill('조용한 방에서 대화를 시작합니다.');
    await page.getByRole('button', { name: '제작완료', exact: true }).click();
    await expect(page.getByText(/내 라이브러리에 반영했습니다/)).toBeVisible();
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page.getByRole('button', { name: '오류 설명 검증 대화 시작', exact: true }).click();
    const composer = page.locator('.composer textarea');
    await composer.fill('이 메시지는 실패 후에도 남아야 해.');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    const toast = page.locator('.toast');
    await expect(toast).toContainText('모델이 요청 형식이나 옵션을 거절했습니다');
    await expect(toast).toContainText('Google: Provider returned error');
    await expect(toast).toContainText('Invalid request parameter: response_format.json_schema');
    await expect(toast).not.toContainText('fake-error-key');
    await expect(composer).toHaveValue('이 메시지는 실패 후에도 남아야 해.');
    expect(calls).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: `docs/screenshots/provider-error-${width}.png` });
    allowResponse = true;
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.chat-scroll')).toContainText('이제 정상적으로 장면이 이어집니다.');
    await expect(composer).toHaveValue('');
    expect(calls).toBe(2);
    for (const request of requests) {
      expect(request.model).toBe('google/gemini-3.8-flash');
      expect(request.response_format).toEqual({ type: 'json_object' });
      expect(request.reasoning).toEqual({ effort: 'medium', exclude: true });
    }
  });
