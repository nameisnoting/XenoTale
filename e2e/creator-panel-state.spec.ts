import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`제작 섹션 왕복 시 입력 보존과 기존 선택·미리보기 초기화 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const section = async (name: string) => {
      const navigation = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
      if (
        !(await navigation
          .getByRole(width < 800 ? 'tab' : 'button', { name, exact: false })
          .count())
      )
        await navigation.getByRole('button', { name: '고급설정', exact: false }).click();
      await navigation.getByRole(width < 800 ? 'tab' : 'button', { name, exact: false }).click();
    };
    const form = page.locator('.editor-form');
    await section('등장 캐릭터');
    await form.getByRole('textbox', { name: /^이름/ }).fill('첫 번째 인물');
    await form.locator('.tab-pills').getByRole('button', { name: '추가', exact: true }).click();
    await form.getByRole('textbox', { name: /^이름/ }).fill('두 번째 인물');
    await expect(form.getByRole('textbox', { name: /^이름/ })).toHaveValue('두 번째 인물');
    await section('아이템');
    await section('등장 캐릭터');
    // Editor deliberately remounts EditorPanels with key={section}.
    await expect(form.getByRole('textbox', { name: /^이름/ })).toHaveValue('첫 번째 인물');
    await form
      .locator('.tab-pills')
      .getByRole('button', { name: '두 번째 인물', exact: true })
      .click();
    await expect(form.getByRole('textbox', { name: /^이름/ })).toHaveValue('두 번째 인물');
    await section('작품 개요');
    await form
      .getByRole('textbox', { name: '작품 설명', exact: true })
      .fill('## 안내\n설명에 합쳐진 플레이 가이드');
    await section('상태값');
    await section('작품 개요');
    await expect(form.getByRole('textbox', { name: '작품 설명', exact: true })).toHaveValue(
      '## 안내\n설명에 합쳐진 플레이 가이드',
    );
    await section('등장 캐릭터');
    await expect(form.getByRole('textbox', { name: /^이름/ })).toHaveValue('첫 번째 인물');
  });
}
