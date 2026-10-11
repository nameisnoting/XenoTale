import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'docs/screenshots/scene-controls';
async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await fs.mkdir(out, { recursive: true });
}
async function send(page: Page, count: number) {
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(count);
}
async function reroll(page: Page) {
  await page.getByRole('button', { name: '리롤', exact: true }).click();
  await page.getByRole('button', { name: '다른 응답 생성', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toContainText('2 / 2');
}
async function storedRoom(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('rooms', 'readonly').objectStore('rooms').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result[0]);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}
test('후보 이동은 마지막 응답에만 · 새 방 없음 · 강화 로그만 · 챕터 제목과 프롤로그', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  await expect(page.locator('.work-lore')).toContainText('키워드: 정원');
  expect(
    await page.locator('.keyword-label').evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(255, 255, 255)');
  await send(page, 1);
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  await reroll(page);
  const url = page.url();
  await page.getByRole('button', { name: '이전 응답', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toContainText('1 / 2');
  await expect(page.getByTestId('status-affinity')).toHaveText('12');
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '다음 응답', exact: true }).click();
  await expect(page.getByTestId('status-affinity')).toHaveText('13');
  await send(page, 2);
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  await reroll(page);
  await expect(page.locator('.candidate-pager')).toHaveCount(1);
  await expect(page.locator('.conversation-turn').first().locator('.candidate-pager')).toHaveCount(
    0,
  );
  await expect(page.locator('.conversation-turn').last().locator('.candidate-pager')).toHaveCount(
    1,
  );
  await page.screenshot({ path: `${out}/latest-candidates.png` });
  await page.getByRole('button', { name: '아이템', exact: true }).click();
  await page
    .locator('.inventory-grid')
    .getByRole('button', { name: /수련검/ })
    .click();
  await page.getByRole('button', { name: '강화하기', exact: true }).click();
  await expect(page.locator('.conversation-log')).toContainText('수련검 강화 성공 · +1');
  await expect(page.locator('.chat-scroll .local-event')).toHaveCount(0);
  await expect(page.locator('.chat-scroll')).not.toContainText('수련검 강화 성공');
  const progress = await storedRoom(page);
  await page.getByRole('button', { name: '이전 응답', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toContainText('1 / 2');
  const viewed = await storedRoom(page);
  expect(viewed.current).toEqual(progress.current);
  expect(viewed.timeline).toEqual(progress.timeline);
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: '시나리오', exact: true }).click();
  await page.getByRole('button', { name: '챕터 이동', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  expect(
    (await storedRoom(page)).timeline.filter((entry: any) => entry.kind === 'turn').at(-1)
      .selectedId,
  ).toBe(progress.timeline.filter((entry: any) => entry.kind === 'turn').at(-1).selectedId);
  await expect(page.locator('.chapter-scene h2')).toHaveText('서고의 문');
  await expect(page.locator('.chapter-scene .story-body')).toContainText(
    '아리아가 서고의 문을 연다.',
  );
  await send(page, 3);
  await reroll(page);
  await expect(page.locator('.candidate-pager')).toHaveCount(1);
  await page.getByRole('button', { name: '챕터 이동', exact: true }).click();
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  await expect(page.locator('.chapter-scene h2').last()).toHaveText('다시 만날 약속');
  await expect(page.locator('.chapter-scene').last()).toContainText('해가 저문다.');
  await page.locator('.chapter-scene .story-body').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.chapter-scene .story-body').last()).toBeInViewport();
  await page.screenshot({ path: `${out}/chapter-prologue.png` });
  await page.reload();
  await expect(page.locator('.chapter-scene h2').last()).toHaveText('다시 만날 약속');
  await expect(page.locator('.candidate-pager')).toHaveCount(0);
  await expect(page.locator('.conversation-log')).toContainText('수련검 강화 성공 · +1');
});
test('공통 토글 시안 색상 · 호버 전후 동일', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
  await page.getByRole('button', { name: '노트 추가', exact: true }).click();
  const toggle = page.getByRole('switch', { name: /적용하기/ });
  const color = () =>
    toggle.evaluate((element) => ({
      track: getComputedStyle(element).backgroundColor,
      knob: getComputedStyle(element.firstElementChild!).backgroundColor,
    }));
  await toggle.click();
  await page.mouse.move(800, 10);
  expect(await color()).toEqual({ track: 'rgb(203, 203, 203)', knob: 'rgb(255, 255, 255)' });
  const off = await color();
  await toggle.hover();
  expect(await color()).toEqual(off);
  await toggle.click();
  await page.mouse.move(800, 10);
  expect(await color()).toEqual({ track: 'rgb(95, 221, 206)', knob: 'rgb(255, 255, 255)' });
  const on = await color();
  await toggle.hover();
  expect(await color()).toEqual(on);
  await page.screenshot({ path: `${out}/toggle-colors.png` });
});
test('챕터 공통 드롭다운 · 입력창 경계 · 16px 화살표 · 8px 목록 간격 · 모달 키보드', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('button', { name: '시나리오', exact: true }).click();
  await page.getByRole('button', { name: '도입부 1 다음 챕터 추가', exact: true }).click();
  let modal = page.getByRole('dialog', { name: '' });
  await expect(modal.getByRole('heading', { name: '챕터 설정', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '챕터 1 다음 챕터 추가', exact: true }).click();
  modal = page.getByRole('dialog');
  const previous = modal.getByRole('combobox', { name: '이전 노드', exact: true });
  await previous.click();
  const menu = page.getByRole('listbox', { name: '이전 노드', exact: true });
  await expect(menu).toBeVisible();
  const anchor = (await previous.boundingBox())!;
  const arrow = (await previous.locator('svg').boundingBox())!;
  expect(anchor.x + anchor.width - arrow.x - arrow.width).toBeCloseTo(17, 0);
  expect(await previous.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  expect(await previous.evaluate((element) => getComputedStyle(element).borderColor)).toBe(
    'rgb(255, 255, 255)',
  );
  const list = (await menu.boundingBox())!;
  expect(list.y - anchor.y - anchor.height).toBeCloseTo(8, 0);
  expect(list.width).toBeCloseTo(anchor.width, 0);
  const topOption = menu.getByRole('option', { name: '도입부 1', exact: true });
  expect(
    await topOption.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.x + 4, rect.y + 4) === element;
    }),
  ).toBe(true);
  await page.screenshot({ path: `${out}/chapter-select.png` });
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(modal).toBeVisible();
  await previous.click();
  await menu.getByRole('option', { name: '도입부 1', exact: true }).click();
  await expect(previous).toHaveText('도입부 1');
  await previous.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(previous).toHaveText('챕터 1');
  await modal.getByRole('button', { name: '조건 추가', exact: true }).click();
  const kind = modal.getByRole('combobox', { name: '조건 유형', exact: true });
  await kind.click();
  await page
    .getByRole('listbox', { name: '조건 유형', exact: true })
    .getByRole('option', { name: '아이템 보유', exact: true })
    .click();
  await expect(modal.getByRole('combobox', { name: '보유 조건', exact: true })).toHaveText('보유');
  await page.setViewportSize({ width: 393, height: 852 });
  await kind.click();
  await expect(page.getByRole('listbox', { name: '조건 유형', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/chapter-select-mobile.png` });
  await page.keyboard.press('Escape');
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByText('저장완료')).toBeVisible();
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '시나리오', exact: true }).click();
  await page.getByRole('button', { name: '챕터 2 조건 1개', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '이전 노드', exact: true })).toHaveText('챕터 1');
});
