import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_CHAT_UI, codeApproval } from '../src/domain/chatUi';
test.use({ hasTouch: true });

async function start(page: Page) {
  await page.route('https://openrouter.ai/api/v1/models', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
}
async function changeRoom(page: Page, patch: any) {
  await page.evaluate(
    (patch) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('xenotale-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('rooms', 'readwrite'),
            store = tx.objectStore('rooms'),
            req = store.getAll();
          req.onsuccess = () => {
            const room = req.result.at(-1);
            Object.assign(room.work, patch.work ?? {});
            if (patch.work?.openings) room.work.openings[0].id = room.openingId;
            Object.assign(room.current.context.settings, patch.settings ?? {});
            room.revision++;
            store.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    patch,
  );
  await page.reload();
}
for (const width of [1440, 393])
  test(`비주얼노벨 ${width}px · 줄 이동/유지 · 상태 레이어 · 화면 전환 · 페르소나 입력`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await start(page);
    await changeRoom(page, {
      settings: { uiType: 'visual-novel' },
      work: {
        openings: [
          {
            id: 'opening-gate',
            name: '정원',
            body: '@아리아: 첫 번째 대사\n두 번째 대사\n\n*마지막 지문*',
            suggestions: ['선택 A', '선택 B'],
            bgm: '',
            presence: ['aria'],
          },
        ],
      },
    });
    const vn = page.locator('.visual-novel');
    await expect(vn).toBeVisible();
    await expect(vn.locator('.visual-novel-name')).toHaveText('아리아');
    await expect(vn.locator('.visual-novel-copy')).toHaveText('첫 번째 대사');
    await expect(page.locator('.chat-header')).toHaveCSS('height', '0px');
    await expect(page.locator('.chat-room-name')).toBeHidden();
    await expect(page.getByRole('button', { name: '메인으로', exact: true })).toHaveCSS(
      'border-radius',
      '50%',
    );
    await expect(vn.locator('.visual-novel-image')).toHaveCSS('object-fit', 'scale-down');
    const image = await vn.boundingBox(),
      box = await vn.locator('.visual-novel-textbox').boundingBox();
    expect(image!.y + image!.height - box!.y - box!.height).toBeCloseTo(80, 0);
    const badge = await vn.locator('.visual-novel-name').boundingBox();
    const copy = await vn.locator('.visual-novel-copy').boundingBox();
    expect(badge!.y + badge!.height / 2).toBeCloseTo(box!.y, 0);
    expect(copy!.y).toBeGreaterThan(badge!.y + badge!.height + 8);
    const beforeHidden = await vn.boundingBox();
    await page.getByRole('button', { name: 'UI 숨기기', exact: true }).click();
    await expect(page.locator('.chat-shell')).toHaveClass(/vn-ui-hidden/);
    await expect(vn.locator('.visual-novel-dialogue')).toBeHidden();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: '메인으로', exact: true })).toBeHidden();
    const afterHidden = await vn.boundingBox();
    expect(afterHidden!.height).toBeGreaterThan(beforeHidden!.height + 100);
    if (width === 393) {
      await page.touchscreen.tap(
        afterHidden!.x + afterHidden!.width / 2,
        afterHidden!.y + afterHidden!.height / 2,
      );
    } else {
      await page.mouse.click(afterHidden!.x + 20, afterHidden!.y + 20);
    }
    await expect(page.locator('.chat-shell')).not.toHaveClass(/vn-ui-hidden/);
    await expect(vn.locator('.visual-novel-copy')).toHaveText('첫 번째 대사');
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(vn.locator('.visual-novel-copy')).toHaveText('두 번째 대사');
    await page.reload();
    await expect(vn.locator('.visual-novel-copy')).toHaveText('두 번째 대사');
    await page.getByRole('button', { name: '상태창 보기' }).click();
    await expect(page.getByRole('dialog', { name: '상태창', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '상태창', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '소설 모드로 전환' }).click();
    await expect(vn).toHaveCount(0);
    await page.reload();
    await expect(vn).toHaveCount(0);
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환' }).click();
    await expect(vn.locator('.visual-novel-copy')).toHaveText('두 번째 대사');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(vn.locator('.visual-novel-choices button')).toHaveCount(2);
    await expect(vn.locator('.visual-novel-copy em')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await vn.locator('.visual-novel-choices button').first().click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toHaveValue('선택 A');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.visual-novel-waiting')).toHaveCount(0);
    for (
      let i = 0;
      i < 10 && !(await page.getByRole('button', { name: '리롤', exact: true }).count());
      i++
    )
      await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(page.getByRole('button', { name: '리롤', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/visual-novel-${width}.png` });
    expect(errors).toEqual([]);
  });

test('제작자 UI 실제 컴포넌트 연결 · 독립 선택 · 숨긴 필수 영역 자동 복구', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const code = DEFAULT_CHAT_UI.replace(
    '340px minmax(300px,1fr) 340px',
    '280px minmax(300px,1fr) 300px',
  );
  await changeRoom(page, {
    work: { chatUi: { code, validation: codeApproval(code) } },
    settings: { uiType: 'visual-novel' },
  });
  await expect(page.locator('.chat-shell')).toHaveClass(/author-chat/);
  const authored = page.frameLocator('iframe.author-layout-frame');
  await authored
    .locator('body')
    .evaluate((element) => element.setAttribute('data-execution-marker', 'kept'));
  await page.getByRole('button', { name: '소설 모드로 전환', exact: true }).click();
  await expect(authored.locator('html')).toHaveAttribute('data-ui-type', 'novel');
  await expect(authored.locator('body')).toHaveAttribute('data-execution-marker', 'kept');
  await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
  await expect(authored.locator('html')).toHaveAttribute('data-ui-type', 'visual-novel');
  const stage = page.locator('.visual-novel');
  const initialStage = await stage.boundingBox();
  const header = await page.locator('.chat-header').boundingBox();
  expect(initialStage!.y).toBeCloseTo(header!.y, 0);
  await page.getByRole('button', { name: 'UI 숨기기', exact: true }).click();
  const fullStage = await stage.boundingBox();
  expect(fullStage!.height).toBeGreaterThan(initialStage!.height + 100);
  // A click elsewhere also restores the UI, without selecting that menu.
  await page.getByRole('button', { name: '환경설정', exact: true }).click();
  await expect(page.locator('.chat-shell')).not.toHaveClass(/vn-ui-hidden/);
  await expect(page.locator('.chat-panel-content .setting-card')).toHaveCount(0);
  const workspace = await page.locator('.chat-workspace').boundingBox();
  expect(workspace!.width).toBeCloseTo(280, 0);
  await page.getByRole('button', { name: '환경설정', exact: true }).click();
  await expect(page.getByRole('group', { name: '화면 디자인', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '기본 UI', exact: true }).click();
  await expect(page.locator('.chat-shell')).not.toHaveClass(/author-chat/);
  await expect(page.locator('.visual-novel')).toBeVisible();
  await page.reload();
  await expect(page.locator('.chat-shell')).not.toHaveClass(/author-chat/);
  await page.getByRole('button', { name: '환경설정', exact: true }).click();
  await page.getByRole('radio', { name: '제작자 UI', exact: true }).click();
  await expect(page.locator('.chat-shell')).toHaveClass(/author-chat/);
  await changeRoom(page, {
    work: { chatUi: { enabled: false, code, validation: codeApproval(code) } },
  });
  await expect(page.locator('.chat-shell')).not.toHaveClass(/author-chat/);
  await expect(page.locator('iframe.author-layout-frame')).toHaveCount(0);
  await page.getByRole('button', { name: '환경설정', exact: true }).click();
  await expect(page.getByRole('group', { name: '화면 디자인', exact: true })).toHaveCount(0);
  const bad = code + '<style>[data-xenotale-slot="composer"]{display:none}</style>';
  await changeRoom(page, { work: { chatUi: { code: bad, validation: codeApproval(bad) } } });
  await expect(page.locator('.author-ui-error')).toContainText('기본 UI로 전환');
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
});

test('대화방 UI 수동 검사 게이트 · 코드 변경 후 재검사 · 실제 미리보기', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await expect(page.getByRole('button', { name: '미디어', exact: true })).toBeVisible();
  const sections = await page.locator('.editor-nav').getByRole('button').allTextContents();
  expect(sections[sections.indexOf('미디어') + 1]).toBe('추천 페르소나');
  expect(sections[sections.indexOf('대화방 UI') + 1]).toBe('플레이가이드');
  await page.getByRole('textbox', { name: /^제목/ }).fill('기본 UI 작품');
  await page.getByRole('textbox', { name: /^프롬프트/ }).fill('차분한 이야기');
  await page.getByRole('button', { name: '등장 캐릭터', exact: false }).click();
  await page.getByRole('textbox', { name: /^이름/ }).fill('안내인');
  await page.getByRole('textbox', { name: /^캐릭터 프롬프트/ }).fill('차분한 안내인');
  await page.getByRole('button', { name: '도입부', exact: false }).click();
  await page.getByRole('textbox', { name: /^내용/ }).fill('이야기가 시작됩니다.');
  await page.getByRole('button', { name: '대화방 UI', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'UI 변경', exact: true });
  const code = page.getByRole('textbox', { name: '코드 입력', exact: true });
  const publish = page.getByRole('button', { name: '제작완료', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(code).toHaveCount(0);
  await expect(page.getByRole('button', { name: '미리보기', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '유효성 검사', exact: true })).toHaveCount(0);
  await expect(publish).toBeEnabled();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(publish).toBeDisabled();
  await expect(code).toHaveValue(DEFAULT_CHAT_UI);
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('검사 통과');
  await expect(publish).toBeEnabled();
  await code.fill(DEFAULT_CHAT_UI + '\n<!--바뀐 코드-->');
  await expect(page.locator('.code-validation')).toContainText('검사 필요');
  await expect(publish).toBeDisabled();
  await code.fill(
    DEFAULT_CHAT_UI.replaceAll('data-xenotale-slot="composer"', 'data-xenotale-slot="없음"'),
  );
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('composer: 필수');
  await expect(page.getByRole('button', { name: '제작완료', exact: true })).toBeDisabled();
  await code.fill(DEFAULT_CHAT_UI);
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '대화방 UI 미리보기' })).toBeVisible();
  await expect(page.locator('.chat-ui-preview .chat-shell')).toHaveClass(/author-chat/);
  await expect(
    page.locator('.chat-ui-preview').getByRole('textbox', { name: '메시지', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '미리보기 닫기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '대화방 UI 미리보기' })).toHaveCount(0);
  await toggle.click();
  await expect(code).toHaveCount(0);
  await expect(publish).toBeEnabled();
  await toggle.click();
  await expect(code).toHaveValue(DEFAULT_CHAT_UI);
  await expect(publish).toBeDisabled();
});

test('인라인/독립 연출 자동 재생 · 완료 후 다음 줄 · 중복 저장 없음', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const effect = {
    id: 'auto',
    name: '자동 연출',
    prompt: '',
    content:
      '<h1>자동 연출</h1><script>XenoTale.ready.then(()=>XenoTale.complete({summary:"완료"}));</script>',
  };
  await changeRoom(page, { settings: { uiType: 'visual-novel' }, work: { effects: [effect] } });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('xenotale-v1');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('rooms', 'readwrite'),
            s = tx.objectStore('rooms'),
            r = s.getAll();
          r.onsuccess = () => {
            const room = r.result.at(-1);
            room.work.openings[0].body =
              '첫 줄 {{자동 연출}}\n두 번째 줄\n{{자동 연출}}\n마지막 줄';
            s.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.locator('.visual-novel-copy')).toHaveText('첫 줄');
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
  await expect(page.locator('.visual-novel-copy')).toHaveText('두 번째 줄');
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
  await expect(page.locator('.visual-novel-copy')).toHaveText('마지막 줄');
  await expect(page.locator('.visual-novel-choices button')).toHaveCount(3);
  await expect(page.locator('.effect-player')).toHaveCount(0);
  await page.getByRole('button', { name: '이전 대사', exact: true }).click();
  await expect(page.locator('.effect-player')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.effect-player')).toHaveCount(0);
});

test('연출의 배경·음악·테마 변경 저장 · 응답 삭제로 복원', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('테스트');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  const content = `<button id="apply">화면 변경</button><script>document.getElementById('apply').onclick=async()=>{await XenoTale.background('1/1');await XenoTale.music(null);await XenoTale.ui({theme:{textbox:'#123456',text:'#ffffff'}});await XenoTale.complete({summary:'화면 변경 완료'});await XenoTale.close();};</script>`;
  await changeRoom(page, {
    settings: { uiType: 'visual-novel' },
    work: {
      effects: [
        { id: 'screen', name: '화면 연출', content, prompt: '', validation: codeApproval(content) },
      ],
      media: {
        template: '/artwork.png?scene={{char_code}}-{{situation_code}}',
        characters: [{ code: '1', characterId: 'aria' }],
        situations: [{ code: '1', name: '장면' }],
      },
    },
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('xenotale-v1');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('rooms', 'readwrite'),
            s = tx.objectStore('rooms'),
            r = s.getAll();
          r.onsuccess = () => {
            const room = r.result.at(-1),
              turn = room.timeline[0];
            turn.candidates.find((candidate: any) => candidate.id === turn.selectedId).body =
              '첫 대사 {{화면 연출}}\n다음 대사';
            s.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
  await page.frameLocator('iframe.effect-frame').getByRole('button', { name: '화면 변경' }).click();
  await expect(page.locator('.effect-player')).toHaveCount(0);
  await expect(page.locator('.visual-novel-copy')).toHaveText('다음 대사');
  await expect(page.locator('.visual-novel-textbox')).toHaveCSS(
    'background-color',
    'rgb(18, 52, 86)',
  );
  await expect(page.locator('.visual-novel-image')).toHaveAttribute(
    'src',
    '/artwork.png?scene=1-1',
  );
  await page.reload();
  await expect(page.locator('.visual-novel-textbox')).toHaveCSS(
    'background-color',
    'rgb(18, 52, 86)',
  );
  await page.getByRole('button', { name: '마지막 대화 삭제', exact: true }).click();
  await page.getByRole('button', { name: 'AI 응답 삭제 · 내 입력 유지', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toHaveValue('테스트');
  await expect(page.locator('.visual-novel-textbox')).toHaveCSS(
    'background-color',
    'rgba(28, 28, 28, 0.7)',
  );
});

test('연출 코드 검증 · 실행 오류/외부 통신 거절 · 편집으로 통과 상태 해제', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('button', { name: '연출', exact: true }).click();
  await page.getByRole('button', { name: '연출 추가', exact: true }).click();
  const code = page.getByRole('textbox', { name: '코드 입력', exact: true });
  await code.fill('<h1>안전한 연출</h1>');
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('검사 통과');
  await code.fill('<script>fetch("https://example.com/collect")</script>');
  await expect(page.locator('.code-validation')).toContainText('검사 필요');
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('외부 통신');
  await code.fill('<script>throw new Error("연출 테스트 오류");</script>');
  await page.getByRole('button', { name: '유효성 검사', exact: true }).click();
  await expect(page.locator('.code-validation')).toContainText('연출 테스트 오류');
  await expect(page.getByRole('button', { name: '제작완료', exact: true })).toBeDisabled();
});
