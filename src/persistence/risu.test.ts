import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { readImport } from './files';
import { createPackage, readPackage } from './package';
import { saveAssets } from './assets';

it('maps Risu folders, lookup data and constant lore without inventing activation keywords, and preserves the exact source', async () => {
  const card = {
    spec: 'chara_card_v3',
    data: {
      name: '호환 시험',
      description: '설정',
      first_mes: '시작',
      character_book: {
        entries: [
          { name: '몬스터', mode: 'folder', keys: ['folder:monsters'], content: '' },
          {
            name: '몬스터: Aboleth',
            mode: 'normal',
            folder: 'folder:monsters',
            keys: [''],
            content: '몬스터 능력치',
          },
          { name: '기본 규칙', keys: [''], constant: true, content: '항상 필요한 규칙' },
          { name: '장면', keys: [' 정원 ', ''], content: '정원 설정' },
        ],
      },
      extensions: {
        risuai: {
          triggerscript: [
            { type: 'start', effect: [{ type: 'triggerlua', code: 'function onStart(id) end' }] },
          ],
        },
      },
      originalOnlyField: 'future-compatibility-data',
    },
  };
  const original = JSON.stringify(card, null, 2);
  const parsed = await readImport(new File([original], '원본.json'));
  expect(parsed.kind).toBe('work');
  if (parsed.kind !== 'work') return;
  expect(parsed.work.lore).toHaveLength(3);
  expect(parsed.work.lore[0]).toMatchObject({
    name: '몬스터: Aboleth',
    activation: 'reference',
    group: '몬스터',
    keywords: [],
    prompt: '몬스터 능력치',
  });
  expect(parsed.work.lore[1].activation).toBe('always');
  expect(parsed.work.lore[2]).toMatchObject({ activation: 'keyword', keywords: ['정원'] });
  await saveAssets(parsed.assets ?? []);
  const packed = await createPackage({
    kind: 'xenotale.work',
    schemaVersion: 2,
    work: parsed.work,
  });
  const result = await readImport(new File([packed], '작품.xeno'));
  expect(result.kind === 'work' && result.work.lore).toEqual(parsed.work.lore);
  const raw = await readPackage(new File([packed], '작품.xeno'));
  expect(raw.assets).toHaveLength(1);
  expect(await raw.assets[0].blob.text()).toBe(original);
});
