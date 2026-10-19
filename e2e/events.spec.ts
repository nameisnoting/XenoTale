import { test, expect, type Page } from '@playwright/test';
import { creatorSection } from './helpers/creator';
import { codeApproval } from '../src/domain/codeValidation';

async function savedWork(page: Page) {
  const key = new URL(page.url()).hash.split('/').at(-1)!;
  return page.evaluate(
    (id) =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('xenotale-v1');
        request.onsuccess = () => {
          const db = request.result,
            get = db.transaction('workspaces').objectStore('workspaces').get(id);
          get.onsuccess = () => {
            db.close();
            resolve(get.result.work);
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      }),
    key,
  );
}

for (const width of [1440, 393])
  test(`통합 이벤트·노드 연결·블록 전환·공유 조건·기존 요소·실제 실행 ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.setDefaultTimeout(10000);
    const errors: string[] = [],
      paid: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.url().includes('/chat/completions')) paid.push(r.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', (r) => r.fulfill({ json: { data: [] } }));
    await page.goto('/');
    await page.getByRole('button', { name: '키 없이 먼저 둘러보기', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await page.getByText('저장완료', { exact: true }).waitFor();
    const work = await savedWork(page);
    work.title = '이벤트로 만드는 모험';
    work.prompt = '선택에 따라 모험을 진행한다.';
    work.characters[0].name = '아리아';
    work.characters[0].prompt = '모험을 함께하는 동료';
    work.openings[0].body = '마법석을 찾아 모험을 시작한다.';
    work.statuses = [
      {
        id: 'power',
        name: '마력',
        type: 'number',
        initial: 0,
        min: 0,
        max: 100,
        options: [],
        unit: '',
        prompt: '',
      },
      {
        id: 'gold',
        name: '골드',
        type: 'number',
        initial: 10,
        min: 0,
        max: 100,
        options: [],
        unit: 'G',
        prompt: '',
      },
      {
        id: 'job',
        name: '직업',
        type: 'choice',
        initial: '전사',
        min: 0,
        max: 100,
        options: ['전사', '마법사'],
        unit: '',
        prompt: '',
      },
      {
        id: 'name',
        name: '이름',
        type: 'text',
        initial: '여행자',
        min: 0,
        max: 100,
        options: [],
        unit: '',
        prompt: '',
      },
    ];
    work.items = [
      {
        id: 'stone',
        name: '마법석',
        image: '',
        owned: false,
        quantity: 0,
        prompt: '',
        enhancement: null,
      },
      {
        id: 'sword',
        name: '검',
        image: '',
        owned: true,
        quantity: 1,
        prompt: '',
        enhancement: {
          currency: 'gold',
          target: 'power',
          costBase: 1,
          costStep: 1,
          gainBase: 1,
          gainStep: 1,
          probabilities: [1, 0.5],
          keepWeight: 7,
          resetWeight: 3,
        },
      },
    ];
    work.effects = [
      {
        id: 'light',
        name: '각성 빛',
        content: '<p>각성 연출</p>',
        prompt: '',
        validation: codeApproval('<p>각성 연출</p>'),
      },
    ];
    work.relationsEnabled = true;
    work.relationSplit = true;
    work.relations = [
      { id: 'bond', from: 'user', to: work.characters[0].id, label: '경계', innerLabel: '의심' },
    ];
    work.innerUnlock = {
      mode: 'all',
      conditions: [{ id: 'inner', kind: 'number', ref: 'power', op: 'gte', value: 10 }],
    };
    work.chapters = [
      {
        id: 'awakening',
        name: '각성',
        from: work.openings[0].id,
        type: 'chapter',
        mode: 'all',
        conditions: [{ id: 'door', kind: 'number', ref: 'power', op: 'gte', value: 10 }],
        prologue: '각성했다.',
        prompt: '',
        afterstory: true,
      },
    ];
    work.actions = [
      {
        id: 'pick',
        name: '마법석 줍기',
        trigger: 'button',
        mode: 'all',
        conditions: [],
        steps: [{ kind: 'gain', target: 'stone', value: '1' }],
      },
      {
        id: 'awaken',
        name: '마법석으로 각성',
        trigger: 'item-gained',
        triggerRef: 'stone',
        mode: 'all',
        conditions: [],
        steps: [
          { kind: 'add', target: 'power', value: '10' },
          { kind: 'relation', target: 'bond', value: '동료' },
          { kind: 'effect', target: 'light', value: '' },
        ],
      },
    ];
    await page
      .locator('input[accept*=".charx"]')
      .setInputFiles({
        name: '이벤트.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ kind: 'xenotale.work', schemaVersion: 2, work })),
      });
    await page.getByRole('button', { name: '작업 공간으로 불러오기', exact: true }).click();
    await creatorSection(page, width, '이벤트');
    const nav = page.locator(width < 800 ? '.editor-mobile-stages' : '.editor-nav');
    await expect(
      nav.getByRole(width < 800 ? 'tab' : 'button', { name: '상태값', exact: true }),
    ).toHaveCount(0);
    const tabs = page.getByRole('tablist', { name: '이벤트 제작', exact: true });
    await expect(tabs.getByRole('tab')).toHaveText([
      '이벤트',
      '상태값',
      '아이템',
      '연출',
      '상태창',
    ]);
    const card = page.locator('.event-editor').first();
    await card.getByRole('textbox', { name: '이벤트 이름', exact: true }).fill('마법석 줍기 수정');
    await card.getByRole('radio', { name: '노드형', exact: true }).check();
    await card.locator('[data-event-node="step:0"] .event-node').click();
    await card.getByRole('spinbutton', { name: '수량', exact: true }).fill('2');
    await card.getByRole('combobox', { name: '이벤트에 추가할 내용', exact: true }).click();
    await page.getByRole('option', { name: '숫자 상태 설정', exact: true }).click();
    await card.getByRole('spinbutton', { name: '설정할 값', exact: true }).fill('7');
    await card.getByRole('button', { name: '조건 출력', exact: true }).click();
    await card.getByRole('button', { name: '작업 2 입력', exact: true }).click();
    await card.getByRole('radio', { name: '블록형', exact: true }).check();
    await expect(
      card.locator('.event-step').first().getByRole('combobox', { name: '작업 종류', exact: true }),
    ).toContainText('숫자 상태 설정');
    await card.locator('.event-test > summary').click();
    await card.getByRole('button', { name: '테스트 실행', exact: true }).click();
    await expect(card.locator('.event-test-result')).toContainText('마력: 0 → 17');
    await expect(card.locator('.event-test-result')).toContainText('관계: 동료');
    await expect(card.locator('.event-test-result')).toContainText('이동 가능: 각성');
    const connected = card.locator('.event-connections .creator-card').first();
    await connected.locator('summary').click();
    await connected
      .getByRole('textbox', { name: '연결된 시나리오 이름', exact: true })
      .fill('각성 문');
    await connected.locator('.condition-row input[type=number]').fill('12');
    await card.getByRole('button', { name: '시나리오에서 편집', exact: true }).click();
    await page.getByRole('button', { name: '각성 문 조건 1개', exact: true }).click();
    const modal = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '챕터 설정', exact: true }) });
    await modal.getByRole('textbox', { name: '제목', exact: true }).fill('각성 문 수정');
    await modal.locator('.condition-row input[type=number]').fill('15');
    await modal.getByRole('button', { name: '완료', exact: true }).click();
    await creatorSection(page, width, '이벤트');
    await expect(card).toContainText('시나리오 · 각성 문 수정');
    await card.locator('.event-connections .creator-card').first().locator('summary').click();
    await expect(
      card
        .locator('.event-connections .creator-card')
        .first()
        .locator('.condition-row input[type=number]'),
    ).toHaveValue('15');
    const inner = card.locator('.event-connections .creator-card').last();
    await inner.locator('.condition-row input[type=number]').fill('13');
    await card.getByRole('button', { name: '관계도에서 편집', exact: true }).click();
    await expect(
      page.locator('.inner-unlock-settings .condition-row input[type=number]'),
    ).toHaveValue('13');
    await page.locator('.inner-unlock-settings .condition-row input[type=number]').fill('14');
    await creatorSection(page, width, '상태값');
    await expect(page.getByRole('button', { name: '상태값 추가', exact: true })).toBeVisible();
    await expect(page.getByText('{{직업}}', { exact: true })).toBeVisible();
    await expect(page.getByText('{{이름}}', { exact: true })).toBeVisible();
    await creatorSection(page, width, '아이템');
    await expect(page.getByRole('combobox', { name: '소모할 상태값', exact: true })).toBeVisible();
    await expect(
      page.getByRole('spinbutton', { name: '강화 2단계 확률', exact: true }),
    ).toHaveValue('50');
    await creatorSection(page, width, '연출');
    await page.getByRole('tab', { name: '수동연출', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '코드 입력', exact: true })).toHaveValue(
      '<p>각성 연출</p>',
    );
    await expect(page.locator('.code-validation').getByRole('status')).toHaveText('검사 완료');
    await creatorSection(page, width, '상태창');
    await expect(
      page.getByRole('button', { name: '캐릭터 만들기 예시 추가', exact: true }),
    ).toBeVisible();
    await creatorSection(page, width, '세부규칙');
    await card.getByRole('radio', { name: '노드형', exact: true }).check();
    await page.getByText('저장완료', { exact: true }).waitFor();
    const saved = await savedWork(page);
    expect(saved.statuses[0].initial).toBe(0);
    expect(saved.actions[0].steps.map((s: any) => s.kind)).toEqual(['set', 'gain']);
    expect(saved.actions[0].workspace.view).toBe('nodes');
    expect(saved.chapters[0].conditions[0].value).toBe(15);
    expect(saved.innerUnlock.conditions[0].value).toBe(14);
    await page.reload();
    await expect(card.getByRole('radio', { name: '노드형', exact: true })).toBeChecked();
    await page.screenshot({ path: `docs/screenshots/events-editor-${width}.png`, fullPage: true });
    expect(
      await page.locator('.editor-main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.getByRole('button', { name: '제작완료', exact: true }).click();
    await expect(page.getByText(/내 라이브러리에 반영했습니다/)).toBeVisible();
    await page.getByRole('button', { name: '메인으로', exact: true }).click();
    await page.getByRole('button', { name: '이벤트로 만드는 모험 대화 시작', exact: true }).click();
    await page
      .locator('.action-buttons')
      .getByRole('button', { name: '마법석 줍기 수정', exact: true })
      .click();
    await expect(page.getByRole('button', { name: '각성 빛 보기', exact: true })).toBeVisible();
    const runtime = await page.evaluate(
      () =>
        new Promise<any>((resolve) => {
          const req = indexedDB.open('xenotale-v1');
          req.onsuccess = () => {
            const db = req.result,
              get = db.transaction('rooms').objectStore('rooms').getAll();
            get.onsuccess = () => {
              const room = get.result.find((r: any) => r.work.title === '이벤트로 만드는 모험');
              db.close();
              resolve(room.current.runtime);
            };
          };
        }),
    );
    expect(runtime.status.power).toBe(17);
    expect(runtime.inventory.stone.quantity).toBe(2);
    expect(runtime.relationships.bond).toBe('동료');
    expect(errors).toEqual([]);
    expect(paid).toEqual([]);
  });
