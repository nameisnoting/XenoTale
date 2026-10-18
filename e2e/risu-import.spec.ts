import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { readDownloadedJson } from './read-file';

for (const width of [1440, 393])
  test(`Risu 실파일: 표지·폴더 분류·참조/상시 로어북·검색·수정 저장 (${width})`, async ({
    page,
  }) => {
    const folder = process.env.RISU_EXAMPLES_DIR;
    test.skip(!folder, 'User-supplied Risu cards remain outside the repository.');
    const name = (await fs.readdir(folder!)).find((name) => name.endsWith('.png'))!;
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: /^제목/ })).toBeVisible();
    await page.locator('input[accept*=".charx"]').setInputFiles(join(folder!, name));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('로어북 966개');
    await dialog.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
    await expect(page.getByRole('textbox', { name: /^제목/ })).toHaveValue(/던전/);
    const portrait = page.locator('.basic-info .image-upload');
    await expect(portrait.locator('img')).toBeVisible();
    const remove = portrait.getByRole('button', { name: '삭제', exact: true });
    expect((await remove.boundingBox())!.height).toBeLessThan(48);
    expect((await remove.boundingBox())!.width).toBeLessThan(
      (await portrait.locator('button').first().boundingBox())!.width,
    );
    const cards = page.locator('.overview-form .creator-card');
    await expect(cards).toHaveCount(20);
    const search = page.getByRole('textbox', { name: '로어북 검색', exact: true });
    await search.fill('Aboleth');
    await expect(cards).toHaveCount(1);
    const entry = cards.first();
    await expect(entry).toContainText('분류: 규칙 · 몬스터');
    await expect(entry).toContainText('가져온 스크립트용 고급 자료');
    await expect(entry.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(entry.getByRole('textbox', { name: '프롬프트', exact: true })).not.toHaveValue('');
    await expect(entry.getByRole('textbox', { name: '키워드', exact: true })).toHaveCount(0);
    await entry
      .getByRole('textbox', { name: '프롬프트', exact: true })
      .fill('수정한 몬스터 능력치');
    await search.fill('대조표');
    await expect(cards.getByRole('radio', { name: '항상 전달', exact: true })).toBeChecked();
    await search.fill('');
    await expect(cards).toHaveCount(20);
    await page.locator('.pagination').getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.locator('.pagination')).toContainText('2 / 49');
    await search.fill('Aboleth');
    await expect(entry.getByRole('textbox', { name: '프롬프트', exact: true })).toHaveValue(
      '수정한 몬스터 능력치',
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '작품 파일 내보내기', exact: true }).click();
    const work = (await readDownloadedJson((await (await pending).path())!)).workspace.work;
    expect(work.lore).toHaveLength(966);
    expect(work.lore.find((l: any) => l.name.includes('Aboleth'))).toMatchObject({
      prompt: '수정한 몬스터 능력치',
      activation: 'reference',
    });
    expect(work.importSource).toMatchObject({ format: 'risu', fileName: name });
    expect(work.risu.scripts).toHaveLength(1);
    expect(work.risu.scripts[0].code.length).toBeGreaterThan(1_000_000);
    expect(work.risu.rules).toHaveLength(25);
    expect(work.risu.styles).toContain('.dnd-intro');
    await page.screenshot({ path: `test-results/risu-lore-${width}.png` });
  });
