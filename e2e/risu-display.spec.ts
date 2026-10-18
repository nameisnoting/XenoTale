import { test, expect } from '@playwright/test';

for (const width of [1440, 393]) {
  test(`Risu 긴 화면은 바깥 스크롤 사용 · 클릭 시 문서/입력/펼침 유지 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('https://openrouter.ai/**', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              tx = db.transaction('rooms', 'readwrite'),
              store = tx.objectStore('rooms');
            const get = store.getAll();
            get.onsuccess = () => {
              const room = get.result[0];
              room.work.risu = {
                version: 1,
                variables: 'count=0',
                rules: [],
                styles: '',
                loreSettings: { scanDepth: 2, tokenBudget: 1000, recursive: false },
                scripts: [
                  {
                    id: 'display',
                    name: '표시 검사',
                    code: `
              listenEdit('editDisplay',function(id,text)
                local height=getChatVar(id,'compact')=='1' and '40' or '3200'
                return text:gsub('COUNT',getChatVar(id,'count')):gsub('HEIGHT',height)
              end)
              function onButtonClick(id,button)
                if button=='increment' then setChatVar(id,'count',tonumber(getChatVar(id,'count'))+1)
                elseif button=='compact' then setChatVar(id,'compact','1') end
              end`,
                  },
                ],
              };
              room.work.openings.find((o: any) => o.id === room.openingId).body = `
            <div><button id="increment" data-risu-trigger="increment">수치 증가</button>
            <span id="count">COUNT</span><input id="note" aria-label="메모" type="text" value="">
            <details id="details"><summary>설명 펼치기</summary><p>읽던 설명</p></details>
            <button data-risu-trigger="compact">줄이기</button>
            <div id="repeated"><button data-risu-trigger="increment">추가 증가</button><button data-risu-trigger="increment">추가 증가</button><span>COUNT</span></div>
            <div style="height:HEIGHTpx">긴 본문</div></div>`.replace(/\n\s*/g, '');
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
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    const frame = page.frameLocator('.opening-scene .risu-message iframe');
    const iframe = page.locator('.opening-scene .risu-message iframe');
    await expect(frame.locator('#count')).toHaveText('0');
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).toBeGreaterThan(3200);
    expect(
      await frame.locator('html').evaluate((html) => html.scrollHeight - html.clientHeight),
    ).toBeLessThanOrEqual(1);
    const outer = page.locator('.chat-scroll');
    expect(await outer.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(2000);
    await frame.getByRole('textbox', { name: '메모' }).fill('작성 중인 메모');
    await frame.getByText('설명 펼치기', { exact: true }).click();
    await frame.locator('#increment').evaluate((el) => {
      (el as any).marker = 'same node';
      (window as any).documentMarker = 'same document';
    });
    await outer.evaluate((el) => {
      el.scrollTop = 40;
    });
    const scroll = await outer.evaluate((el) => el.scrollTop);
    let navigations = 0;
    page.on('framenavigated', (f) => {
      if (f !== page.mainFrame()) navigations++;
    });
    await frame.getByRole('button', { name: '수치 증가' }).click();
    await expect(frame.locator('#count')).toHaveText('1');
    await expect(frame.getByRole('button', { name: '추가 증가', exact: true })).toHaveCount(2);
    expect(navigations).toBe(0);
    expect(
      await frame
        .locator('#increment')
        .evaluate((el) => ({ node: (el as any).marker, document: (window as any).documentMarker })),
    ).toEqual({ node: 'same node', document: 'same document' });
    await expect(frame.getByRole('textbox', { name: '메모' })).toHaveValue('작성 중인 메모');
    await expect(frame.locator('#details')).toHaveAttribute('open', '');
    expect(Math.abs((await outer.evaluate((el) => el.scrollTop)) - scroll)).toBeLessThan(2);
    await frame.getByRole('button', { name: '수치 증가' }).click();
    await expect(frame.locator('#count')).toHaveText('2');
    await frame.getByRole('button', { name: '줄이기' }).click();
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 9999).toBeLessThan(1000);
    expect(navigations).toBe(0);
    await page.getByRole('button', { name: '비주얼노벨 모드로 전환', exact: true }).click();
    const visual = page.frameLocator('.visual-novel-copy .risu-message iframe');
    await expect(visual.locator('#count')).toHaveText('2');
    await visual.locator('body').evaluate(() => {
      (window as any).documentMarker = 'visual novel';
    });
    await visual.getByRole('button', { name: '수치 증가', exact: true }).click();
    await expect(visual.locator('#count')).toHaveText('3');
    expect(await visual.locator('body').evaluate(() => (window as any).documentMarker)).toBe(
      'visual novel',
    );
  });
}
