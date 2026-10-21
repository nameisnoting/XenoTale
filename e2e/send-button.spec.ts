import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs/promises';
const emerald = 'rgb(95, 221, 206)';
const gray = 'rgb(78, 78, 78)';
const model = {
  id: 'test/send',
  name: '버튼 테스트 모델',
  context_length: 200000,
  supported_parameters: ['response_format'],
};
async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [model] } }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-send-button-key');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function appearance(button: Locator, color: string, size = 22) {
  const style = () =>
    button.evaluate((e) => {
      const css = getComputedStyle(e);
      return {
        background: css.backgroundColor,
        color: css.color,
        width: css.width,
        height: css.height,
        radius: css.borderRadius,
        opacity: css.opacity,
      };
    });
  expect(await style()).toEqual({
    background: color,
    color: 'rgb(255, 255, 255)',
    width: '26px',
    height: '26px',
    radius: '50%',
    opacity: '1',
  });
  expect(await button.locator('svg').getAttribute('width')).toBe(String(size));
  await button.hover();
  expect((await style()).background).toBe(color);
}
async function openSupport(page: Page, width: number) {
  if (width === 393) {
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-rail')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
}
async function chooseModel(page: Page) {
  await page.locator('.model-trigger:visible').click();
  await page.getByRole('button', { name: '버튼 테스트 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
}
for (const width of [1440, 393]) {
  test(`세 화면 전송 버튼 공통 크기·활성/비활성·호버 색상 (${width})`, async ({ page }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await appearance(page.getByRole('button', { name: '전송', exact: true }), emerald);
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await openSupport(page, width);
    const send = page.getByRole('button', { name: '서포터 전송', exact: true });
    await expect(send).toBeDisabled();
    await appearance(send, gray);
    await page.getByRole('textbox', { name: '서포터 메시지' }).fill('설정을 도와주세요');
    await expect(send).toBeEnabled();
    await appearance(send, emerald);
    await page.getByRole('textbox', { name: '서포터 메시지' }).fill('   ');
    await expect(send).toBeDisabled();
    await appearance(send, gray);
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await appearance(page.getByRole('button', { name: '테스트 전송', exact: true }), emerald);
    await fs.mkdir('docs/screenshots/send-button', { recursive: true });
    await page
      .getByRole('button', { name: '테스트 전송', exact: true })
      .screenshot({ path: `docs/screenshots/send-button/send-${width}.png` });
  });
  test(`대화방·서포터·테스트 생성 중단 공통 상태와 실제 취소 (${width})`, async ({ page }) => {
    await start(page, width);
    let calls = 0;
    let release = () => {};
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (r) => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await r.abort().catch(() => {});
    });
    const stop = async (sendLabel: string, stopLabel: string) => {
      const before = calls;
      await page.getByRole('button', { name: sendLabel, exact: true }).click();
      await expect.poll(() => calls).toBe(before + 1);
      const cancel = page.getByRole('button', { name: stopLabel, exact: true });
      await expect(cancel).toBeEnabled();
      await appearance(cancel, gray, 16);
      await cancel.click();
      release();
      await expect(page.getByRole('button', { name: sendLabel, exact: true })).toBeVisible();
      await expect(cancel).toHaveCount(0);
    };
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await chooseModel(page);
    await stop('전송', '생성 중단');
    await expect(page.locator('.conversation-turn')).toHaveCount(0);
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page
      .getByRole('button', { name: width === 393 ? '만들기' : '작품 만들기', exact: true })
      .click();
    const form = page.locator('.editor-form');
    await form.getByRole('textbox', { name: /^제목/ }).fill('버튼 검증');
    await form.getByRole('textbox', { name: /^프롬프트/ }).fill('정원 이야기');
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
    await section('도입부');
    await form.getByRole('textbox', { name: /^내용/ }).fill('정원에 오신 것을 환영합니다.');
    await openSupport(page, width);
    await chooseModel(page);
    await page.getByRole('textbox', { name: '서포터 메시지' }).fill('서포터 요청');
    await stop('서포터 전송', '서포터 생성 중단');
    await expect(page.getByRole('textbox', { name: '서포터 메시지' })).toHaveValue('서포터 요청');
    await expect(page.getByRole('button', { name: '서포터 전송', exact: true })).toBeEnabled();
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await chooseModel(page);
    await stop('테스트 전송', '테스트 생성 중단');
    await expect(page.locator('.creator-test .support-user')).toHaveCount(0);
  });
}
