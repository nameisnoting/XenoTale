import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`제목줄 자동 숨김이 본문을 다시 만들거나 스크롤을 붙잡지 않음 (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 852 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(page.locator('.conversation-turn')).toHaveCount(1);
    await page.getByRole('button', { name: '대사 수정', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox')
      .fill(
        Array.from(
          { length: 100 },
          (_, i) =>
            `${i + 1}번째 문단입니다. 긴 대화를 읽고 있습니다. [참고 자료](https://example.com)`,
        ).join('\n\n'),
      );
    await dialog.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const scroll = page.locator('.chat-scroll');
    const header = page.locator('.chat-header');
    await scroll.evaluate((element) => {
      element.scrollTop = 300;
    });
    await expect(header).not.toHaveClass(/is-scroll-hidden/);
    const link = await page.locator('.conversation-turn a').first().elementHandle();
    // Intercept application scrollTop assignments, not the browser's native scroll.
    await scroll.evaluate(async (element) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const property = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
      element.dataset.scrollWrites = '0';
      Object.defineProperty(element, 'scrollTop', {
        configurable: true,
        get() {
          return property.get!.call(this);
        },
        set(value) {
          element.dataset.scrollWriteDetails = JSON.stringify({
            from: property.get!.call(this),
            to: value,
            stack: new Error().stack,
          });
          element.dataset.scrollWrites = String(Number(element.dataset.scrollWrites) + 1);
          property.set!.call(this, value);
        },
      });
    });
    const box = (await scroll.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect(header).toHaveClass(/is-scroll-hidden/);
    await expect
      .poll(() => header.evaluate((element) => element.getBoundingClientRect().height))
      .toBe(0);
    expect(await scroll.getAttribute('data-scroll-write-details')).toBe(null);
    expect(await link!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(600);
    // The directional guard expires just after the 180ms header animation.
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, -200);
    await expect(header).not.toHaveClass(/is-scroll-hidden/);
    await expect
      .poll(() => header.evaluate((element) => element.getBoundingClientRect().height))
      .toBe(width <= 800 ? 56 : 64);
    await expect(scroll).toHaveAttribute('data-scroll-writes', '0');
    expect(await link!.evaluate((element) => element.isConnected)).toBe(true);
    if (width <= 800) {
      await page.waitForTimeout(100);
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      const touchStart = await scroll.evaluate((element) => element.scrollTop);
      const touchBox = (await scroll.boundingBox())!;
      const x = touchBox.x + touchBox.width / 2;
      const y = touchBox.y + touchBox.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 10; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - step * 25 }],
        });
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(header).toHaveClass(/is-scroll-hidden/);
      expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(
        touchStart + 150,
      );
      await expect(scroll).toHaveAttribute('data-scroll-writes', '0');
      expect(await link!.evaluate((element) => element.isConnected)).toBe(true);
      await session.detach();
    }
  });
}
