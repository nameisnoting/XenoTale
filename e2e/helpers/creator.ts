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
  const open = page.locator('[data-event-resource-editor]');
  if (await open.count())
    await open.getByRole('button', { name: '편집 완료', exact: true }).first().click();
  if (library && name !== '세부규칙')
    await page
      .getByRole('group', { name: '요소 만들기·편집', exact: true })
      .getByRole('button', { name: new RegExp(`^${name} `) })
      .click();
}
