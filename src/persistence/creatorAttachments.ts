import type { CreatorAttachment } from '../domain/creatorAttachments';
import {
  CREATOR_FILE_LIMIT,
  CREATOR_TOTAL_LIMIT,
  CREATOR_FILE_COUNT,
  CREATOR_TEXT_LIMIT,
} from '../domain/creatorAttachments';
import { id } from '../domain/types';
import { db } from './db';
import { makeAsset, saveAssets } from './assets';

export const CREATOR_IMAGES = '.png,.jpg,.jpeg,.webp,.gif';
export const CREATOR_DOCUMENTS = '.pdf,.txt,.md,.markdown,.docx,.csv,.json,.yaml,.yml,.xml';
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
export async function addCreatorFiles(
  files: File[],
  current: CreatorAttachment[],
): Promise<CreatorAttachment[]> {
  if (current.length + files.length > CREATOR_FILE_COUNT)
    throw new Error('사진·문서는 한 번에 최대 6개까지 첨부할 수 있습니다.');
  if (
    current.reduce((sum, file) => sum + file.size, 0) +
      files.reduce((sum, file) => sum + file.size, 0) >
    CREATOR_TOTAL_LIMIT
  )
    throw new Error('첨부파일의 전체 크기는 30MB까지 지원합니다.');
  const rows: CreatorAttachment[] = [],
    assets = [];
  for (const file of files) {
    if (!file.size || file.size > CREATOR_FILE_LIMIT)
      throw new Error(`${file.name}: 비어 있지 않은 10MB 이하 파일을 선택해 주세요.`);
    const ext = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const kind = imageTypes[ext]
      ? 'image'
      : ext === 'pdf'
        ? 'pdf'
        : ext === 'docx'
          ? 'docx'
          : CREATOR_DOCUMENTS.split(',').includes('.' + ext)
            ? 'text'
            : null;
    if (!kind)
      throw new Error(
        `${file.name}: PNG·JPG·WebP·GIF, PDF·TXT·MD·DOCX·CSV·JSON 등의 문서를 지원합니다.`,
      );
    const type =
      imageTypes[ext] ??
      (kind === 'pdf'
        ? 'application/pdf'
        : kind === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'text/plain');
    const blob = new Blob([file], { type });
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (kind === 'pdf' && new TextDecoder().decode(header.slice(0, 5)) !== '%PDF-')
      throw new Error(`${file.name}: 올바른 PDF 파일이 아닙니다.`);
    if (kind === 'image') {
      const valid =
        type === 'image/png'
          ? header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71
          : type === 'image/jpeg'
            ? header[0] === 255 && header[1] === 216 && header[2] === 255
            : type === 'image/gif'
              ? new TextDecoder().decode(header.slice(0, 3)) === 'GIF'
              : new TextDecoder().decode(header.slice(0, 4)) === 'RIFF' &&
                new TextDecoder().decode(header.slice(8, 12)) === 'WEBP';
      if (!valid) throw new Error(`${file.name}: 올바른 이미지 파일이 아닙니다.`);
    }
    if (kind === 'text' || kind === 'docx') await creatorDocumentText(blob, kind, file.name);
    const stored = await makeAsset(blob, file.name);
    assets.push(stored);
    rows.push({
      id: id(),
      name: file.name,
      kind,
      type,
      size: file.size,
      asset: `asset:${stored.id}`,
    });
  }
  await saveAssets(assets);
  return [...current, ...rows];
}
export async function creatorDocumentText(blob: Blob, kind: 'text' | 'docx', name: string) {
  let text: string;
  if (kind === 'docx') {
    const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js');
    const zip = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
    try {
      const entries = await zip.getEntries();
      const document = entries.find((entry) => entry.filename === 'word/document.xml');
      if (!document || document.directory || document.uncompressedSize > 2 * 1024 ** 2)
        throw new Error(`${name}: Word 문서 형식이나 크기를 확인해 주세요.`);
      const xml = await document.getData(new TextWriter());
      if (/<!DOCTYPE/i.test(xml)) throw new Error(`${name}: 지원하지 않는 문서 형식입니다.`);
      const parsed = new DOMParser().parseFromString(xml, 'application/xml');
      if (parsed.querySelector('parsererror'))
        throw new Error(`${name}: 문서 내용을 읽지 못했습니다.`);
      text = [...parsed.getElementsByTagNameNS('*', 'p')]
        .map((p) =>
          [...p.getElementsByTagNameNS('*', 't')].map((t) => t.textContent ?? '').join(''),
        )
        .join('\n');
    } finally {
      await zip.close();
    }
  } else {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? 'utf-16le'
        : bytes[0] === 254 && bytes[1] === 255
          ? 'utf-16be'
          : 'utf-8';
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${name}: UTF-8 또는 UTF-16 문서로 저장한 뒤 다시 첨부해 주세요.`);
    }
    if (text.includes('\0')) throw new Error(`${name}: 텍스트 문서가 아닙니다.`);
  }
  if (!text.trim()) throw new Error(`${name}: 읽을 수 있는 텍스트가 없습니다.`);
  if (text.length > CREATOR_TEXT_LIMIT)
    throw new Error(`${name}: 문서 텍스트는 20만 자까지 지원합니다. 나누어 첨부해 주세요.`);
  return text;
}
export async function readCreatorFiles(files: CreatorAttachment[]) {
  const rows = await db.assets.bulkGet(files.map((file) => file.asset.slice(6)));
  return files.map((file, index) => {
    const row = rows[index];
    if (!row) throw new Error(`${file.name}: 첨부파일을 찾지 못했습니다. 다시 첨부해 주세요.`);
    return { file, blob: row.blob };
  });
}
export function creatorDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('첨부파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}
