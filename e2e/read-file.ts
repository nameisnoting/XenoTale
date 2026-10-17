import fs from 'node:fs/promises';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';

// Inspect downloaded content in tests without assuming its temporary filename/extension.
export async function readDownloadedJson(path: string) {
  const bytes = await fs.readFile(path);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return JSON.parse(bytes.toString('utf8'));
  const reader = new ZipReader(new BlobReader(new Blob([bytes])), { useWebWorkers: false });
  try {
    const entry = (await reader.getEntries()).find((entry) => entry.filename === 'content.json');
    if (!entry || entry.directory) throw new Error('Missing package content');
    return JSON.parse(await entry.getData!(new TextWriter()));
  } finally {
    await reader.close();
  }
}
