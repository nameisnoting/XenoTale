import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/interaction-policy';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await fs.mkdir(out, { recursive: true });
}
async function rooms(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database.transaction('rooms', 'readonly').objectStore('rooms').getAll();
          read.onsuccess = () => {
            database.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}
async function send(page: Page, count: number) {
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(count);
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeVisible();
}
test('클리핑 없는 단축어 레이어 · 입력창 드래그 확장/축소', async ({ page }) => {
  await start(page);
  await send(page, 1);
  const field = page.getByRole('textbox', { name: '메시지', exact: true });
  await field.fill('아직 전송하지 않은 긴 글');
  const handle = page.getByRole('separator', { name: '메시지 입력창 크기 조절', exact: true });
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y - 100, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.resizable-composer')).toHaveAttribute('data-expanded', 'true');
  expect((await field.boundingBox())!.height).toBeGreaterThan(500);
  const expanded = (await page.locator('.resizable-composer').boundingBox())!;
  const header = (await page.locator('.chat-header').boundingBox())!;
  expect(expanded.y).toBeLessThan(header.y + header.height + 32);
  const expandedControls = (await page.locator('.composer-controls').boundingBox())!;
  expect(expandedControls.y + expandedControls.height).toBeLessThanOrEqual(900);
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeInViewport();
  await expect(field).toHaveValue('아직 전송하지 않은 긴 글');
  await page.screenshot({ path: `${out}/composer-expanded.png` });
  await handle.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.resizable-composer')).toHaveAttribute('data-expanded', 'false');
  const before = (await page.locator('.composer').boundingBox())!;
  const controls = (await page.locator('.composer-controls').boundingBox())!;
  expect(controls.y + controls.height).toBeLessThanOrEqual(before.y + before.height);
  await page.getByRole('button', { name: '단축어', exact: true }).click();
  const menu = page.getByRole('menu', { name: '단축어 목록', exact: true });
  expect(await menu.evaluate((e) => e.parentElement === document.body)).toBe(true);
  const menuRect = (await menu.boundingBox())!;
  expect(menuRect.y).toBeGreaterThanOrEqual(16);
  expect(menuRect.y + menuRect.height).toBeLessThan(controls.y);
  const title = menu.getByRole('heading', { name: '주사위', exact: true });
  expect(
    await title.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return document.elementFromPoint(r.x + 4, r.y + 4) === e;
    }),
  ).toBe(true);
  await page.screenshot({ path: `${out}/dropdown-unclipped.png` });
  await page.setViewportSize({ width: 393, height: 620 });
  const mobileRect = (await menu.boundingBox())!;
  expect(mobileRect.x).toBeGreaterThanOrEqual(16);
  expect(mobileRect.x + mobileRect.width).toBeLessThanOrEqual(377);
  await expect(title).toBeVisible();
  await page.screenshot({ path: `${out}/dropdown-mobile.png` });
});
test('리롤 모달 공통 간격 · 체크칸 정렬 · 제목 크기', async ({ page }) => {
  await start(page);
  await send(page, 1);
  await page.getByRole('button', { name: '리롤', exact: true }).click();
  const modal = page.getByRole('dialog');
  expect(
    await modal.locator('.modal-header h2').evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe('16px');
  const header = (await modal.locator('.modal-header').boundingBox())!;
  const field = (await modal
    .getByRole('group', { name: '추가 요청 (선택)', exact: true })
    .boundingBox())!;
  expect(field.y - header.y - header.height).toBeCloseTo(16, 0);
  const input = modal.getByRole('textbox', { name: '추가 요청 (선택)', exact: true });
  const inputRect = (await input.boundingBox())!;
  const checkbox = modal.getByRole('checkbox', {
    name: '다음부터 추가 프롬프트를 묻지 않기',
    exact: true,
  });
  const labelRect = (await modal.locator('.checkbox-row').boundingBox())!;
  expect(labelRect.y - inputRect.y - inputRect.height).toBeCloseTo(24, 0);
  const checkRect = (await checkbox.boundingBox())!;
  expect(checkRect.width).toBe(16);
  expect(checkRect.height).toBe(16);
  expect(checkRect.y + 8).toBeCloseTo(labelRect.y + labelRect.height / 2, 0);
  expect(await modal.locator('.checkbox-row').evaluate((e) => getComputedStyle(e).gap)).toBe(
    '12px',
  );
  await page.screenshot({ path: `${out}/reroll-spacing.png` });
});
test('그룹 모달 · 구성원 추가/제거 · 전체적용 · 빈 그룹 저장', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await page.getByRole('button', { name: '노트 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '프롬프트', exact: true }).fill('존댓말로 대화한다.');
  await page.getByRole('button', { name: '노트 추가', exact: true }).click();
  await page
    .getByRole('textbox', { name: '프롬프트', exact: true })
    .nth(1)
    .fill('풍경을 묘사한다.');
  await page.getByRole('button', { name: '노트 그룹 추가', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByRole('textbox', { name: '제목', exact: true }).fill('문체');
  await modal.getByRole('checkbox', { name: '노트 1', exact: true }).check();
  await modal.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.locator('.note-group')).toContainText('노트 1개');
  await page.locator('.note-group-open').filter({ hasText: '문체' }).click();
  await modal.getByRole('checkbox', { name: '노트 1', exact: true }).uncheck();
  await modal.getByRole('checkbox', { name: '노트 2', exact: true }).check();
  await page.screenshot({ path: `${out}/note-group-edit.png` });
  await modal.getByRole('button', { name: '완료', exact: true }).click();
  await page.getByRole('switch', { name: '문체 전체 적용', exact: true }).click();
  const saved = (await rooms(page))[0];
  expect(saved.current.context.notes.find((n: any) => n.name === '노트 1').group).toBe('');
  expect(saved.current.context.notes.find((n: any) => n.name === '노트 2').group).toBe('문체');
  await expect(page.locator('.note-card').nth(1).getByRole('switch')).not.toBeChecked();
  await page.screenshot({ path: `${out}/notes.png` });
  await page.getByRole('button', { name: '노트 그룹 추가', exact: true }).click();
  await modal.getByRole('textbox', { name: '제목', exact: true }).fill('빈 그룹');
  await modal.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByRole('switch', { name: '빈 그룹 전체 적용', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await expect(page.locator('.note-group-open').filter({ hasText: '빈 그룹' })).toContainText(
    '노트 0개',
  );
});
test('과거 대사와 입력 단순 수정 · 상태와 방 유지 · 스크롤 헤더', async ({ page }) => {
  await start(page);
  await send(page, 1);
  await send(page, 2);
  const url = page.url();
  const before = (await rooms(page))[0];
  await page.getByRole('button', { name: '대사 수정', exact: true }).first().click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('textbox').fill('@아리아: 오타를 고쳤습니다.');
  await modal.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: '입력 수정', exact: true }).first().click();
  await modal.getByRole('textbox').fill('내 입력도 고쳤습니다.');
  await modal.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const after = (await rooms(page))[0];
  expect(after.current.runtime).toEqual(before.current.runtime);
  expect(after.timeline.map((t: any) => t.candidates.map((c: any) => c.id))).toEqual(
    before.timeline.map((t: any) => t.candidates.map((c: any) => c.id)),
  );
  expect(after.timeline[0].input).toBe('내 입력도 고쳤습니다.');
  expect(after.timeline[0].candidates[0].body).toBe('@아리아: 오타를 고쳤습니다.');
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
  await page.getByRole('button', { name: '대사 수정', exact: true }).first().click();
  await modal
    .getByRole('textbox')
    .fill(
      Array.from(
        { length: 60 },
        (_, i) => `*길게 작성한 ${i + 1}번째 문단입니다. 정원과 저택의 풍경을 충분히 묘사합니다.*`,
      ).join('\n\n'),
    );
  await modal.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const scroll = page.locator('.chat-scroll');
  await scroll.evaluate((e) => {
    e.scrollTop = 0;
  });
  const rect = (await scroll.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, 400);
  await expect(page.locator('.chat-header')).toHaveClass(/is-scroll-hidden/);
  await page.screenshot({ path: `${out}/header-hidden.png` });
  await page.waitForTimeout(260);
  await page.mouse.wheel(0, -240);
  await expect(page.locator('.chat-header')).not.toHaveClass(/is-scroll-hidden/);
  await page.reload();
  await expect(page.locator('.user-message').first()).toContainText('내 입력도 고쳤습니다.');
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
});
test('요약 간격 범위와 5단위 조절 · 비활성 버튼 회색', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '기억관리', exact: true }).click();
  await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
  await expect(page.locator('.stepper').first()).toContainText('10 턴');
  await page.getByRole('button', { name: '요약 간격 줄이기', exact: true }).click();
  await expect(page.locator('.stepper').first()).toContainText('5 턴');
  const minus = page.getByRole('button', { name: '요약 간격 줄이기', exact: true });
  await expect(minus).toBeDisabled();
  expect(await minus.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(131, 131, 131)');
  const plus = page.getByRole('button', { name: '요약 간격 늘리기', exact: true });
  expect(await plus.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(95, 221, 206)');
  for (let i = 0; i < 19; i++) await plus.click();
  await expect(page.locator('.stepper').first()).toContainText('100 턴');
  await expect(plus).toBeDisabled();
  await page.getByRole('button', { name: '단기요약 줄이기', exact: true }).click();
  await expect(page.getByRole('button', { name: '단기요약 줄이기', exact: true })).toBeDisabled();
  const longPlus = page.getByRole('button', { name: '단기요약 늘리기', exact: true });
  for (let i = 0; i < 9; i++) await longPlus.click();
  await expect(longPlus).toBeDisabled();
  await expect(page.locator('.stepper').nth(1)).toContainText('50 개');
  await page.screenshot({ path: `${out}/summary-settings.png` });
  await page.reload();
  await page.getByRole('button', { name: '기억관리', exact: true }).click();
  await page.getByRole('tab', { name: '요약 설정', exact: true }).click();
  await expect(page.locator('.stepper').first()).toContainText('100 턴');
  await expect(page.locator('.stepper').nth(1)).toContainText('50 개');
});
test('첫 10턴 자동요약 · 카운트 9에서 0으로 · 성공 후 10으로 복귀', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '기억관리', exact: true }).click();
  await send(page, 1);
  await expect(page.locator('.memory-countdown')).toContainText('9');
  for (let i = 2; i <= 10; i++) await send(page, i);
  await expect(page.locator('.memory-countdown')).toContainText('10');
  const saved = (await rooms(page))[0];
  expect(saved.current.context.memories).toHaveLength(1);
  expect(saved.current.context.memories[0].sources).toHaveLength(10);
  await expect(page.getByText('1 ~ 10턴', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/summary-countdown.png` });
});
