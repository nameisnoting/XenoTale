import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('xenotale-v1');
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<any>((resolve) => {
      const tx = db.transaction(['rooms', 'profiles'], 'readonly');
      const p = tx.objectStore('profiles').get('profile'),
        rooms = tx.objectStore('rooms').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve({ profile: p.result, rooms: rooms.result });
      };
    });
  });
}
async function notes(page: Page, width: number) {
  if (width === 393) {
    await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  }
  await page.getByRole('button', { name: '유저노트', exact: true }).click();
}
for (const width of [1440, 393])
  test(`유저노트 선택 불러오기·반복 갱신·그룹 이름·긴 제목 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await notes(page, width);
    await expect(page.getByText('생성된 그룹이 없습니다.', { exact: true })).toBeVisible();
    const add = page.getByRole('button', { name: '노트 추가', exact: true });
    await add.click();
    const long = '아주긴노트제목_'.repeat(20),
      card = page.locator('.note-card').first();
    await card.getByRole('button', { name: '노트 이름 수정', exact: true }).click();
    await page.getByRole('textbox', { name: '노트 이름', exact: true }).fill(long);
    await card.getByRole('textbox', { name: '프롬프트', exact: true }).fill('원본 내용');
    const metrics = await card.evaluate((e) => {
      const title = e.querySelector('.note-title')!,
        area = e.querySelector('textarea')!,
        s = getComputedStyle(area),
        header = getComputedStyle(e.querySelector('summary')!),
        toggle = e.querySelector('.toggle')!.getBoundingClientRect();
      return {
        ellipsis: getComputedStyle(title).textOverflow,
        truncated: title.scrollWidth > title.clientWidth,
        font: header.fontSize,
        weight: header.fontWeight,
        line: header.lineHeight,
        body: s.fontSize,
        bodyLine: s.lineHeight,
        padding: s.padding,
        toggle: [toggle.width, toggle.height],
        icon: [...e.querySelectorAll('svg')].map((e) => e.getBoundingClientRect().width),
      };
    });
    expect(metrics).toMatchObject({
      ellipsis: 'ellipsis',
      truncated: true,
      font: '14px',
      weight: '700',
      line: '24px',
      body: '14px',
      bodyLine: '22px',
      padding: '12px',
    });
    expect(metrics.toggle[0]).toBeCloseTo(29.33, 1);
    expect(metrics.toggle[1]).toBe(16);
    expect(metrics.icon).toEqual([16, 16, 16]);
    expect(await add.evaluate((e) => getComputedStyle(e).fontSize)).toBe('14px');
    expect(await add.locator('svg').evaluate((e) => e.getBoundingClientRect().width)).toBe(24);
    await add.click();
    await page
      .locator('.note-card')
      .nth(1)
      .getByRole('textbox', { name: '프롬프트', exact: true })
      .fill('관련 없는 노트');
    const groupAdd = page.getByRole('button', { name: '노트 그룹 추가', exact: true });
    await groupAdd.click();
    let modal = page.getByRole('dialog');
    await modal.getByRole('textbox', { name: '제목', exact: true }).fill('문체');
    await modal.getByRole('checkbox', { name: long, exact: true }).check();
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await groupAdd.click();
    await modal.getByRole('textbox', { name: '제목', exact: true }).fill('빈 그룹');
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    const save = page
      .locator('.note-transfer-actions')
      .getByRole('button', { name: '저장', exact: true });
    expect(
      await save.evaluate((e) => ({
        font: getComputedStyle(e).fontSize,
        color: getComputedStyle(e).color,
        border: getComputedStyle(e).borderColor,
      })),
    ).toEqual({ font: '12px', color: 'rgb(233, 213, 151)', border: 'rgb(233, 213, 151)' });
    await save.click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeEnabled();
    let data = await stored(page);
    expect(data.profile.notes).toHaveLength(2);
    const firstId = data.profile.notes[0].id,
      groupId = data.profile.noteGroupIds['문체'];
    await card.getByRole('textbox', { name: '프롬프트', exact: true }).fill('저장된 새 내용');
    await page.locator('.note-group-open').filter({ hasText: '문체' }).click();
    await modal.getByRole('textbox', { name: '제목', exact: true }).fill('새 문체');
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await save.click();
    await expect(save).toBeEnabled();
    data = await stored(page);
    expect(data.profile.noteGroups).toEqual(['빈 그룹', '새 문체']);
    expect(data.profile.noteGroupIds['새 문체']).toBe(groupId);
    expect(data.profile.notes).toHaveLength(2);
    await fs.mkdir('docs/screenshots/notes-transfer', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/notes-transfer/notes-${width}.png` });
    await page.goto('/');
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    const secondRoom = page.url();
    await notes(page, width);
    const load = page
      .locator('.note-transfer-actions')
      .getByRole('button', { name: '불러오기', exact: true });
    await load.click();
    await expect(modal.getByRole('button', { name: '불러오기', exact: true })).toBeDisabled();
    await modal.getByRole('checkbox', { name: `${long} 선택`, exact: true }).check();
    await modal.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.locator('.note-card')).toHaveCount(0);
    await load.click();
    await modal.getByRole('checkbox', { name: '새 문체 그룹 선택', exact: true }).check();
    await modal.getByRole('checkbox', { name: '빈 그룹 그룹 선택', exact: true }).check();
    await modal.getByRole('button', { name: '불러오기', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '저장된 새 내용',
    );
    await load.click();
    await modal.getByRole('checkbox', { name: `${long} 선택`, exact: true }).check();
    await modal.getByRole('button', { name: '불러오기', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.note-card')).toHaveCount(1);
    await card.getByRole('textbox', { name: '프롬프트', exact: true }).fill('방에서 갱신한 내용');
    await save.click();
    await expect(save).toBeEnabled();
    data = await stored(page);
    expect(data.profile.notes).toHaveLength(2);
    expect(data.profile.notes.find((n: any) => n.id === firstId).body).toBe('방에서 갱신한 내용');
    await page.reload();
    if (width === 1440) await notes(page, width);
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '방에서 갱신한 내용',
    );
    await page
      .locator('.chat-workspace-panel:visible, .mobile-page-body:visible')
      .first()
      .evaluate((e) => {
        e.scrollTop = 0;
      });
    if (await page.getByRole('button', { name: '알림 닫기', exact: true }).count())
      await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
    await page.screenshot({ path: `docs/screenshots/notes-transfer/final-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await card.locator('summary').click();
    await expect(card.getByRole('textbox', { name: '프롬프트', exact: true })).toBeHidden();
    await card.locator('summary').click();
    await card.getByRole('button', { name: '노트 삭제', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.locator('.note-card')).toHaveCount(0);
    expect((await stored(page)).profile.notes).toHaveLength(2);
  });
