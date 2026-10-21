import { test, expect } from '@playwright/test';

test('앱 갱신은 이전 셸 캐시를 정리하고 온라인 새로고침·오프라인 재입장을 지원', async ({
  page,
  context,
}) => {
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    await (await caches.open('xenotale-shell-v1')).put('/', new Response('obsolete shell'));
    await (await caches.open('unrelated-cache')).put('/sentinel', new Response('keep'));
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('xenotale-shell-v1');
  expect(await page.evaluate(() => caches.has('unrelated-cache'))).toBe(true);
  await page.evaluate(async () => {
    await (
      await caches.open('xenotale-shell-v2')
    ).put(
      '/',
      new Response('<!doctype html><title>obsolete shell</title>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
  });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/');
  await expect(page).toHaveTitle('XenoTale');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.goto('/#/profile');
  const github = page.getByRole('link', { name: '개발자 GitHub', exact: true });
  await expect(github.locator('svg').first()).toBeVisible();
  await expect(github.locator('img')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const response = await (await caches.open('xenotale-shell-v2')).match('/');
        return response?.text();
      }),
    )
    .toContain('<title>XenoTale</title>');
  await context.setOffline(true);
  await page.reload();
  await expect(github).toBeVisible();
  await expect(
    page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }),
  ).toHaveCount(0);
});

test('대화방 아이템 메뉴는 별도 이미지 요청 없이 표시', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/icons/chat/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
  await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
  const inventory = page
    .getByRole('navigation', { name: '대화 기능 메뉴', exact: true })
    .getByRole('button', { name: '아이템', exact: true });
  await expect(inventory.locator('svg')).toBeVisible();
  await expect(inventory.locator('img')).toHaveCount(0);
  await inventory.click();
  await expect(page.getByRole('region', { name: '아이템', exact: true })).toBeVisible();
});
