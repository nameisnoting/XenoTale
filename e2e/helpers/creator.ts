import type { Page } from '@playwright/test';

export async function creatorSection(page: Page, width: number, name: string) {
  const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
  const library = ['상태값', '아이템', '연출', '상태창', '세부규칙'].includes(name);
  const target = library ? '이벤트' : name;
  const button = nav.getByRole(width < 800 ? 'tab' : 'button', { name: target, exact: true });
  if (!(await button.count())) {
    const toggle = nav.getByRole('button', { name: '고급설정', exact: true });
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  }
  await button.click();
  if (library)
    await page
      .getByRole('tablist', { name: '이벤트 제작', exact: true })
      .getByRole('tab', { name: name === '세부규칙' ? '이벤트' : name, exact: true })
      .click();
}
