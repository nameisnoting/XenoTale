import { test, expect, type Page } from '@playwright/test';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { readDownloadedJson } from './read-file';

const textModel = {
  id: 'test/text',
  name: '텍스트 모델',
  context_length: 200000,
  supported_parameters: ['response_format'],
  architecture: { input_modalities: ['text'] },
};
const visionModel = {
  ...textModel,
  id: 'test/vision',
  name: '이미지 문서 모델',
  architecture: { input_modalities: ['text', 'image', 'file'] },
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxoAAAAASUVORK5CYII=',
  'base64',
);
async function openAssistant(page: Page, width: number) {
  if (
    width < 800 &&
    !(await page.getByRole('textbox', { name: '서포터 메시지', exact: true }).isVisible())
  ) {
    await page.getByRole('button', { name: '제작 도구', exact: true }).click();
    await page
      .locator('.editor-workspace')
      .getByRole('button', { name: '제작 서포터', exact: true })
      .click();
  }
}
async function choose(page: Page, name: string) {
  await page.locator('.assistant .model-trigger').click();
  const modal = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '대화 모델', exact: true }) });
  await modal.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await modal.getByRole('button', { name: '선택 완료', exact: true }).click();
}
async function ask(page: Page, text: string) {
  await page.getByRole('textbox', { name: '서포터 메시지', exact: true }).fill(text);
  await page.getByRole('button', { name: '서포터 전송', exact: true }).click();
  await expect(page.getByRole('button', { name: '서포터 생성 중단', exact: true })).toHaveCount(0);
}
for (const width of [1440, 393])
  test(`서포터 위로 열리는 메뉴·공통 지침·파일 선택/드롭·모델 검사·실패 복원 ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    const errors: string[] = [],
      calls: any[] = [];
    let fail = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://openrouter.ai/**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/models'))
        return route.fulfill({ json: { data: [textModel, visionModel] } });
      if (url.endsWith('/chat/completions')) {
        calls.push(route.request().postDataJSON());
        if (fail) {
          fail = false;
          return route.fulfill({ status: 503, json: { error: { message: 'mock failure' } } });
        }
        return route.fulfill({
          json: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    reply: `참고자료 확인 ${calls.length}`,
                    proposals: [],
                    questions: [],
                  }),
                },
              },
            ],
          },
        });
      }
      return route.fulfill({
        json: { data: { total_credits: 100, total_usage: 0, label: 'test' } },
      });
    });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'API key', exact: true }).fill('fake-reference-key');
    await page.getByRole('button', { name: '키 확인', exact: true }).click();
    await expect(page.getByRole('button', { name: '연결 확인됨' })).toBeVisible();
    await page.getByRole('group', { name: '채팅용 LLM', exact: true }).getByRole('button').click();
    await page.getByRole('button', { name: /^텍스트 모델/ }).click();
    await page.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: 'XenoTale 시작', exact: true }).click();
    await page
      .getByRole('button', { name: width < 800 ? '만들기' : '작품 만들기', exact: true })
      .click();
    await openAssistant(page, width);
    const plus = page.getByRole('button', { name: '서포터 추가 메뉴', exact: true });
    await plus.click();
    const menu = page.getByRole('menu', { name: '서포터 추가', exact: true });
    await expect(menu.getByRole('menuitem')).toHaveCount(3);
    const anchor = (await plus.boundingBox())!,
      popup = (await menu.boundingBox())!;
    expect(popup.y + popup.height).toBeLessThanOrEqual(anchor.y);
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(width);
    await menu.getByRole('menuitem', { name: /^지침/ }).click();
    const instructions = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: '공통 제작 지침', exact: true }) });
    await instructions
      .getByRole('textbox', { name: '지침', exact: true })
      .fill('한국어로 간결하게 설명하고 기존 설정을 존중한다.');
    await instructions.getByRole('button', { name: '저장', exact: true }).click();
    await expect(instructions).toHaveCount(0);
    await plus.click();
    const imageChooser = page.waitForEvent('filechooser');
    await menu.getByRole('menuitem', { name: '사진', exact: true }).click();
    await (await imageChooser).setFiles({ name: '캐릭터.png', mimeType: 'image/png', buffer: png });
    const composerFiles = page.locator('.support-composer .support-attachments [role=listitem]');
    await expect(composerFiles).toHaveCount(1);
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add(
      'word/document.xml',
      new TextReader(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word 기획: 마법 도시의 탐험</w:t></w:r></w:p></w:body></w:document>',
      ),
    );
    const docx = Buffer.from(await writer.close());
    await plus.click();
    const docChooser = page.waitForEvent('filechooser');
    await menu.getByRole('menuitem', { name: '문서', exact: true }).click();
    await (
      await docChooser
    ).setFiles([
      {
        name: '기획.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docx,
      },
      {
        name: '지도.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),
      },
    ]);
    await expect(composerFiles).toHaveCount(3);
    const transfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['Markdown 설정: 잊힌 탑'], '설정.md', { type: 'text/plain' }));
      return transfer;
    });
    await page.locator('.assistant').dispatchEvent('dragover', { dataTransfer: transfer });
    await expect(page.locator('.support-drop-hint')).toBeVisible();
    await page.locator('.assistant').dispatchEvent('drop', { dataTransfer: transfer });
    await expect(composerFiles).toHaveCount(4);
    await page.getByText('저장완료', { exact: true }).waitFor();
    const originalWorkspace = page.url();
    await page.reload();
    await openAssistant(page, width);
    await expect(composerFiles).toHaveCount(4);
    await ask(page, '사진과 기획서를 참고해줘.');
    await expect(page.locator('.toast')).toContainText(
      '선택한 모델은 이미지 입력을 지원하지 않습니다',
    );
    expect(calls).toHaveLength(0);
    await expect(composerFiles).toHaveCount(4);
    await expect(page.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue(
      '사진과 기획서를 참고해줘.',
    );
    await choose(page, '이미지 문서 모델');
    await plus.click();
    await page.screenshot({ path: `docs/screenshots/assistant-menu-${width}.png` });
    await page.keyboard.press('Escape');
    await ask(page, '사진과 기획서를 참고해줘.');
    await expect(page.getByText('참고자료 확인 1', { exact: true })).toBeVisible();
    expect(calls).toHaveLength(1);
    const parts = calls[0].messages[1].content,
      data = JSON.parse(parts[0].text);
    expect(data.sharedInstructions).toContain('한국어로 간결');
    expect(data.referenceFiles).toHaveLength(4);
    expect(parts.find((part: any) => part.type === 'image_url').image_url.url).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(parts.find((part: any) => part.type === 'file').file.filename).toBe('지도.pdf');
    expect(
      parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('\n'),
    ).toContain('Word 기획: 마법 도시의 탐험');
    expect(
      parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('\n'),
    ).toContain('Markdown 설정: 잊힌 탑');
    expect(calls[0].plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
    await expect(composerFiles).toHaveCount(0);
    await expect(page.locator('.support-user .support-attachments [role=listitem]')).toHaveCount(4);
    await choose(page, '텍스트 모델');
    await ask(page, '기획서 내용을 조금 더 정리해줘.');
    await expect(page.getByText('참고자료 확인 2', { exact: true })).toBeVisible();
    expect(calls[1].plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }]);
    expect(calls[1].messages[1].content.some((part: any) => part.type === 'image_url')).toBe(false);
    await page.getByText('저장완료', { exact: true }).waitFor();
    if (width < 800)
      await page.getByRole('button', { name: '제작 메뉴 닫기', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '작품 파일 내보내기', exact: true }).click();
    const exported = await readDownloadedJson((await (await download).path())!);
    expect(
      exported.workspace.assistantHistory.find((message: any) => message.attachments?.length)
        .attachments,
    ).toHaveLength(4);
    expect(exported.workspace.assistantAttachments).toEqual([]);
    expect(exported.workspace.work.prompt).not.toContain('한국어로 간결');
    if (width < 800) {
      await page.getByRole('button', { name: '제작 도구', exact: true }).click();
      await page
        .locator('.editor-workspace')
        .getByRole('button', { name: '작업공간', exact: true })
        .click();
    }
    const opened = page.context().waitForEvent('page');
    await page.getByRole('button', { name: '새 작업 공간', exact: true }).click();
    const other = await opened;
    await other.waitForURL(/#\/create\//);
    const nextWorkspace = other.url();
    await other.close();
    await page.goto(nextWorkspace);
    expect(page.url()).not.toBe(originalWorkspace);
    await openAssistant(page, width);
    await expect(composerFiles).toHaveCount(0);
    await plus.click();
    await menu.getByRole('menuitem', { name: /^지침/ }).click();
    await expect(instructions.getByRole('textbox', { name: '지침', exact: true })).toHaveValue(
      '한국어로 간결하게 설명하고 기존 설정을 존중한다.',
    );
    await instructions.getByRole('button', { name: '취소', exact: true }).click();
    await ask(page, '새 작업공간에서도 지침을 따라줘.');
    await expect(page.getByText('참고자료 확인 3', { exact: true })).toBeVisible();
    expect(JSON.parse(calls[2].messages[1].content).sharedInstructions).toContain('한국어로 간결');
    expect(JSON.parse(calls[2].messages[1].content).availableReferences).toEqual([]);
    await page.locator('input[aria-label="서포터 문서 첨부"]').setInputFiles({
      name: '실패복원.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('이 파일은 재시도에도 남아야 한다.'),
    });
    await expect(composerFiles).toHaveCount(1);
    fail = true;
    await ask(page, '이 파일을 확인해줘.');
    await expect(page.getByText(/제안을 준비하지 못했습니다/)).toBeVisible();
    await expect(composerFiles).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: '서포터 메시지', exact: true })).toHaveValue(
      '이 파일을 확인해줘.',
    );
    await ask(page, '이 파일을 다시 확인해줘.');
    await expect(page.getByText('참고자료 확인 5', { exact: true })).toBeVisible();
    await expect(composerFiles).toHaveCount(0);
    expect(
      calls[4].messages[1].content.some(
        (part: any) => part.type === 'text' && part.text.includes('재시도에도 남아야'),
      ),
    ).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('fake-reference-key');
    expect(
      await page
        .locator('.assistant')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
