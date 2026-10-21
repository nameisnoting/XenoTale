import { creatorSection } from './helpers/creator';
import { test, expect, type Page } from '@playwright/test';
import { codeApproval } from '../src/domain/codeValidation';
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
  test(`버튼 변경은 본문에 숨기고 로그·상태·배경·읽던 줄 유지 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await start(page);
    await changeRoom(page, {
      settings: { uiType: 'visual-novel' },
      work: {
        openings: [
          {
            id: 'opening',
            name: '정원',
            body: '읽던 첫 줄\n읽던 다음 줄',
            presence: [],
            suggestions: [],
          },
        ],
        media: {
          template: '',
          characters: [],
          situations: [],
          assets: [
            {
              id: 'scene',
              name: '선택 장면',
              url: '/artwork.png?selected-scene',
              type: 'image/png',
              size: 1,
            },
          ],
        },
        actions: [
          {
            id: 'choose',
            name: '검술 선택',
            trigger: 'button',
            mode: 'all',
            conditions: [],
            steps: [
              { kind: 'set', target: 'affinity', value: '17' },
              { kind: 'background', target: '', value: 'scene' },
            ],
          },
        ],
      },
    });
    await page
      .locator('.action-buttons')
      .getByRole('button', { name: '검술 선택', exact: true })
      .click();
    await expect(page.locator('.visual-novel-copy')).toHaveText('읽던 첫 줄');
    await expect(page.locator('.visual-novel-image')).toHaveAttribute(
      'src',
      '/artwork.png?selected-scene',
    );
    const saved = await page.evaluate(
      () =>
        new Promise<any>((resolve) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('rooms').objectStore('rooms').getAll();
            read.onsuccess = () => {
              db.close();
              resolve(read.result.at(-1));
            };
          };
        }),
    );
    expect(saved.current.runtime.status.affinity).toBe(17);
    expect(saved.timeline.at(-1)).toMatchObject({
      kind: 'action',
      body: '검술 선택',
      changes: ['검술 선택'],
    });
    await page.getByRole('button', { name: '상태창 보기', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '상태창', exact: true })).toContainText('17');
    await page.getByRole('button', { name: '상태창 닫기', exact: true }).click();
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(page.locator('.visual-novel-copy')).toHaveText('읽던 다음 줄');
    await page.reload();
    await expect(page.locator('.visual-novel-copy')).toHaveText('읽던 다음 줄');
    await expect(page.locator('.visual-novel-image')).toHaveAttribute(
      'src',
      '/artwork.png?selected-scene',
    );
    if (width < 800) await page.getByRole('button', { name: '대화 로그', exact: true }).click();
    const log = page.locator('.conversation-log');
    await expect(log).toContainText('행동·설정 변경');
    await expect(log).toContainText('검술 선택');
    await log.getByRole('button', { name: /행동·설정 변경/ }).click();
    await expect(page.locator('.visual-novel-copy')).toHaveText('읽던 첫 줄');
    await page.getByRole('button', { name: '소설 모드로 전환', exact: true }).click();
    await expect(page.locator('.chat-scroll')).toContainText('읽던 첫 줄');
    await expect(page.locator('.chat-scroll')).not.toContainText('검술 선택');
    await expect(page.locator('.chapter-scene')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.chat-scroll')).not.toContainText('검술 선택');
    await expect(page.locator('.chapter-scene')).toHaveCount(0);
  });

test('본문에 버튼 실행 문구를 남기지 않아도 연결된 연출은 정확한 출처로 실행', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const content =
    '<button id="finish">결과 확정</button><script>document.getElementById("finish").onclick=()=>XenoTale.complete({summary:"연출 결과 보관"});</script>';
  await changeRoom(page, {
    work: {
      actions: [
        {
          id: 'show',
          name: '연출 실행 기록',
          trigger: 'button',
          mode: 'all',
          conditions: [],
          steps: [{ kind: 'effect', target: 'fx', value: '' }],
        },
      ],
      effects: [
        { id: 'fx', name: '연결 화면', prompt: '', content, validation: codeApproval(content) },
      ],
    },
  });
  await page
    .locator('.action-buttons')
    .getByRole('button', { name: '연출 실행 기록', exact: true })
    .click();
  await expect(page.locator('.chat-scroll')).not.toContainText('연출 실행 기록');
  await expect(page.locator('.chapter-scene')).toHaveCount(0);
  await page
    .locator('.chat-scroll')
    .getByRole('button', { name: '연결 화면 보기', exact: true })
    .click();
  await page
    .frameLocator('iframe.effect-frame')
    .getByRole('button', { name: '결과 확정', exact: true })
    .click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await expect(page.locator('.conversation-log')).toContainText('연출 결과 보관');
  await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
  const copy = (await page.locator('.visual-novel-copy').textContent())!;
  await page
    .locator('.action-buttons')
    .getByRole('button', { name: '연출 실행 기록', exact: true })
    .click();
  await expect(page.locator('.visual-novel-copy')).toContainText(copy);
  await page
    .locator('.visual-novel-copy')
    .getByRole('button', { name: '연결 화면 보기', exact: true })
    .click();
  await page
    .frameLocator('iframe.effect-frame')
    .getByRole('button', { name: '결과 확정', exact: true })
    .click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  const autoContent =
    '<script>XenoTale.ready.then(()=>XenoTale.complete({summary:"버튼 자동 연출 완료"}));</script>';
  await changeRoom(page, {
    work: {
      effects: [
        {
          id: 'fx',
          name: '연결 화면',
          mode: 'auto',
          prompt: '',
          content: autoContent,
          validation: codeApproval(autoContent),
        },
      ],
    },
  });
  await page
    .locator('.action-buttons')
    .getByRole('button', { name: '연출 실행 기록', exact: true })
    .click();
  await expect(page.locator('.conversation-log')).toContainText('버튼 자동 연출 완료');
  await expect(page.locator('.effect-player')).toHaveCount(0);
  await expect(page.locator('.visual-novel-copy')).toContainText(
    copy.replace('연결 화면 보기', '').trim(),
  );
  await expect(page.locator('.visual-novel-copy')).not.toContainText('연출 실행 기록');
});

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
    await expect(vn.locator('.visual-novel-image')).toHaveClass(/is-portrait/);
    const image = await vn.boundingBox(),
      box = await vn.locator('.visual-novel-textbox').boundingBox();
    expect(image!.y + image!.height - box!.y - box!.height).toBeCloseTo(80, 0);
    const badge = await vn.locator('.visual-novel-name').boundingBox();
    const copy = await vn.locator('.visual-novel-copy').boundingBox();
    expect(badge!.y + badge!.height / 2).toBeCloseTo(box!.y, 0);
    expect(copy!.y).toBeGreaterThanOrEqual(badge!.y + badge!.height + 6);
    expect(
      await vn.locator('.visual-novel-name').evaluate((element) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = getComputedStyle(element).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      }),
    ).toBe(255);
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
    await expect(vn.locator('.visual-novel-copy')).toHaveText('첫 번째 대사');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(vn.locator('.visual-novel-copy')).toHaveText('두 번째 대사');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(vn.locator('.visual-novel-choices button')).toHaveCount(2);
    await expect(vn.locator('.visual-novel-name')).toHaveCount(0);
    expect((await vn.locator('.visual-novel-copy').boundingBox())!.y).toBeCloseTo(copy!.y, 0);
    expect((await vn.locator('.visual-novel-textbox').boundingBox())!.height).toBeCloseTo(
      box!.height,
      0,
    );
    await expect(vn.locator('.visual-novel-copy em')).toHaveCSS('color', 'rgb(255, 255, 255)');
    const choice = vn.locator('.visual-novel-choices button').first();
    const choiceBackground = await choice.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await choice.hover();
    await expect(choice).toHaveCSS('background-color', choiceBackground);
    await expect(choice).toHaveCSS('opacity', '0.9');
    await page.screenshot({ path: `test-results/visual-novel-hover-${width}.png` });
    await choice.click();
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

test('인라인/독립 연출 자동 재생 · 완료 후 다음 줄 · 중복 저장 없음', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  const effect = {
    id: 'auto',
    mode: 'auto',
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
  await expect(page.locator('.visual-novel-copy')).toHaveText('테스트');
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
  await page.getByRole('button', { name: '화면 연출 보기', exact: true }).click();
  await page.frameLocator('iframe.effect-frame').getByRole('button', { name: '화면 변경' }).click();
  await expect(page.locator('.effect-player')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
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
  await expect(page.locator('.visual-novel-copy')).toHaveText('테스트');
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
  await page.getByRole('button', { name: '다음 대사', exact: true }).click();
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
  await page.getByRole('button', { name: '고급설정', exact: false }).click();
  await creatorSection(page, 1440, '연출');
  await page.getByRole('tab', { name: '수동연출', exact: true }).click();
  await page.getByRole('button', { name: '연출 추가', exact: true }).click();
  const code = page.getByRole('textbox', { name: '코드 입력', exact: true });
  const validation = page.locator('.code-validation');
  const status = validation.getByRole('status');
  const inspect = validation.getByRole('button', { name: '유효성 검사', exact: true });
  await expect(status).toHaveText('코드 없음');
  await expect(inspect).toBeDisabled();
  await expect(validation.getByRole('alert')).toHaveCount(0);
  await code.fill('<h1>안전한 연출</h1>');
  await expect(status).toHaveText('검사 필요');
  await inspect.click();
  await expect(status).toHaveText('검사 중…');
  await expect(status).toHaveText('검사 완료');
  await code.fill('<script>fetch("https://example.com/collect")</script>');
  await expect(status).toHaveText('검사 필요');
  await inspect.click();
  await expect(status).toHaveText('유효하지 않음');
  await expect(validation.getByRole('alert')).toContainText('외부 통신');
  await code.fill('<script>throw new Error("연출 테스트 오류");</script>');
  await expect(status).toHaveText('검사 필요');
  await expect(validation.getByRole('alert')).toHaveCount(0);
  await inspect.click();
  await expect(status).toHaveText('유효하지 않음');
  await expect(validation.getByRole('alert')).toContainText('연출 테스트 오류');
  await expect(page.getByRole('button', { name: '제작완료', exact: true })).toBeDisabled();
  await code.fill('   ');
  await expect(status).toHaveText('코드 없음');
  await expect(inspect).toBeDisabled();
  await expect(validation.getByRole('alert')).toHaveCount(0);
});
