import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('암호화한 API 키는 새로고침·새 탭에서 유지되고 삭제하면 지워진다', async ({
  page,
  context,
}) => {
  let authorized = false;
  await context.route('https://openrouter.ai/**', (r) => {
    if (r.request().url().endsWith('/key'))
      authorized = r.request().headers().authorization === 'Bearer fake-persistent-key';
    return r.fulfill({ json: { data: [] } });
  });
  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'API key', exact: true });
  await field.fill('fake-persistent-key');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('xenotale-v1');
          request.onsuccess = () => resolve(request.result);
        });
        return new Promise<boolean>((resolve) => {
          const request = db
            .transaction('credentials')
            .objectStore('credentials')
            .get('openrouter');
          request.onsuccess = () => {
            const value = request.result;
            db.close();
            resolve(
              !!value &&
                !value.key.extractable &&
                !JSON.stringify(value).includes('fake-persistent-key'),
            );
          };
        });
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(field).toHaveValue('fake-persistent-key');
  await page.getByRole('button', { name: '키 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '연결 확인됨', exact: true })).toBeVisible();
  expect(authorized).toBe(true);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue(
    'fake-persistent-key',
  );
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  for (const current of [page, other]) {
    await current.goto('/#/profile');
    await current.getByRole('button', { name: 'API 키 관리', exact: true }).click();
  }
  await page.getByRole('button', { name: '저장된 API 키 삭제', exact: true }).click();
  await expect(other.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue('');
  await page.reload();
  await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
  await expect(field).toHaveValue('');
});
test('비밀번호 없는 백업의 API 키를 다른 브라우저에 복원하고 키 제외 백업도 지원', async ({
  page,
  browser,
}) => {
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-backup-key');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.getByRole('button', { name: '백업 및 동기화', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
  const file = await download;
  const path = (await file.path())!;
  const data = JSON.parse(await fs.readFile(path, 'utf8'));
  expect(data.credentials).toEqual({ openrouterApiKey: 'fake-backup-key' });
  expect(JSON.stringify(data.profile)).not.toContain('fake-backup-key');
  await page.getByRole('switch', { name: 'API 키 포함', exact: true }).click();
  const withoutKey = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 백업 다운로드', exact: false }).click();
  const plainPath = (await (await withoutKey).path())!;
  expect(JSON.parse(await fs.readFile(plainPath, 'utf8')).credentials).toBeUndefined();
  const restored = await browser.newContext();
  await restored.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  const target = await restored.newPage();
  try {
    await target.goto('/');
    await target.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await target.locator('input[type=file]').setInputFiles(path);
    await expect(
      target.getByText('백업의 API 키도 복원하며 현재 등록된 API 키를 교체합니다.'),
    ).toBeVisible();
    await target.getByRole('button', { name: '가져오기', exact: true }).click();
    await expect(target.getByRole('dialog')).toHaveCount(0);
    await target.goto('/#/profile');
    await target.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await expect(target.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue(
      'fake-backup-key',
    );
    await target.reload();
    await target.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await expect(target.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue(
      'fake-backup-key',
    );
    await target.goto('/');
    await target.locator('input[type=file]').setInputFiles(plainPath);
    await target.getByRole('button', { name: '가져오기', exact: true }).click();
    await expect(target.getByRole('dialog')).toHaveCount(0);
    await target.goto('/#/profile');
    await target.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    await expect(target.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue(
      'fake-backup-key',
    );
  } finally {
    await restored.close();
  }
});
