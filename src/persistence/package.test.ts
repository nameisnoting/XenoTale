import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyWork, workspace } from '../domain/defaults';
import { createPreviewRoom } from '../domain/engine';
import { db } from './db';
import { createPackage, readPackage } from './package';
import { makeAsset, saveAssets } from './assets';
import { readImport } from './files';
import { readRisu } from './risu';

beforeEach(() => db.assets.clear());
const finished = () => {
  const work = emptyWork();
  work.title = '패키지';
  work.prompt = '설정';
  work.openings[0].body = '시작';
  return work;
};
describe('portable image packages', () => {
  it('stores bytes once, omits blank characters and restores the same named image without a server', async () => {
    const work = finished(),
      asset = await makeAsset(new Blob(['image bytes'], { type: 'image/png' }), '웃음');
    await saveAssets([asset]);
    work.media.assets = [
      {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        url: `asset:${asset.id}`,
      },
    ];
    work.cover = `asset:${asset.id}`;
    const blob = await createPackage({ kind: 'xenotale.work', schemaVersion: 2, work });
    const file = new File([blob], '작품.xeno'),
      raw = await readPackage(file),
      imported = await readImport(file);
    expect(raw.value.work).not.toHaveProperty('characters');
    expect(raw.assets).toHaveLength(1);
    expect(await raw.assets[0].blob.text()).toBe('image bytes');
    expect(imported.kind === 'work' && imported.work.characters).toEqual([]);
    expect(imported.kind === 'work' && imported.work.media.assets?.[0].name).toBe('웃음');
    expect((await makeAsset(asset.blob, '다른 이름')).id).toBe(asset.id);
  });
  it('refuses to export a dangling media reference', async () => {
    const work = finished();
    work.cover = 'asset:missing';
    await expect(createPackage({ kind: 'xenotale.work', schemaVersion: 2, work })).rejects.toThrow(
      '이미지',
    );
  });
  it('keeps a legacy unfinished test conversation readable after removing its blank character placeholder', async () => {
    const entry = workspace('작가');
    const room = createPreviewRoom(entry.work);
    room.work = structuredClone(entry.work);
    room.initial.runtime.presence = [entry.work.characters[0].id];
    room.current.runtime.presence = [entry.work.characters[0].id];
    entry.testRoom = room;
    const packed = await createPackage({
      kind: 'xenotale.workspace',
      schemaVersion: 2,
      workspace: entry,
    });
    const restored = await readImport(new File([packed], '작업.xeno'));
    expect(
      restored.kind === 'workspace' && restored.workspace.testRoom?.current.runtime.presence,
    ).toEqual([]);
    expect(restored.kind === 'workspace' && restored.workspace.testRoom?.work.characters).toEqual(
      [],
    );
  });
});

const folder = process.env.RISU_EXAMPLES_DIR;
it.skipIf(!folder)(
  'reads all three supplied Risu containers and reports unsupported features',
  async () => {
    const files = await readdir(folder!);
    let count = 0;
    for (const name of files) {
      if (!/\.(charx|png|jpe?g)$/i.test(name)) continue;
      const bytes = await readFile(join(folder!, name));
      const result = await readRisu(new File([bytes], name));
      expect(result.kind).toBe('work');
      if (result.kind === 'work') {
        expect(result.work.title).toBeTruthy();
        expect(result.work.prompt).toBeTruthy();
        expect(result.work.openings.length).toBeGreaterThan(0);
        expect(result.assets?.length).toBeGreaterThan(0);
        expect(result.warnings?.length).toBeGreaterThan(0);
        await saveAssets(result.assets ?? []);
        const packed = await createPackage({
          kind: 'xenotale.work',
          schemaVersion: 2,
          work: result.work,
        });
        const restored = await readImport(new File([packed], 'Risu.xeno'));
        expect(restored.kind === 'work' && restored.work.lore.length).toBe(result.work.lore.length);
        expect(restored.kind === 'work' && restored.work.prompt).toBe(result.work.prompt);
        if (name.endsWith('.png')) {
          expect(result.work.lore).toHaveLength(971);
          expect(result.work.displayRules?.length).toBeGreaterThan(0);
        }
      }
      count++;
    }
    expect(count).toBe(3);
  },
);
