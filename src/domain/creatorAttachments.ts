import { z } from 'zod';
import type { Model } from './types';

export const CREATOR_FILE_LIMIT = 10 * 1024 ** 2;
export const CREATOR_TOTAL_LIMIT = 30 * 1024 ** 2;
export const CREATOR_FILE_COUNT = 6;
export const CREATOR_TEXT_LIMIT = 200_000;
export const creatorAttachmentSchema = z.object({
  id: z.string().max(1000),
  name: z.string().max(1000),
  kind: z.enum(['image', 'pdf', 'text', 'docx']),
  type: z.string().max(1000),
  size: z.number().int().min(0).max(CREATOR_FILE_LIMIT),
  asset: z.string().regex(/^asset:[a-f0-9]{64}$/),
});
export type CreatorAttachment = z.infer<typeof creatorAttachmentSchema>;
export type InputPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };
export const acceptsImages = (model?: Model) =>
  !!model?.architecture?.input_modalities?.includes('image');

/** Bound provider payloads; newest files have priority and old history keeps its metadata. */
export function creatorReferences(
  history: { attachments?: CreatorAttachment[] }[],
  current: CreatorAttachment[],
) {
  const selected: CreatorAttachment[] = [],
    seen = new Set<string>();
  let bytes = 0;
  for (const file of [
    ...current,
    ...history
      .slice(-10)
      .reverse()
      .flatMap((message) => message.attachments ?? []),
  ]) {
    if (seen.has(file.asset)) continue;
    seen.add(file.asset);
    if (selected.length >= CREATOR_FILE_COUNT || bytes + file.size > CREATOR_TOTAL_LIMIT) continue;
    selected.push(file);
    bytes += file.size;
  }
  return selected;
}
