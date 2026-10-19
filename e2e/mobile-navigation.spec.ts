import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { Room } from '../src/domain/types';
const out = 'docs/screenshots/mobile-navigation';
async function start(page: Page) {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}
async function chat(page: Page) {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
}

test('대화 메뉴 묶음·작품정보 이름·새 대화방 열기와 기존 대화 보존', async ({ page }) => {
  await chat(page);
  const infoPrompt = page.getByRole('button', { name: '작품 정보 확인', exact: true });
  await expect(infoPrompt).toBeVisible();
  await page.screenshot({ path: `${out}/work-info-prompt.png` });
  await infoPrompt.click();
  await expect(page).toHaveURL(/\/panel\/info$/);
  await expect(page.getByRole('tab', { name: '작품', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '대화방 이름 수정', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '대화방 이름', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '이름 수정 취소', exact: true }).click();
  const originalUrl = page.url();
  const readRooms = () =>
    page.evaluate(
      () =>
        new Promise<Room[]>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const read = database.transaction('rooms', 'readonly').objectStore('rooms').getAll();
            read.onsuccess = () => {
              database.close();
              resolve(read.result);
            };
            read.onerror = () => {
              database.close();
              reject(read.error);
            };
          };
        }),
    );
  await page.getByRole('textbox', { name: '메시지', exact: true }).fill('기존 대화에 남길 메시지');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(infoPrompt).toHaveCount(0);
  await expect.poll(async () => (await readRooms())[0].timeline.length).toBe(1);
  const before = (await readRooms())[0];
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  const sheet = page.locator('dialog.bottom-sheet');
  expect(
    await sheet
      .locator('.sheet-menu-group')
      .evaluateAll((groups) =>
        groups.map((group) =>
          [...group.querySelectorAll('button > span')].map((e) => e.textContent),
        ),
      ),
  ).toEqual([
    ['작품정보', '플레이 가이드', '사용량'],
    ['유저노트', '유저 페르소나'],
    ['갤러리', '소지품', '챕터', '관계도'],
    ['기억 관리', '대화 품질 관리', '환경 설정'],
    ['새 대화방 열기'],
  ]);
  await page.screenshot({ path: `${out}/menu-groups.png` });
  for (const [name, id] of [
    ['작품정보', 'info'],
    ['사용량', 'usage'],
    ['플레이 가이드', 'info'],
  ]) {
    await sheet.getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/${id}$`));
    await expect(
      page.getByRole('main', { name: id === 'info' ? '작품정보' : name, exact: true }),
    ).toBeVisible();
    if (name === '플레이 가이드') {
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.locator('.work-guide')).toBeVisible();
    }
    await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  }
  await sheet.getByRole('button', { name: '작품정보', exact: true }).click();
  await expect(page.getByRole('tab', { name: '작품', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
  await page.goto(`${originalUrl}/panel/guide`);
  await expect(page).toHaveURL(`${originalUrl}/panel/info`);
  await expect(page.getByRole('tab', { name: '플레이 가이드', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await sheet.getByRole('button', { name: '새 대화방 열기', exact: true }).click();
  await expect(page).not.toHaveURL(originalUrl);
  await expect(page).toHaveURL(/#\/chat\/[^/]+$/);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  await expect(infoPrompt).toBeVisible();
  await expect.poll(async () => (await readRooms()).length).toBe(2);
  const rooms = await readRooms();
  const original = rooms.find((room) => room.id === before.id)!;
  const created = rooms.find((room) => room.id !== before.id)!;
  expect(original.timeline).toEqual(before.timeline);
  expect(original.current).toEqual(before.current);
  expect(created.work).toEqual(before.work);
  expect(created.timeline).toEqual([]);
  await page.goto(originalUrl);
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(infoPrompt).toHaveCount(0);
});
test('하단 네비게이션 · 색상 · 메인 도구 · 대화방과 제작에서는 미노출', async ({ page }) => {
  await start(page);
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await expect(nav).toBeVisible();
  expect(
    await nav
      .getByRole('button', { name: '메인', exact: true })
      .evaluate((e) => getComputedStyle(e).color),
  ).toBe('rgb(255, 255, 255)');
  expect(
    await nav
      .getByRole('button', { name: '대화목록', exact: true })
      .evaluate((e) => getComputedStyle(e).color),
  ).toBe('rgb(131, 131, 131)');
  await expect(page.locator('.main-toolbar button:visible')).toHaveCount(3);
  await expect(page.locator('.mobile-brand')).toHaveText('XenoTale');
  await page.screenshot({ path: `${out}/main.png` });
  await nav.getByRole('button', { name: '대화목록', exact: true }).click();
  await expect(page).toHaveURL(/#\/rooms$/);
  await expect(nav.getByRole('button', { name: '대화목록', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: '마이', exact: true }).click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.locator('.standalone-page')).toHaveCSS('overflow-y', 'auto');
  await nav.getByRole('button', { name: '메인', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(nav).toHaveCount(0);
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await nav.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(page).toHaveURL(/#\/create\//);
  await expect(nav).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('시트 핸들 고정 · 흐림 없는 배경 · 드래그에 따른 어둡기와 닫기', async ({ page }) => {
  await chat(page);
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  const sheet = page.locator('dialog.bottom-sheet');
  const handle = page.getByRole('button', { name: '대화 메뉴 크기 조절', exact: true });
  const before = (await handle.boundingBox())!;
  expect(await sheet.evaluate((e) => getComputedStyle(e, '::backdrop').backdropFilter)).toBe(
    'none',
  );
  const backdropAlpha = () =>
    sheet.evaluate((e) => {
      const color = getComputedStyle(e, '::backdrop').backgroundColor;
      return color.startsWith('rgba') ? Number(color.match(/[\d.]+/g)!.at(-1)) : 1;
    });
  const initialAlpha = await backdropAlpha();
  await sheet.locator('.modal-body').evaluate((e) => {
    e.scrollTop = 1000;
  });
  expect((await handle.boundingBox())!.y).toBe(before.y);
  expect(await sheet.locator('.modal-body').evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: `${out}/sheet-scrolled.png` });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const drag = async (fromY: number, toY: number, duringDrag?: () => Promise<void>) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 196, y: fromY }],
    });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 196, y: fromY + ((toY - fromY) * i) / 5 }],
      });
    if (duringDrag) await duringDrag();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await drag(before.y + 14, 20);
  await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(820);
  await expect.poll(backdropAlpha).toBeGreaterThan(initialAlpha);
  const expandedAlpha = await backdropAlpha();
  const expanded = (await handle.boundingBox())!;
  await drag(expanded.y + 14, expanded.y + 500, async () => {
    await expect.poll(backdropAlpha).toBeLessThan(expandedAlpha);
    await page.screenshot({ path: `${out}/sheet-lowered.png` });
  });
  await expect(sheet).toHaveCount(0);
});
test('대화 기능은 주소가 있는 페이지 · 브라우저 뒤로 가기 · 입력과 노트 유지', async ({ page }) => {
  await chat(page);
  const base = page.url();
  const input = page.getByRole('textbox', { name: '메시지', exact: true });
  await input.fill('아직 전송하지 않은 문장');
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await expect(page).toHaveURL(/\/panel\/notes$/);
  const notes = page.getByRole('main', { name: '유저노트', exact: true });
  await expect(notes).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await notes.getByRole('button', { name: '노트 추가', exact: true }).click();
  await notes
    .getByRole('textbox', { name: '프롬프트', exact: true })
    .last()
    .fill('이 문장은 저장됩니다.');
  await page.screenshot({ path: `${out}/notes-page.png` });
  await page.goBack();
  await expect(page).toHaveURL(base);
  await expect(input).toHaveValue('아직 전송하지 않은 문장');
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await expect(notes.getByRole('textbox', { name: '프롬프트', exact: true }).last()).toHaveValue(
    '이 문장은 저장됩니다.',
  );
  await page.reload();
  await expect(notes).toBeVisible();
  await expect(notes.getByRole('textbox', { name: '프롬프트', exact: true }).last()).toHaveValue(
    '이 문장은 저장됩니다.',
  );
  await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
  await expect(page).toHaveURL(base);
  await expect(page.locator('.chat-header')).not.toHaveClass(/is-scroll-hidden/);
  for (const [name, id] of [
    ['유저 페르소나', 'persona'],
    ['사용량', 'usage'],
    ['기억 관리', 'memory'],
    ['환경 설정', 'settings'],
  ]) {
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/${id}$`));
    await expect(page.getByRole('main', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '대화방으로 돌아가기', exact: true }).click();
    await expect(page).toHaveURL(base);
  }
});
test('로그는 오른쪽 사이드메뉴 · 바깥 터치와 Escape로 닫힘', async ({ page }) => {
  await chat(page);
  await expect(page.getByRole('button', { name: '메인으로', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: '대화 로그', exact: true });
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () =>
      Math.round((await drawer.boundingBox())!.x + (await drawer.boundingBox())!.width),
    )
    .toBe(393);
  const bounds = (await drawer.boundingBox())!;
  expect(bounds.width).toBeLessThan(393);
  expect(bounds.x + bounds.width).toBeCloseTo(393, 0);
  const header = (await drawer.locator('header').boundingBox())!;
  const events = (await drawer.locator('.log-events').boundingBox())!;
  // Short logs fill the available panel instead of ending after their last event.
  expect(events.y - header.y - header.height).toBeCloseTo(16, 0);
  expect(events.x - bounds.x).toBeCloseTo(17, 0); // 16px padding + 1px drawer border
  expect(bounds.y + bounds.height - events.y - events.height).toBeCloseTo(16, 0);
  await expect(
    drawer.locator('header').getByRole('button', { name: '사용량 보기', exact: true }),
  ).toBeVisible();
  await expect(drawer.locator('.log-events')).toContainText('1턴 종료');
  await page.screenshot({ path: `${out}/log-drawer.png` });
  await page
    .getByRole('button', { name: '대화 로그 닫기', exact: true })
    .click({ position: { x: 10, y: 300 } });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: '대화 로그', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('button', { name: '대화 로그', exact: true })).toBeFocused();
});
test('작품 메뉴 바깥 터치 · Escape · 중복 없이 작품 수정으로 편집 시작', async ({ page }) => {
  await start(page);
  const menu = page.getByRole('menu', { name: '작품 메뉴', exact: true });
  const trigger = page.getByRole('button', { name: '정원 앞에서 메뉴', exact: true });
  await trigger.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['작품 수정', '작품 내보내기', '작품 삭제']);
  await expect(menu.getByRole('menuitem', { name: '작업 공간으로 복사' })).toHaveCount(0);
  await page.locator('.mobile-brand').click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu.getByRole('menuitem', { name: '작품 수정', exact: true }).click();
  await expect(page).toHaveURL(/#\/create\//);
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue(
    '정원 앞에서',
  );
});

test('짧은 대화 최초 진입 헤더 · 긴 응답 삭제 후 스크롤 불가 시 헤더 복원', async ({ page }) => {
  await chat(page);
  const header = page.locator('.chat-header');
  const scroll = page.locator('.chat-scroll');
  await expect(header).not.toHaveClass(/is-scroll-hidden/);
  expect(await scroll.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await page.getByRole('button', { name: '대사 수정', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox')
    .fill(
      Array.from(
        { length: 60 },
        (_, i) => `*${i + 1}번째 긴 문단입니다. 정원에서 차분하게 이야기를 나눕니다.*`,
      ).join('\n\n'),
    );
  await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 200;
  });
  const rect = (await scroll.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, 500);
  await expect(header).toHaveClass(/is-scroll-hidden/);
  await page.getByRole('button', { name: '마지막 대화 삭제', exact: true }).click();
  await page.getByRole('button', { name: '입력과 응답 모두 삭제', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  await expect(header).not.toHaveClass(/is-scroll-hidden/);
  await expect(page.getByRole('button', { name: '메인으로', exact: true })).toBeVisible();
});
