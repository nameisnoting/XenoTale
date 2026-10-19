import { test, expect } from '@playwright/test';
for (const width of [1440, 393]) {
  for (const position of ['middle', 'bottom'])
    test(`답변 생성 시작·완료·리롤이 읽던 위치를 이동시키지 않음 (${width}, ${position})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 852 });
      await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
      await page.goto('/');
      await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
      await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
      const send = page.getByRole('button', { name: '전송', exact: true });
      await send.click();
      await expect(page.locator('.conversation-turn')).toHaveCount(1);
      await expect(send).toBeEnabled();
      await page.getByRole('button', { name: '대사 수정', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog
        .getByRole('textbox')
        .fill(
          Array.from(
            { length: 80 },
            (_, i) =>
              `*${i + 1}번째 문단입니다. 바람이 정원에서 나뭇잎을 흔들고 이야기가 천천히 이어집니다.*`,
          ).join('\n\n'),
        );
      await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const scroll = page.locator('.chat-scroll');
      expect(await scroll.evaluate((e) => getComputedStyle(e).overflowAnchor)).toBe('none');
      await scroll.evaluate((e) => {
        e.scrollTop = 700;
      });
      const before = await scroll.evaluate((e) => e.scrollTop);
      expect(before).toBe(700);
      await page.getByRole('textbox', { name: '메시지', exact: true }).fill('이어서 이야기해줘');
      await send.click();
      await expect(page.locator('.generation-status')).toBeVisible();
      expect(await scroll.evaluate((e) => e.scrollTop)).toBeCloseTo(before, 0);
      // Also cover reaching the bottom while waiting: the footer changes height
      // when suggestions return, but must not follow the newly appended response.
      if (position === 'bottom')
        await scroll.evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
      const reading = await scroll.evaluate((e) => e.scrollTop);
      await expect(page.locator('.conversation-turn')).toHaveCount(2);
      await expect(send).toBeEnabled();
      expect(await scroll.evaluate((e) => e.scrollTop)).toBeCloseTo(reading, 0);
      await page.getByRole('button', { name: '리롤', exact: true }).click();
      await expect(dialog).toBeVisible();
      await scroll.evaluate((e) => {
        e.scrollTop = 1200;
      });
      const rerollBefore = await scroll.evaluate((e) => e.scrollTop);
      await dialog.getByRole('button', { name: '다른 응답 생성', exact: true }).click();
      await expect(page.locator('.generation-status')).toBeVisible();
      expect(await scroll.evaluate((e) => e.scrollTop)).toBeCloseTo(rerollBefore, 0);
      await expect(send).toBeEnabled();
      expect(await scroll.evaluate((e) => e.scrollTop)).toBeCloseTo(rerollBefore, 0);
      await expect(page.locator('.conversation-turn')).toHaveCount(2);
      await page.reload();
      await expect(send).toBeEnabled();
      await expect.poll(() => scroll.evaluate((e) => e.scrollTop)).toBeGreaterThan(1200);
    });
}
