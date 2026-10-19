import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page
    .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
    .click();
  await page.waitForURL(/#\/create\//);
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  const role = width < 800 ? 'tab' : 'button';
  await page.getByRole('textbox', { name: /^제목/ }).fill('선택형 모험');
  await page
    .getByRole('textbox', { name: /^프롬프트/ })
    .first()
    .fill('선택한 종족과 클래스로 모험을 진행합니다.');
  await nav.getByRole(role, { name: '도입부', exact: false }).click();
  await page.getByRole('textbox', { name: /^내용/ }).fill('캐릭터를 만들고 모험을 시작하세요.');
  await nav.getByRole('button', { name: '고급설정', exact: true }).click();
  await nav.getByRole(role, { name: '상태값', exact: true }).click();
  await page
    .locator('.creator-sticky-tabs')
    .getByRole('tab', { name: '세부규칙', exact: true })
    .click();
  const add = page.getByRole('button', { name: '규칙 추가', exact: true });
  const help = page.locator('details.rule-help');
  const a = (await add.boundingBox())!,
    b = (await help.boundingBox())!;
  expect(b.y - a.y - a.height).toBeCloseTo(16, 0);
  await page
    .locator('.creator-sticky-tabs')
    .getByRole('tab', { name: '상태창', exact: true })
    .click();
  await page.getByRole('button', { name: '캐릭터 만들기 예시 추가', exact: true }).click();
  return { nav, role } as const;
}

test('수동연출의 규칙 버튼 삽입·격리 실행·연속 실행·결과 확정', async ({ page }) => {
  const { nav, role } = await start(page, 1440);
  await nav.getByRole(role, { name: '도입부', exact: false }).click();
  await page.getByRole('textbox', { name: /^내용/ }).fill('{{종족 선택}}');
  await nav.getByRole(role, { name: '연출', exact: true }).click();
  await page.getByRole('tab', { name: '수동연출', exact: true }).click();
  await page.getByRole('button', { name: '연출 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('종족 선택');
  await page.getByRole('combobox', { name: '규칙 실행 버튼 넣기', exact: true }).click();
  await page.getByRole('option', { name: '엘프', exact: true }).click();
  const code = page.getByRole('textbox', { name: '코드 입력', exact: true });
  const inserted = await code.inputValue();
  expect(inserted).toContain('XenoTale.action(');
  await code.fill(
    inserted +
      `<p id="clicks">0</p><button id="finish">확정</button><script>{let clicks=0;document.querySelector('button').addEventListener('click',()=>document.getElementById('clicks').textContent=String(++clicks));document.getElementById('finish').onclick=()=>XenoTale.complete({summary:'엘프 선택 완료'});}</script>`,
  );
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('검사 완료');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  const previewFrame = page.frameLocator('iframe.effect-frame');
  await previewFrame.getByRole('button', { name: '엘프', exact: true }).click();
  await expect(previewFrame.getByRole('button', { name: '엘프', exact: true })).toBeEnabled();
  await previewFrame.getByRole('button', { name: '확정', exact: true }).click();
  await expect(page.locator('.effect-feedback')).toContainText('미리보기 결과');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await page
    .locator('.creator-test')
    .getByRole('button', { name: '종족 선택 보기', exact: true })
    .click();
  const frame = page.frameLocator('iframe.effect-frame');
  await frame.getByRole('button', { name: '엘프', exact: true }).click();
  await expect(frame.locator('#clicks')).toHaveText('1');
  await expect(frame.getByRole('button', { name: '엘프', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '엘프', exact: true }).click();
  await expect(frame.locator('#clicks')).toHaveText('2');
  await expect(frame.getByRole('button', { name: '엘프', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '확정', exact: true }).click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  const game = page.locator('.creator-test .game-panel');
  await expect(game.getByRole('button', { name: '엘프', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByText('저장완료', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await expect(game.getByRole('button', { name: '엘프', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '제작완료', exact: true }).click();
  await expect(page.getByText(/내 라이브러리에 반영했습니다/)).toBeVisible();
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '선택형 모험 대화 시작', exact: true }).click();
  await page.getByRole('button', { name: '종족 선택 보기', exact: true }).click();
  await frame.getByRole('button', { name: '엘프', exact: true }).click();
  await expect(frame.getByRole('button', { name: '엘프', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '확정', exact: true }).click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await expect(
    page.locator('.opening-scene .game-panel').getByRole('button', { name: '엘프', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [1440, 393]) {
  test(`코드 없는 게임 화면·제작 미리보기·테스트·실제 대화·저장 복원·VN ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [],
      paid: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.url().includes('/chat/completions')) paid.push(r.url());
    });
    await start(page, width);
    const card = page.locator('.status-panel-editor').last();
    await card.getByRole('button', { name: '미리보기', exact: true }).click();
    const preview = card.getByRole('region', { name: '캐릭터 만들기', exact: true });
    await expect(
      preview.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }),
    ).toBeDisabled();
    await preview.getByRole('button', { name: '엘프', exact: true }).click();
    await expect(preview.getByRole('button', { name: '엘프', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await preview.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }).click();
    await expect(preview.getByRole('button', { name: '엘프', exact: true })).toHaveCount(0);
    await preview.getByRole('button', { name: '마법사', exact: true }).click();
    await preview.getByRole('button', { name: '확인 · 다음 ▶', exact: true }).click();
    await expect(preview).toContainText('HP: 8');
    await page.screenshot({ path: `docs/screenshots/native-preview-${width}.png`, fullPage: true });
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    const testPanel = page
      .locator('.creator-test')
      .getByRole('region', { name: '캐릭터 만들기', exact: true });
    await expect(testPanel).toContainText('현재 선택: 미선택');
    await testPanel.getByRole('button', { name: '인간', exact: true }).click();
    await testPanel.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }).click();
    await page.getByText('저장완료', { exact: true }).waitFor();
    await page.reload();
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '제작 서포터', exact: true })
        .click();
    }
    await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
    await expect(testPanel).toContainText('2/3 · 클래스');
    if (width < 800) {
      await page
        .locator('.editor-rail')
        .getByRole('button', { name: '작업공간', exact: true })
        .click();
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    }
    await page.getByRole('button', { name: '제작완료', exact: true }).click();
    await expect(page.getByText(/내 라이브러리에 반영했습니다/)).toBeVisible();
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page.getByRole('button', { name: '선택형 모험 대화 시작', exact: true }).click();
    const game = page
      .locator('.opening-scene')
      .getByRole('region', { name: '캐릭터 만들기', exact: true });
    await expect(game).toContainText('현재 선택: 미선택');
    await expect(page.locator('.action-buttons')).toHaveCount(0);
    await game.getByRole('button', { name: '엘프', exact: true }).click();
    await game.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }).click();
    await page.reload();
    await expect(game).toContainText('2/3 · 클래스');
    await game.getByRole('button', { name: '마법사', exact: true }).click();
    await game.getByRole('button', { name: '◀ 종족 · 이전', exact: true }).click();
    await expect(game.getByRole('button', { name: '엘프', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await game.getByRole('button', { name: '클래스 · 다음 ▶', exact: true }).click();
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
    await page.getByRole('button', { name: '상태창 보기', exact: true }).click();
    const overlay = page.getByRole('dialog', { name: '상태창', exact: true });
    const vnGame = overlay.getByRole('region', { name: '캐릭터 만들기', exact: true });
    await expect(vnGame.getByRole('button', { name: '마법사', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await vnGame.getByRole('button', { name: '확인 · 다음 ▶', exact: true }).click();
    await expect(vnGame).toContainText('HP: 8');
    await vnGame.getByRole('button', { name: '이 캐릭터로 시작', exact: true }).click();
    await expect(vnGame).toContainText('캐릭터 준비 완료');
    await page.screenshot({ path: `docs/screenshots/native-game-${width}.png`, fullPage: true });
    expect(paid).toEqual([]);
    expect(errors).toEqual([]);
  });
}
