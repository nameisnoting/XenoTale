import { test, expect, type Locator } from '@playwright/test';

async function lineStyle(edge: Locator) {
  return edge.locator('.relation-edge-line').evaluate((e) => ({
    color: getComputedStyle(e).stroke,
    width: getComputedStyle(e).strokeWidth,
    outline: getComputedStyle(e.parentElement!).outlineStyle,
  }));
}
async function labelColor(edge: Locator) {
  return edge.locator('.relation-label-text').evaluate((e) => getComputedStyle(e).color);
}

for (const width of [1440, 393]) {
  test(`관계 이름 숨김·출발점 배치·방향 강조·전체 보기·확대 공유 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page.getByRole('button', { name: '정원 앞에서 대화 시작', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '메시지', exact: true })).toBeVisible();
    const roomUrl = page.url();
    // Fresh browser database only: create reciprocal and unrelated relationships.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('xenotale-v1');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const transaction = db.transaction('rooms', 'readwrite');
            const store = transaction.objectStore('rooms');
            const request = store.getAll();
            request.onsuccess = () => {
              const room = request.result[0];
              room.work.characters.push({
                ...structuredClone(room.work.characters[0]),
                id: 'bera',
                name: '베라',
                image: '',
              });
              room.work.relationSplit = true;
              room.work.relationPositions = {
                aria: { x: 180, y: 200 },
                user: { x: 450, y: 400 },
                bera: { x: 150, y: 550 },
              };
              room.work.relations = [
                {
                  id: 'aria-user',
                  from: 'aria',
                  to: 'user',
                  label: '방문객',
                  innerLabel: '관찰 중',
                },
                { id: 'user-aria', from: 'user', to: 'aria', label: '친구', innerLabel: '신뢰' },
                { id: 'aria-bera', from: 'aria', to: 'bera', label: '동료', innerLabel: '경계' },
                { id: 'bera-user', from: 'bera', to: 'user', label: '지인', innerLabel: '호감' },
              ];
              for (const checkpoint of [room.initial, room.current]) {
                checkpoint.runtime.relationships = Object.fromEntries(
                  room.work.relations.map((r: { id: string; label: string }) => [r.id, r.label]),
                );
                checkpoint.runtime.innerRelationships = Object.fromEntries(
                  room.work.relations.map((r: { id: string; innerLabel: string }) => [
                    r.id,
                    r.innerLabel,
                  ]),
                );
              }
              room.revision++;
              store.put(room);
            };
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
    );
    await page.goto(`${roomUrl}/panel/relations`);
    await page.reload();
    const canvas = page.locator('.relationship-canvas').first();
    const all = canvas.getByRole('button', { name: '전체 관계', exact: true });
    const layer = canvas.getByRole('button', { name: /내면으로/ });
    const outgoing = canvas.locator('[data-relation-id="aria-user"]');
    const incoming = canvas.locator('[data-relation-id="user-aria"]');
    const otherOutgoing = canvas.locator('[data-relation-id="aria-bera"]');
    const unrelated = canvas.locator('[data-relation-id="bera-user"]');
    await expect(outgoing).toBeVisible();
    await expect(canvas.locator('.relation-edge foreignObject')).toHaveCount(0);
    await expect(all.locator('svg')).toHaveClass(/lucide-eye-off/);
    expect(await lineStyle(outgoing)).toMatchObject({ color: 'rgb(95, 221, 206)', width: '1px' });
    await all.click();
    await expect(canvas.locator('.relation-edge foreignObject')).toHaveCount(4);
    for (const relation of [outgoing, incoming, otherOutgoing, unrelated])
      expect(await labelColor(relation)).toBe('rgb(255, 255, 255)');
    const name = canvas.locator('.relation-node-label').first();
    expect(
      await name.evaluate((e) => ({
        color: getComputedStyle(e).color,
        weight: getComputedStyle(e).fontWeight,
        padding: getComputedStyle(e).paddingLeft,
        background: getComputedStyle(e).backgroundColor,
      })),
    ).toEqual({
      color: 'rgb(204, 204, 204)',
      weight: '700',
      padding: '0px',
      background: 'rgba(0, 0, 0, 0)',
    });
    expect(
      await name.evaluate((e) => {
        const node = e.closest('.relation-node')!;
        const avatar = node.querySelector('circle')!;
        const box = node.querySelector('.relation-node-name-box')!;
        return Number(box.getAttribute('y')) - Number(avatar.getAttribute('r'));
      }),
    ).toBe(6);
    expect(
      await canvas
        .locator('.relation-label-text')
        .first()
        .evaluate((e) => getComputedStyle(e).paddingRight),
    ).toBe('6px');
    // Both uploaded portraits and the placeholder drawing share a circular mask.
    expect(
      await canvas.locator('.relation-node-avatar').evaluateAll((avatars) =>
        avatars.every((avatar) => {
          const clip = avatar.getAttribute('clip-path')!;
          const id = clip.slice(5, -1);
          const mask = document.getElementById(id)!;
          return (
            mask?.querySelector('circle')?.getAttribute('r') === '27' &&
            !!avatar.querySelector('image, path')
          );
        }),
      ),
    ).toBe(true);
    await expect(all.locator('svg')).toHaveClass(/lucide-eye$/);
    expect(
      await canvas
        .locator('.relation-label-text')
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe('rgba(51, 51, 51, 0.5)');
    expect(
      await canvas.locator('.relation-edge foreignObject').evaluateAll((labels) =>
        labels.every((label, index) => {
          const a = label.getBoundingClientRect();
          return labels.slice(index + 1).every((other) => {
            const b = other.getBoundingClientRect();
            return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          });
        }),
      ),
    ).toBe(true);
    const allBox = (await all.boundingBox())!,
      layerBox = (await layer.boundingBox())!;
    expect(layerBox.x + layerBox.width).toBeLessThanOrEqual(allBox.x);
    expect(allBox.y).toBeCloseTo(layerBox.y, 0);
    expect(allBox.height).toBe(layerBox.height);
    const canvasBox = (await canvas.boundingBox())!;
    expect(allBox.x + allBox.width).toBeCloseTo(canvasBox.x + canvasBox.width - 12, 0);
    expect(allBox.y - canvasBox.y).toBeGreaterThanOrEqual(12);
    expect(allBox.y - canvasBox.y).toBeLessThanOrEqual(20);
    // Each name is closer to the departure than the destination, even on curved edges.
    expect(
      await canvas.locator('.relation-edge').evaluateAll((edges) =>
        edges.every((edge) => {
          const label = edge.querySelector('foreignObject')!;
          const id = edge.getAttribute('data-relation-id')!;
          const endpoints: Record<string, [number[], number[]]> = {
            'aria-user': [
              [180, 200],
              [450, 400],
            ],
            'user-aria': [
              [450, 400],
              [180, 200],
            ],
            'aria-bera': [
              [180, 200],
              [150, 550],
            ],
            'bera-user': [
              [150, 550],
              [450, 400],
            ],
          };
          const [from, to] = endpoints[id];
          const x = Number(label.getAttribute('x')) + Number(label.getAttribute('width')) / 2;
          const y = Number(label.getAttribute('y')) + Number(label.getAttribute('height')) / 2;
          return Math.hypot(x - from[0], y - from[1]) < Math.hypot(x - to[0], y - to[1]);
        }),
      ),
    ).toBe(true);
    await all.click();
    await expect(canvas.locator('.relation-edge foreignObject')).toHaveCount(0);
    await expect(all.locator('svg')).toHaveClass(/lucide-eye-off/);
    const aria = canvas.getByRole('button', { name: '아리아 관계 보기', exact: true });
    await aria.click();
    await expect(canvas.locator('.relation-edge foreignObject')).toHaveCount(3);
    expect(await labelColor(outgoing)).toBe('rgb(233, 213, 151)');
    expect(await labelColor(incoming)).toBe('rgb(95, 221, 206)');
    for (const edge of [outgoing, otherOutgoing])
      expect(await lineStyle(edge)).toMatchObject({
        color: 'rgb(233, 213, 151)',
        width: '3px',
        outline: 'none',
      });
    expect(await lineStyle(incoming)).toMatchObject({ color: 'rgb(95, 221, 206)', width: '3px' });
    expect(await lineStyle(unrelated)).toMatchObject({ color: 'rgb(95, 221, 206)', width: '1px' });
    await layer.click();
    expect(await labelColor(outgoing)).toBe('rgb(233, 213, 151)');
    expect(await labelColor(incoming)).toBe('rgb(198, 72, 80)');
    expect(await lineStyle(incoming)).toMatchObject({ color: 'rgb(198, 72, 80)', width: '3px' });
    expect(await lineStyle(outgoing)).toMatchObject({ color: 'rgb(233, 213, 151)', width: '3px' });
    await unrelated.focus();
    await unrelated.press('Enter');
    await expect(canvas.locator('.relation-edge foreignObject')).toHaveCount(1);
    expect(await labelColor(unrelated)).toBe('rgb(233, 213, 151)');
    expect(await lineStyle(unrelated)).toMatchObject({
      color: 'rgb(233, 213, 151)',
      width: '3px',
      outline: 'none',
    });
    expect(await lineStyle(outgoing)).toMatchObject({ color: 'rgb(198, 72, 80)', width: '1px' });
    // Clicking an actual line must work in read-only chat, too.
    await all.click();
    for (const relation of [outgoing, incoming, otherOutgoing, unrelated])
      expect(await labelColor(relation)).toBe('rgb(255, 255, 255)');
    const point = await outgoing.locator('.relation-edge-line').evaluate((e: SVGPathElement) => {
      // The PC sidebar intentionally clips its large preview canvas. Pick a
      // visible section of this curve rather than clicking outside the panel.
      for (const fraction of [0.65, 0.55, 0.45, 0.75, 0.35]) {
        const p = e
          .getPointAtLength(e.getTotalLength() * fraction)
          .matrixTransform(e.getScreenCTM()!);
        const hit = document.elementFromPoint(p.x, p.y);
        if (hit?.closest('[data-relation-id]') === e.parentElement) return { x: p.x, y: p.y };
      }
      throw new Error('No visible hit area on the relation curve');
    });
    await page.mouse.click(point.x, point.y);
    await expect(outgoing).toHaveAttribute('aria-pressed', 'true');
    expect(await lineStyle(outgoing)).toMatchObject({ color: 'rgb(233, 213, 151)', width: '3px' });
    if (width > 800) {
      await canvas.getByRole('button', { name: '관계도 확대', exact: true }).click();
      const modal = page.getByRole('dialog');
      await expect(modal.getByRole('button', { name: '전체 관계', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(modal.getByRole('button', { name: /표면으로/ })).toBeVisible();
      expect(await lineStyle(modal.locator('[data-relation-id="aria-user"]'))).toMatchObject({
        color: 'rgb(233, 213, 151)',
        width: '3px',
      });
      await modal.screenshot({ path: `test-results/relation-focus-${width}.png` });
    } else {
      await canvas.screenshot({ path: `test-results/relation-focus-${width}.png` });
    }
    expect(errors).toEqual([]);
  });
}
