import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addCreatorFiles, creatorDocumentText } from './creatorAttachments';
import { db } from './db';
import { createPackage } from './package';
import { readImport } from './files';
import { workspace, defaultProfile } from '../domain/defaults';
import {
  creatorReferences,
  CREATOR_FILE_COUNT,
  type CreatorAttachment,
} from '../domain/creatorAttachments';

beforeEach(() => db.assets.clear());
describe('creator reference inputs', () => {
  it('stores attachment bytes once and preserves draft/history references in portable workspaces', async () => {
    const files = await addCreatorFiles([new File(['설정 자료'], '기획.md')], []);
    const w = workspace('작가');
    w.assistantAttachments = files;
    w.assistantHistory = [
      { id: 'request', role: 'user', text: '이 자료를 참고해줘', attachments: files },
    ];
    const packed = await createPackage({
      kind: 'xenotale.workspace',
      schemaVersion: 2,
      workspace: w,
    });
    const imported = await readImport(new File([packed], '작업.xeno'));
    expect(imported.kind).toBe('workspace');
    if (imported.kind !== 'workspace') return;
    expect(imported.workspace.assistantAttachments).toEqual(files);
    expect(imported.workspace.assistantHistory![0].attachments).toEqual(files);
    expect(imported.assets).toHaveLength(1);
    expect(await imported.assets![0].blob.text()).toBe('설정 자료');
    expect(imported.workspace.work).not.toHaveProperty('assistantAttachments');
    const profile = { ...defaultProfile(), creatorInstructions: '한국어로 간결하게 작성한다.' };
    const backup = await readImport(
      new File(
        [
          JSON.stringify({
            kind: 'xenotale.backup',
            schemaVersion: 2,
            profile,
            works: [],
            rooms: [],
            workspaces: [w],
          }),
        ],
        '백업.json',
      ),
    );
    expect(backup.kind === 'backup' && backup.data.profile.creatorInstructions).toBe(
      profile.creatorInstructions,
    );
  });
  it('rejects invalid batches without partially saving files, including unsupported and oversized inputs', async () => {
    const valid = new File(['참고'], '자료.txt');
    await expect(addCreatorFiles([valid, new File(['bad'], '스크립트.exe')], [])).rejects.toThrow(
      '지원',
    );
    expect(await db.assets.count()).toBe(0);
    await expect(addCreatorFiles(Array(CREATOR_FILE_COUNT + 1).fill(valid), [])).rejects.toThrow(
      '6개',
    );
    await expect(
      addCreatorFiles([new File([new Uint8Array(10 * 1024 ** 2 + 1)], '큰사진.png')], []),
    ).rejects.toThrow('10MB');
    await expect(addCreatorFiles([new File(['not PDF'], '문서.pdf')], [])).rejects.toThrow('PDF');
    await expect(addCreatorFiles([new File(['not image'], '사진.png')], [])).rejects.toThrow(
      '이미지',
    );
    await expect(addCreatorFiles([new File([''], '빈파일.md')], [])).rejects.toThrow('비어');
  });
  it('decodes UTF-16 documents and refuses oversized text without silently truncating it', async () => {
    expect(
      await creatorDocumentText(
        new Blob([new Uint8Array([255, 254, 65, 0, 66, 0])]),
        'text',
        'UTF16.txt',
      ),
    ).toBe('AB');
    await expect(
      creatorDocumentText(new Blob(['x'.repeat(200001)]), 'text', '큰문서.txt'),
    ).rejects.toThrow('20만');
    await expect(creatorDocumentText(new Blob(['a\0b']), 'text', 'binary.txt')).rejects.toThrow(
      '텍스트',
    );
  });
  it('prioritizes current references, deduplicates shared bytes and bounds follow-up history payloads', () => {
    const file = (n: number): CreatorAttachment => ({
      id: String(n),
      name: `${n}.txt`,
      kind: 'text',
      type: 'text/plain',
      size: 10,
      asset: `asset:${String(n).padStart(64, '0')}`,
    });
    const current = file(20);
    const history = Array.from({ length: 10 }, (_, n) => ({ attachments: [file(n)] }));
    const refs = creatorReferences([...history, { attachments: [current] }], [current]);
    expect(refs).toHaveLength(6);
    expect(refs[0]).toEqual(current);
    expect(new Set(refs.map((f) => f.asset)).size).toBe(6);
    expect(refs.slice(1).map((f) => f.id)).toEqual(['9', '8', '7', '6', '5']);
  });
});
