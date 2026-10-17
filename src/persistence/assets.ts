import { db } from './db';

export type StoredAsset = { id: string; name: string; type: string; size: number; blob: Blob };
export const MEDIA_LIMIT = 2 * 1024 ** 3;
const urls = new Map<string, string>();
export const assetUrl = (value: string) =>
  value.startsWith('asset:') ? (urls.get(value.slice(6)) ?? '') : value;
export function exposeAsset(asset: StoredAsset) {
  if (!urls.has(asset.id)) urls.set(asset.id, URL.createObjectURL(asset.blob));
}
export async function hydrateAssets() {
  await db.assets.each(exposeAsset);
}
export async function makeAsset(blob: Blob, name: string): Promise<StoredAsset> {
  const type = blob.type || 'application/octet-stream';
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const id = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return { id, name, type, size: blob.size, blob };
}
export async function saveAssets(assets: StoredAsset[]) {
  if (!assets.length) return;
  await db.assets.bulkPut(assets);
  assets.forEach(exposeAsset);
}
export function collectAssetIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (typeof value === 'string')
    for (const match of value.matchAll(/asset:([a-zA-Z0-9-]+)/g)) ids.add(match[1]);
  else if (Array.isArray(value)) value.forEach((item) => collectAssetIds(item, ids));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => collectAssetIds(item, ids));
  return ids;
}
export const formatBytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
