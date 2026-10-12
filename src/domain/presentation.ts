import { z } from 'zod';
import type { Work } from './types';
import { mediaImage } from './visualNovel';
import { registeredMedia } from './chatUi';

const color = z.string().regex(/^(?:#[\da-fA-F]{3,8}|rgba?\([\d., %]+\))$/);
export const presentationSchema = z
  .object({
    background: z.string().max(1000).optional(),
    music: z.string().max(2000000).nullable().optional(),
    uiType: z.enum(['novel', 'visual-novel']).optional(),
    theme: z.object({ textbox: color.optional(), text: color.optional() }).strict().optional(),
  })
  .strict();
export function checkPresentation(raw: unknown, work: Work, resources: string[] = []) {
  const value = presentationSchema.parse(raw);
  if (value.background && !mediaImage(work, value.background))
    throw new Error('등록된 장면 이미지 코드만 사용할 수 있습니다.');
  if (
    value.music &&
    (!/^https:\/\//.test(value.music) ||
      ![...registeredMedia(work), ...resources].includes(value.music))
  )
    throw new Error('등록된 HTTPS 음악 주소만 사용할 수 있습니다.');
  return value;
}
