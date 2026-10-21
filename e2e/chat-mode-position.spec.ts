import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`모드 전환은 마지막 유저 입력부터, 재접속은 읽던 대사부터 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    const field = page.getByRole('textbox', { name: '메시지', exact: true });
    const send = page.getByRole('button', { name: '전송', exact: true });
    for (const [index, input] of [
      '이전 질문',
      '마지막 질문 첫 줄\n마지막 질문 둘째 줄',
    ].entries()) {
      await field.fill(input);
      await send.click();
      await expect(page.locator('.conversation-turn')).toHaveCount(index + 1);
      await expect(send).toBeEnabled();
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('xenotale-v1');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('rooms', 'readwrite');
            const store = tx.objectStore('rooms');
            const read = store.getAll();
            read.onsuccess = () => {
              const room = read.result.at(-1);
              for (const turn of room.timeline.filter((event: any) => event.kind === 'turn')) {
                for (const candidate of turn.candidates) {
                  candidate.body = Array.from(
                    { length: 70 },
                    (_, i) => `응답 ${i + 1}번째 문단입니다. 차분히 읽어 주세요.`,
                  ).join('\n\n');
                }
              }
              // A stale VN cursor must not win over an explicit mode switch.
              localStorage.setItem(
                `xenotale.vn-cursor.${room.id}`,
                `opening:${room.openingId}::story:0`,
              );
              room.revision++;
              store.put(room);
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
    const copy = page.locator('.visual-novel-copy');
    await expect(copy).toHaveText('마지막 질문 첫 줄');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(copy).toHaveText('마지막 질문 둘째 줄');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(copy).toHaveText('응답 1번째 문단입니다. 차분히 읽어 주세요.');
    await page.getByRole('button', { name: '소설 모드로 전환', exact: true }).click();
    const scroll = page.locator('.chat-scroll');
    const user = page.locator('.conversation-turn').last().locator('.user-section');
    await expect(user).toBeInViewport();
    await expect
      .poll(async () => Math.abs((await user.boundingBox())!.y - (await scroll.boundingBox())!.y))
      .toBeLessThan(40);
    expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
    await page.screenshot({ path: `docs/screenshots/mode-switch-user-${width}.png` });
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
    await expect(copy).toHaveText('마지막 질문 첫 줄');
    await page.getByRole('button', { name: '다음 대사', exact: true }).click();
    await expect(copy).toHaveText('마지막 질문 둘째 줄');
    await page.reload();
    await expect(copy).toHaveText('마지막 질문 둘째 줄');
  });
}
