import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const game = `<style>main{min-height:100dvh;display:grid;place-content:center;background:#142321;color:white;gap:20px;padding:80px 24px}button{padding:16px}</style>
<main><h1>레일건 테스트</h1><button id="win">퍼즐 성공</button><button id="again">결과 재전송</button><p id="reply"></p></main>
<script>
async function submit(){try{await XenoTale.complete({outcome:'success',summary:'자물쇠를 풀어 문이 열렸다.',score:100,data:{attempts:2}});document.getElementById('reply').textContent='전달 완료';}catch(e){document.getElementById('reply').textContent=e.message;}}
document.getElementById('win').onclick=submit;document.getElementById('again').onclick=submit;
</script>`;

async function rooms(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const open = indexedDB.open('xenotale-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('rooms').objectStore('rooms').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
        };
      }),
  );
}
async function seedEffect(page: Page, content = game) {
  await page.evaluate(
    (content) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('xenotale-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('rooms', 'readwrite');
          const store = tx.objectStore('rooms');
          const request = store.getAll();
          request.onsuccess = () => {
            const room = request.result[0];
            room.work.effects = [{ id: 'railgun', name: '레일건', prompt: '문을 열 때', content }];
            room.work.openings.find((o: any) => o.id === room.openingId).body =
              '*문 앞에 섰다.*\n\n{{레일건}}\n\n{{effect:railgun}}\n\n{{없는연출}}';
            room.revision++;
            store.put(room);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    content,
  );
}
async function start(page: Page, width = 1440, content = game) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
  await seedEffect(page, content);
  await page.reload();
  await page.setViewportSize({ width, height: 900 });
  await expect(page.getByRole('button', { name: '레일건 보기', exact: true })).toHaveCount(2);
}
for (const width of [1440, 393]) {
  test(`연출 수동 실행 · 전체 화면 · 결과 저장 · 다시 보기 · 다음 턴 · ${width}px`, async ({
    page,
  }) => {
    await start(page, width);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await rooms(page))[0].timeline).toHaveLength(0);
    const button = page.getByRole('button', { name: '레일건 보기', exact: true }).first();
    await button.click();
    const overlay = page.getByRole('dialog', { name: '레일건', exact: true });
    const bounds = (await overlay.boundingBox())!;
    expect(bounds).toEqual({ x: 0, y: 0, width, height: 900 });
    const frame = page.frameLocator('iframe[title="연출 실행 화면"]');
    await expect(frame.getByRole('heading', { name: '레일건 테스트' })).toBeVisible();
    await fs.mkdir('docs/screenshots/effects', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/effects/fullscreen-${width}.png` });
    await frame.getByRole('button', { name: '퍼즐 성공', exact: true }).click();
    await expect(overlay.getByRole('status')).toContainText('결과 저장완료');
    await frame.getByRole('button', { name: '결과 재전송', exact: true }).click();
    await expect(frame.locator('#reply')).toContainText('결과를 변경할 수 없습니다');
    expect((await rooms(page))[0].timeline).toHaveLength(1);
    await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
    await expect(button).toBeFocused();
    await page.reload();
    expect((await rooms(page))[0].current.runtime.effectResults[0].result.outcome).toBe('success');
    await button.click();
    await expect(overlay.getByRole('status')).toContainText('다시 보기');
    await frame.getByRole('button', { name: '퍼즐 성공', exact: true }).click();
    await expect(frame.locator('#reply')).toContainText('결과를 변경할 수 없습니다');
    // Escape is also relayed when keyboard focus is inside the isolated frame.
    await frame.getByRole('button', { name: '퍼즐 성공', exact: true }).press('Escape');
    await expect(overlay).toHaveCount(0);
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.conversation-turn')).toHaveCount(1);
    expect((await rooms(page))[0].current.runtime.effectResults).toHaveLength(1);
    // The unplayed second button from the older opening cannot change later progress.
    await page.getByRole('button', { name: '레일건 보기', exact: true }).nth(1).click();
    await expect(overlay.getByRole('status')).toContainText('다시 보기');
    await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

  test(`제작 연출 예시 · 게임 미리보기 · 시각 효과 종료 · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
    await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    await page
      .locator(width <= 800 ? '.editor-mobile-stages' : '.editor-nav')
      .getByRole('button', { name: '고급설정', exact: false })
      .click();
    if (width <= 800) await page.getByRole('tab', { name: '연출', exact: true }).click();
    else
      await page.locator('.editor-nav').getByRole('button', { name: '연출', exact: true }).click();
    await page.getByRole('button', { name: '연출 추가', exact: true }).click();
    await page.getByRole('button', { name: '열쇠 퍼즐 예시', exact: true }).click();
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const frame = page.frameLocator('iframe[title="연출 실행 화면"]');
    await frame.getByRole('textbox', { name: '세 자리 비밀번호', exact: true }).fill('246');
    await frame.getByRole('button', { name: '잠금 해제', exact: true }).click();
    await expect(page.locator('.effect-feedback')).toContainText('미리보기 결과');
    expect(await rooms(page)).toHaveLength(0);
    await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
    await page.getByRole('textbox', { name: '코드 입력', exact: true }).fill('');
    await page.getByRole('button', { name: '공포 노이즈 예시', exact: true }).click();
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.locator('#root')).toHaveAttribute('data-effect-screen', 'glitch');
    await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
    await expect(page.locator('#root')).not.toHaveAttribute('data-effect-screen', 'glitch');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.locator('.effect-player')).toHaveCount(0, { timeout: 6000 });
  });
}

test('연출 보안 경계 · 앱 접근/통신/외부 코드 차단 · 메시지 위조/잘못된 결과 거절', async ({
  page,
}) => {
  let blockedRequests = 0;
  await page.route('https://blocked.test/**', (route) => {
    blockedRequests++;
    return route.abort();
  });
  const content = `<main style="padding:100px 24px"><h1>격리 검사</h1><p id="boundary"></p><p id="result"></p><button id="bad">잘못된 결과</button></main>
  <script src="https://blocked.test/script.js"></script><script>
  let dom=false,storage=false;
  try { parent.document.querySelector('input'); dom=true; } catch {}
  try { localStorage.getItem('xenotale'); storage=true; } catch {}
  document.getElementById('boundary').textContent=JSON.stringify({dom,storage});
  fetch('https://blocked.test/fetch').catch(()=>{});
  document.getElementById('bad').onclick=async()=>{try{await XenoTale.complete({summary:'bad',delta:{}});}catch(e){document.getElementById('result').textContent=e.message;}};
  </script>`;
  await start(page, 1440, content);
  await page.getByRole('button', { name: '레일건 보기', exact: true }).first().click();
  await expect(page.locator('iframe[title="연출 실행 화면"]')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  const frame = page.frameLocator('iframe[title="연출 실행 화면"]');
  await expect(frame.locator('#boundary')).toHaveText('{"dom":false,"storage":false}');
  await frame.getByRole('button', { name: '잘못된 결과', exact: true }).click();
  await expect(frame.locator('#result')).toContainText('summary');
  await page.evaluate(() =>
    window.postMessage(
      { type: 'complete', requestId: 'forged', payload: { summary: '위조 결과' } },
      '*',
    ),
  );
  expect((await rooms(page))[0].timeline).toHaveLength(0);
  expect(blockedRequests).toBe(0);
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeEnabled();
});

test('게임 결과가 실제 API 요청의 동적 프롬프트에 포함됨 (모의 API)', async ({ page }) => {
  const model = {
    id: 'test/effect-model',
    name: '연출 테스트 모델',
    context_length: 200000,
    supported_parameters: [],
  };
  await page.route('https://openrouter.ai/api/v1/models', (r) =>
    r.fulfill({ json: { data: [model] } }),
  );
  await page.route('https://openrouter.ai/api/v1/key', (r) =>
    r.fulfill({ json: { data: { label: 'test' } } }),
  );
  await page.route('https://openrouter.ai/api/v1/credits', (r) =>
    r.fulfill({ json: { data: { total_credits: 10, total_usage: 0 } } }),
  );
  let request: any;
  await page.route('https://openrouter.ai/api/v1/chat/completions', (r) => {
    request = r.request().postDataJSON();
    return r.fulfill({
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                kind: 'turn',
                requestedCharacterIds: [],
                body: '@아리아: 문이 열렸네요.',
                choices: [],
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
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0 },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-effect-test');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: '연출 테스트 모델', exact: false }).click();
  await page.getByRole('button', { name: '선택 완료', exact: true }).click();
  await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
  const url = new URL(page.url()).hash;
  await seedEffect(page);
  await page.evaluate(() => {
    location.hash = '/';
  });
  await expect(
    page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }),
  ).toBeVisible();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, url);
  await page.getByRole('button', { name: '레일건 보기', exact: true }).first().click();
  await page
    .frameLocator('iframe[title="연출 실행 화면"]')
    .getByRole('button', { name: '퍼즐 성공', exact: true })
    .click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  const tail = JSON.parse(request.messages.at(-1).content);
  expect(tail.runtimeContext.effectResults[0].result).toEqual({
    outcome: 'success',
    summary: '자물쇠를 풀어 문이 열렸다.',
    score: 100,
    data: { attempts: 2 },
  });
  expect(JSON.stringify(request.messages)).not.toContain('id=\\"win\\"');
});

test('제작 서포터의 대화 테스트에서도 연출 결과를 임시 방에 반영', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('연출 테스트 작품');
  await page
    .getByRole('textbox', { name: /^프롬프트/, exact: false })
    .fill('문 앞에서 퍼즐을 풀고 이야기를 이어간다.');
  const section = async (name: string) => {
    const nav = page.locator('.editor-nav');
    if (!(await nav.getByRole('button', { name, exact: false }).count()))
      await nav.getByRole('button', { name: '고급설정', exact: false }).click();
    await nav.getByRole('button', { name, exact: false }).click();
  };
  await section('등장 캐릭터');
  await page.getByRole('textbox', { name: '이름', exact: false }).fill('아리아');
  await page
    .getByRole('textbox', { name: '캐릭터 프롬프트', exact: false })
    .fill('문을 지키는 안내인');
  await section('도입부');
  await page.getByRole('textbox', { name: '내용', exact: false }).fill('{{레일건}}');
  await section('연출');
  await page.getByRole('button', { name: '연출 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('레일건');
  await page.getByRole('textbox', { name: '코드 입력', exact: true }).fill(game);
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await page.getByRole('button', { name: '현재 설정으로 다시 시작', exact: true }).click();
  await page
    .locator('.creator-test')
    .getByRole('button', { name: '레일건 보기', exact: true })
    .click();
  await page
    .frameLocator('iframe[title="연출 실행 화면"]')
    .getByRole('button', { name: '퍼즐 성공', exact: true })
    .click();
  await expect(page.locator('.effect-feedback')).toContainText('결과 저장완료');
  await page.getByRole('button', { name: '연출 닫기', exact: true }).click();
  await page.getByRole('button', { name: '테스트 전송', exact: true }).click();
  await expect(page.locator('.creator-test .support-user')).toHaveCount(1);
  expect(await rooms(page)).toHaveLength(0);
});
