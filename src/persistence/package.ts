import { db } from './db';
import { collectAssetIds, makeAsset, MEDIA_LIMIT, type StoredAsset } from './assets';
import { cleanWork, hasCharacterContent } from '../domain/workContent';
import type { Room, Work } from '../domain/types';

function packJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && item.work && Array.isArray(item.timeline)) {
      const blankIds = new Set(
        (item as Room).work.characters.filter((c) => !hasCharacterContent(c)).map((c) => c.id),
      );
      if (blankIds.size) {
        const room = structuredClone(item as Room);
        const checkpoints = [
          room.initial,
          room.current,
          ...room.timeline.flatMap((event) => [
            event.before,
            ...(event.kind === 'turn' ? event.candidates.map((c) => c.checkpoint) : [event.after]),
          ]),
        ];
        for (const checkpoint of checkpoints)
          checkpoint.runtime.presence = checkpoint.runtime.presence.filter(
            (id) => !blankIds.has(id),
          );
        return room;
      }
    }
    if (
      item &&
      typeof item === 'object' &&
      'customSystem' in item &&
      Array.isArray(item.openings)
    ) {
      const work = cleanWork(item as Work);
      return { ...work, characters: work.characters.length ? work.characters : undefined };
    }
    return item;
  });
}
export async function createPackage(value: unknown): Promise<Blob> {
  const json = packJson(value);
  if (new Blob([json]).size > 50 * 1024 ** 2)
    throw new Error('설정 데이터가 50MB를 초과합니다. 작품별로 나누어 내보내 주세요.');
  const assets = await db.assets.bulkGet([...collectAssetIds(JSON.parse(json))]);
  if (assets.some((a) => !a))
    throw new Error('작품에 연결된 이미지가 없습니다. 원본 파일을 다시 불러와 주세요.');
  if (assets.length > 10000 || assets.reduce((sum, asset) => sum + asset!.size, 0) > MEDIA_LIMIT)
    throw new Error(
      '파일 하나의 내장 이미지는 2GB·10,000개까지 지원합니다. 작품별로 나누어 내보내 주세요.',
    );
  const { BlobReader, BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js');
  const writer = new ZipWriter(new BlobWriter('application/vnd.xenotale+zip'), {
    useWebWorkers: false,
  });
  try {
    await writer.add('content.json', new TextReader(json));
    for (const asset of assets as StoredAsset[]) {
      await writer.add(`assets/${asset.id}`, new BlobReader(asset.blob), { level: 0 });
    }
    await writer.add(
      'assets.json',
      new TextReader(
        JSON.stringify(
          assets.map((a) => ({ id: a!.id, name: a!.name, type: a!.type, size: a!.size })),
        ),
      ),
    );
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}
export async function readPackage(file: File): Promise<{ value: any; assets: StoredAsset[] }> {
  const { BlobReader, BlobWriter, TextWriter, ZipReader } = await import('@zip.js/zip.js');
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    if (entries.length > 10005) throw new Error('패키지의 파일 수가 너무 많습니다.');
    const content = entries.find((e) => e.filename === 'content.json');
    const manifest = entries.find((e) => e.filename === 'assets.json');
    if (!content || !manifest || content.directory || manifest.directory)
      throw new Error('XenoTale 패키지가 아닙니다.');
    if (content.uncompressedSize > 50 * 1024 ** 2 || manifest.uncompressedSize > 10 * 1024 ** 2)
      throw new Error('작품 설정 데이터가 너무 큽니다.');
    const value = JSON.parse(await content.getData!(new TextWriter()));
    const rows = JSON.parse(await manifest.getData!(new TextWriter()));
    if (!Array.isArray(rows) || rows.length > 10000)
      throw new Error('미디어 목록이 올바르지 않습니다.');
    const assets: StoredAsset[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const row of rows) {
      if (
        !row ||
        !/^[a-zA-Z0-9-]+$/.test(row.id) ||
        seen.has(row.id) ||
        typeof row.name !== 'string' ||
        typeof row.type !== 'string' ||
        !Number.isSafeInteger(row.size) ||
        row.size < 0
      )
        throw new Error('미디어 정보가 올바르지 않습니다.');
      seen.add(row.id);
      const entry = entries.find((e) => e.filename === `assets/${row.id}`);
      if (!entry || entry.directory || entry.uncompressedSize !== row.size)
        throw new Error('내장 이미지 크기가 일치하지 않습니다.');
      total += row.size;
      if (total > MEDIA_LIMIT) throw new Error('내장 미디어는 2GB 이하로 불러올 수 있습니다.');
      const blob = await entry.getData!(new BlobWriter(row.type));
      if (blob.size !== row.size) throw new Error('내장 이미지가 손상되었습니다.');
      if ((await makeAsset(blob, row.name)).id !== row.id)
        throw new Error('내장 이미지의 무결성을 확인할 수 없습니다.');
      assets.push({ ...row, blob });
    }
    for (const assetId of collectAssetIds(value))
      if (!seen.has(assetId)) throw new Error('패키지에 필요한 이미지가 없습니다.');
    return { value, assets };
  } finally {
    await reader.close();
  }
}
export async function downloadPackage(name: string, value: unknown) {
  const blob = await createPackage(value);
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
