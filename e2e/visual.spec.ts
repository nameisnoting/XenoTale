import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('전체 패널 화면 검수 · 제작 패널 테스트 · 모바일 메뉴 재열기', async ({ page }) => {
  test.setTimeout(90000);
  const out = 'docs/screenshots/v0.2';
  await fs.mkdir(out, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기' }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작' }).click();
  await page.screenshot({ path: `${out}/chat-first.png` });
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/chat-turn.png` });
  for (const name of [
    '작품정보',
    '유저노트',
    '페르소나',
    '미디어',
    '아이템',
    '시나리오',
    '관계도',
    '기억관리',
    '대화설정',
    '기타설정',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `${out}/chat-${name}.png` });
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: `${out}/chat-mobile.png` });
  await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
  await page.screenshot({ path: `${out}/mobile-sheet.png` });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '작품 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('정원의 기록');
  await page
    .getByRole('textbox', { name: /^프롬프트/, exact: false })
    .fill('낯선 정원에서 사람들과 만나 비밀을 풀어나가는 이야기.');
  await page.screenshot({ path: `${out}/editor-overview.png` });
  const section = (name: string) =>
    page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
  await section('등장 캐릭터');
  await page.getByRole('textbox', { name: '이름', exact: false }).fill('안내인');
  await page
    .getByRole('textbox', { name: '캐릭터 프롬프트', exact: false })
    .fill('친절한 정원 안내인');
  await page.screenshot({ path: `${out}/editor-등장 캐릭터.png` });
  await section('도입부');
  await page
    .getByRole('textbox', { name: '내용', exact: false })
    .fill('@안내인: 어서 오세요. 정원에 오신 것을 환영합니다.');
  await page.screenshot({ path: `${out}/editor-도입부.png` });
  await page.getByRole('tab', { name: '대화 테스트', exact: true }).click();
  await page.getByRole('button', { name: '테스트 전송', exact: true }).click();
  await expect(page.locator('.creator-test .support-user')).toContainText('이어서 내용 전개');
  await expect(page).toHaveURL(/#\/create\//);
  await page.screenshot({ path: `${out}/editor-test.png` });
  await page.getByRole('tab', { name: 'AI 에이전트', exact: true }).click();
  for (const name of [
    '미디어',
    '관계도',
    '상태창',
    '아이템',
    '시나리오',
    '단축어',
    '연출',
    '추천 페르소나',
    '플레이가이드',
  ]) {
    await section(name);
    await page.screenshot({ path: `${out}/editor-${name}.png` });
  }
  await section('관계도');
  await page.getByRole('button', { name: '안내인 관계 연결', exact: true }).click();
  await page.getByRole('button', { name: '관계도 선택 항목 삭제', exact: true }).click();
  await expect(page.getByRole('button', { name: '안내인 관계 연결', exact: true })).toHaveCount(0);
  await page
    .locator('.relation-palette')
    .getByRole('button', { name: '안내인', exact: true })
    .click();
  await page.getByRole('button', { name: '관계도 맵에 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: '안내인 관계 연결', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: '제작 도구', exact: true }).click();
  await page.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
  await page.getByRole('button', { name: '제작 도구', exact: true }).click();
  await expect(page.locator('.editor-nav')).toBeVisible();
  await section('작품 개요');
  await expect(page.getByRole('tablist', { name: '제작 단계' })).toBeVisible();
  await page.screenshot({ path: `${out}/editor-mobile.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '마이페이지', exact: true }).click();
  await page.screenshot({ path: `${out}/profile.png` });
  await page.getByRole('button', { name: '메인으로', exact: true }).click();
  await page.getByRole('button', { name: '대화방 관리', exact: true }).click();
  await page.screenshot({ path: `${out}/rooms.png` });
  expect(errors).toEqual([]);
});
