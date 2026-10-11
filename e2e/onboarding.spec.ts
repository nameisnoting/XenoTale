import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('이미 저장된 이야기꾼 기본 닉네임도 새로고침 시 한 번 교체된다', async ({ page }) => {
  await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: '닉네임 *', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('xenotale-v1');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('profiles', 'readwrite');
      const table = transaction.objectStore('profiles');
      const request = table.get('profile');
      request.onsuccess = () => {
        const profile = request.result;
        profile.nickname = '이야기꾼';
        delete profile.defaultNicknameMigrated;
        table.put(profile);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
  await page.reload();
  const nickname = page.getByRole('textbox', { name: '닉네임 *', exact: true });
  await expect(nickname).not.toHaveValue('이야기꾼');
  const first = await nickname.inputValue();
  expect(['Rex', 'Shulk', 'Noah', 'Ushia', 'Peneuma', 'Logos', 'Homura', 'Hikari']).toContain(
    first,
  );
  await page.reload();
  await expect(nickname).toHaveValue(first);
});
for (const width of [1440, 393])
  test(`최초 닉네임·키 설정 공통 UI·둘러보기 텍스트 호버 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    const nickname = page.getByRole('textbox', { name: '닉네임 *', exact: true });
    const selectedName = await nickname.inputValue();
    expect(['Rex', 'Shulk', 'Noah', 'Ushia', 'Peneuma', 'Logos', 'Homura', 'Hikari']).toContain(
      selectedName,
    );
    await page.reload();
    await expect(nickname).toHaveValue(selectedName);
    await expect(page.getByText('나만의 이야기와 캐릭터를 만드는 공간')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '저장된 API 키 삭제', exact: true })).toHaveCount(
      0,
    );
    const labels = [
      page.getByRole('textbox', { name: '닉네임 *', exact: true }),
      page.getByRole('link', { name: 'Openrouter 키 발급', exact: true }),
      page.getByRole('textbox', { name: 'API key', exact: true }),
      page.getByText('API 키는 이 브라우저에 암호화되어 저장됩니다.', { exact: true }),
      page.getByRole('button', { name: '키 확인', exact: true }),
      page.getByRole('group', { name: '채팅용 LLM', exact: true }),
      page.getByRole('group', { name: '요약용 LLM', exact: true }),
    ];
    let previous = 0;
    for (const label of labels) {
      const box = (await label.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(previous);
      previous = box.y + box.height;
    }
    const input = (await labels[2].boundingBox())!;
    await expect(labels[2]).toHaveAttribute(
      'placeholder',
      'Openrouter의 api 키만 이용 가능합니다.',
    );
    const description = (await labels[3].boundingBox())!;
    expect(description.y - input.y - input.height).toBe(8);
    const link = (await labels[1].boundingBox())!;
    const label = (await page
      .getByRole('group', { name: 'API key', exact: true })
      .locator('.field-label')
      .boundingBox())!;
    expect(Math.abs(label.y + label.height / 2 - link.y - link.height / 2)).toBeLessThan(1);
    expect(Math.abs(input.x + input.width - link.x - link.width)).toBeLessThan(1);
    const check = (await labels[4].boundingBox())!;
    expect(check.width).toBe(input.width);
    expect(Math.abs(input.x + input.width - check.x - check.width)).toBeLessThan(1);
    const skip = page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true });
    const start = page.getByRole('button', { name: 'XenoTale 시작', exact: true });
    const startBox = (await start.boundingBox())!;
    const skipBox = (await skip.boundingBox())!;
    expect(skipBox.y - startBox.y - startBox.height).toBeCloseTo(4 * (96 / 72), 1);
    const before = await skip.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    }));
    await skip.hover();
    const after = await skip.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    }));
    expect(after.background).toBe(before.background);
    expect(after.color).toBe('rgb(255, 255, 255)');
    expect(after.color).not.toBe(before.color);
    await page.mouse.move(0, 0);
    await fs.mkdir('docs/screenshots/onboarding', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/onboarding/${width}.png`, fullPage: true });
    await skip.click();
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'API 키 관리', exact: true }).click();
    const apiField = page.getByRole('group', { name: 'API key', exact: true });
    expect(
      await apiField.locator('.field-label').evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('12px');
    const modalInput = apiField.getByRole('textbox');
    const modalInputBox = (await modalInput.boundingBox())!;
    const modalDescription = (await apiField.locator('small').boundingBox())!;
    const modalLink = (await apiField
      .getByRole('link', { name: 'Openrouter 키 발급', exact: true })
      .boundingBox())!;
    expect(modalDescription.y - modalInputBox.y - modalInputBox.height).toBe(8);
    expect(
      Math.abs(modalLink.x + modalLink.width - modalInputBox.x - modalInputBox.width),
    ).toBeLessThan(1);
    const modalCheck = (await page
      .getByRole('button', { name: '키 확인', exact: true })
      .boundingBox())!;
    expect(modalCheck.width).toBe(modalInputBox.width);
    await modalInput.fill('fake-ui-key');
    const remove = page.getByRole('button', { name: '저장된 API 키 삭제', exact: true });
    expect(await remove.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(198, 72, 80)');
    expect(await remove.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(
      'rgb(198, 72, 80)',
    );
    await page.screenshot({
      path: `docs/screenshots/onboarding/api-settings-${width}.png`,
      fullPage: true,
    });
  });
