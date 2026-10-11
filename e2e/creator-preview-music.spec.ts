import { test, expect, type Page } from '@playwright/test';

async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
}
async function section(page: Page, width: number, name: string) {
  if (width < 800)
    await page.locator('.editor-mobile-stages').getByRole('tab', { name, exact: false }).click();
  else await page.locator('.editor-nav').getByRole('button', { name, exact: false }).click();
}
async function setBgm(page: Page, bgm: string) {
  await page.evaluate(
    (bgm) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('xenotale-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction('rooms', 'readwrite');
          const store = transaction.objectStore('rooms');
          const read = store.getAll();
          read.onsuccess = () => {
            const room = read.result[0];
            room.work.openings.find((o: any) => o.id === room.openingId).bgm = bgm;
            room.revision++;
            store.put(room);
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    bgm,
  );
}
// A local silent PCM fixture verifies real playback without external audio/network.
const wav = Buffer.alloc(44 + 16000);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(16000, 40);

for (const width of [1440, 393]) {
  test(`하단 미리보기 · 연출 예시 Ctrl+Z·다시 실행 (${width})`, async ({ page }) => {
    await start(page, width);
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await section(page, width, '상태창');
    await expect(
      page.getByRole('button', { name: '미리보기', exact: true }).locator('svg'),
    ).toHaveClass(/lucide-eye/);
    await page.getByRole('textbox', { name: '문법 입력', exact: true }).fill('상태창 미리보기');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    const statusBox = (await page.locator('.status-preview').boundingBox())!;
    const statusButton = (await page
      .getByRole('button', { name: '미리보기', exact: true })
      .boundingBox())!;
    const statusGap = statusBox.y - statusButton.y - statusButton.height;
    await section(page, width, '연출');
    await page.getByRole('button', { name: '연출 추가', exact: true }).click();
    const code = page.getByRole('textbox', { name: '코드 입력', exact: true });
    await page.getByRole('button', { name: '공포 노이즈 예시', exact: true }).click();
    await expect(code).toBeFocused();
    const example = await code.inputValue();
    expect(example).toContain('XenoTale');
    await code.press('Control+z');
    await expect(code).toHaveValue('');
    await expect(page.getByRole('button', { name: '공포 노이즈 예시', exact: true })).toBeVisible();
    await code.press('Control+Shift+z');
    await expect(code).toHaveValue(example);
    await code.press('End');
    await code.press('Enter');
    await page.keyboard.insertText('추가 입력');
    await code.press('Control+z');
    expect(await code.inputValue()).not.toContain('추가 입력');
    await section(page, width, '플레이가이드');
    const guide = page.getByRole('textbox', { name: '내용', exact: true });
    const preview = page.getByRole('region', { name: '플레이가이드 미리보기', exact: true });
    await guide.fill('## 플레이 방법\n**기억할 내용**');
    await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(preview.getByRole('heading', { name: '플레이 방법', exact: true })).toBeVisible();
    await expect(preview).toHaveCSS('background-color', 'rgb(28, 28, 28)');
    await expect(preview).toHaveCSS('border-radius', '5px');
    await expect(preview).toHaveCSS('padding', '16px');
    const previewBox = (await preview.boundingBox())!;
    const previewButton = (await page
      .getByRole('button', { name: '미리보기', exact: true })
      .boundingBox())!;
    expect(previewBox.y - previewButton.y - previewButton.height).toBeCloseTo(statusGap, 0);
    await page.screenshot({ path: `docs/screenshots/guide-preview-${width}.png` });
    expect((await preview.boundingBox())!.y).toBeGreaterThan(
      (await page.getByRole('button', { name: '미리보기', exact: true }).boundingBox())!.y,
    );
    await guide.fill('## 수정한 안내');
    await expect(preview).toContainText('플레이 방법');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview).toContainText('수정한 안내');
    await guide.fill('');
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(preview).toContainText('아직 내용이 없습니다.');
  });

  test(`대화방 플레이가이드 공통 영역 · Markdown과 HTML (${width})`, async ({ page }) => {
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    if (width < 800) {
      await page.getByRole('button', { name: '대화 메뉴', exact: true }).click();
      await page.getByRole('button', { name: '작품정보', exact: true }).click();
    }
    await page.getByRole('tab', { name: '플레이 가이드', exact: true }).click();
    const guide = page.locator('.work-guide');
    await expect(guide).toHaveCSS('background-color', 'rgb(34, 34, 34)');
    await expect(guide).toHaveCSS('border-radius', '5px');
    await expect(guide).toHaveCSS('padding', '16px');
    await expect(guide.locator('.markdown')).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/chat-guide-${width}.png` });
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('xenotale-v1');
          open.onsuccess = () => {
            const database = open.result;
            const transaction = database.transaction('rooms', 'readwrite');
            const store = transaction.objectStore('rooms');
            const read = store.getAll();
            read.onsuccess = () => {
              const room = read.result[0];
              room.work.guide = '<div id="guide-test" style="height:90px">HTML 플레이가이드</div>';
              room.revision++;
              store.put(room);
            };
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
          };
          open.onerror = () => reject(open.error);
        }),
    );
    await page.reload();
    await page.getByRole('tab', { name: '플레이 가이드', exact: true }).click();
    await expect(guide.frameLocator('iframe').locator('#guide-test')).toHaveText(
      'HTML 플레이가이드',
    );
    await expect(guide.frameLocator('iframe').locator('body')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect
      .poll(() => guide.locator('iframe').evaluate((frame) => frame.getBoundingClientRect().height))
      .toBe(90);
    await expect(guide).toHaveCSS('padding', '16px');
  });

  test(`BGM 없음 숨김 · 기본 켜짐 · 실제 재생과 전환 (${width})`, async ({ page }) => {
    await page.route('https://fixture.test/music.wav', (route) =>
      route.fulfill({ contentType: 'audio/wav', body: wav }),
    );
    await start(page, width);
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /BGM/ })).toHaveCount(0);
    await expect(page.locator('audio')).toHaveCount(0);
    await setBgm(page, 'https://fixture.test/music.wav');
    await page.reload();
    const off = page.getByRole('button', { name: 'BGM 끄기', exact: true });
    await expect(off).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('textbox', { name: '메시지', exact: true }).click();
    await expect
      .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused))
      .toBe(false);
    await off.click();
    await expect(page.getByRole('button', { name: 'BGM 켜기', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect
      .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused))
      .toBe(true);
    await page.getByRole('textbox', { name: '메시지', exact: true }).click();
    expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'BGM 켜기', exact: true }).click();
    await expect
      .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused))
      .toBe(false);
    await setBgm(page, '');
    await page.reload();
    await expect(page.getByRole('button', { name: /BGM/ })).toHaveCount(0);
  });
}

test('자동재생 제한 후 첫 사용자 입력에서 재시도', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let first = true;
    HTMLMediaElement.prototype.play = function () {
      if (first) {
        first = false;
        return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.route('https://fixture.test/music.wav', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: wav }),
  );
  await start(page, 1440);
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
  await setBgm(page, 'https://fixture.test/music.wav');
  await page.reload();
  await expect(page.getByRole('button', { name: 'BGM 끄기', exact: true })).toBeVisible();
  expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(
    true,
  );
  await page.getByRole('textbox', { name: '메시지', exact: true }).click();
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused))
    .toBe(false);
});
