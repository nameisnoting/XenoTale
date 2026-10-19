import { z } from 'zod';
import type { EffectSource, Room, Work } from './types';
import { clone, id, selected } from './types';
import { presentationSchema, checkPresentation } from './presentation';
import type { Presentation } from './types';

const key = z
  .string()
  .min(1)
  .max(1000)
  .refine((s) => !['__proto__', 'prototype', 'constructor'].includes(s));
export const effectResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(2000),
    outcome: z.string().trim().min(1).max(100).optional(),
    score: z.number().finite().min(-1e9).max(1e9).optional(),
    data: z
      .custom<Record<string, unknown>>(
        (v) =>
          !!v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          Object.keys(v).length <= 20 &&
          Object.keys(v).every((k) => !['__proto__', 'prototype', 'constructor'].includes(k)),
      )
      .pipe(
        z.record(key, z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()])),
      )
      .optional(),
  })
  .strict();
export const effectSourceSchema = z
  .object({
    eventId: key,
    candidateId: key.optional(),
    occurrence: z.number().int().min(0).max(2_000_000),
  })
  .strict();
export const effectRecordSchema = z
  .object({
    id: key,
    effectId: key,
    effectName: z.string().max(1000),
    source: effectSourceSchema,
    result: effectResultSchema,
    presentation: presentationSchema.optional(),
    createdAt: z.number().finite(),
  })
  .strict();

export function resolveEffect(work: Work, tag: string) {
  const token = tag.startsWith('effect:') ? tag.slice(7) : tag;
  const exact = work.effects.find((e) => e.id === token);
  if (exact) return exact;
  const named = work.effects.filter((e) => e.name.trim() && e.name === token);
  return named.length === 1 ? named[0] : undefined;
}
export function storyTokens(body: string) {
  const tokens: { text: string; tag?: string; occurrence: number }[] = [];
  let start = 0;
  for (const match of body.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (match.index > start)
      tokens.push({ text: body.slice(start, match.index), occurrence: start });
    tokens.push({ text: match[0], tag: match[1], occurrence: match.index });
    start = match.index + match[0].length;
  }
  if (start < body.length) tokens.push({ text: body.slice(start), occurrence: start });
  return tokens;
}
export const sameEffectSource = (a: EffectSource, b: EffectSource) =>
  a.eventId === b.eventId && a.candidateId === b.candidateId && a.occurrence === b.occurrence;
export function recordedEffect(room: Room, effectId: string, source: EffectSource) {
  return room.timeline.find(
    (e) =>
      e.kind === 'effect' &&
      e.effectResult?.effectId === effectId &&
      sameEffectSource(e.effectResult.source, source),
  );
}
export function effectSourceBody(room: Room, source: EffectSource) {
  if (source.eventId === `opening:${room.openingId}` && !source.candidateId)
    return room.work.openings.find((o) => o.id === room.openingId)?.body;
  const event = room.timeline.find((e) => e.id === source.eventId);
  if (event?.kind === 'turn' && source.candidateId === event.selectedId)
    return selected(event).body;
  if (
    (event?.kind === 'chapter' || event?.kind === 'action' || event?.kind === 'enhance') &&
    !source.candidateId
  )
    return event.body;
}
export function canCompleteEffect(room: Room, effectId: string, source: EffectSource) {
  if (recordedEffect(room, effectId, source)) return false;
  const last = room.timeline.at(-1);
  // Multiple different effects from the latest story passage may finish in order.
  const passage = [...room.timeline]
    .reverse()
    .find(
      (e) =>
        e.kind !== 'effect' &&
        !(
          e.kind === 'action' &&
          e.effectOrigin?.effectId === effectId &&
          sameEffectSource(e.effectOrigin.source, source)
        ),
    );
  const currentPassage = passage
    ? passage.id === source.eventId
    : source.eventId === `opening:${room.openingId}`;
  if (
    !currentPassage ||
    (last && !['turn', 'chapter', 'effect', 'action', 'enhance'].includes(last.kind))
  )
    return false;
  const token = storyTokens(effectSourceBody(room, source) ?? '').find(
    (t) => t.occurrence === source.occurrence && t.tag,
  );
  return !!token?.tag && resolveEffect(room.work, token.tag)?.id === effectId;
}
export function completeEffect(
  room: Room,
  effectId: string,
  source: EffectSource,
  raw: unknown,
  presentation?: Presentation,
): Room {
  const result = effectResultSchema.parse(raw);
  effectSourceSchema.parse(source);
  if (!canCompleteEffect(room, effectId, source))
    throw new Error('이미 결과를 반영했거나 이전 장면의 연출입니다. 다시 보기는 가능합니다.');
  const effect = room.work.effects.find((e) => e.id === effectId)!;
  const checked = presentation
    ? checkPresentation(presentation, room.work, effect.resources)
    : undefined;
  const next = clone(room);
  const before = clone(next.current);
  const record = {
    id: id(),
    effectId,
    effectName: effect.name,
    source: clone(source),
    result,
    ...(checked ? { presentation: checked } : {}),
    createdAt: Date.now(),
  };
  next.current.runtime.effectResults = [
    ...(next.current.runtime.effectResults ?? []),
    record,
  ].slice(-32);
  if (checked)
    next.current.runtime.presentation = { ...next.current.runtime.presentation, ...checked };
  const body = `${effect.name || '연출'} · ${result.summary}`;
  next.timeline.push({
    id: record.id,
    kind: 'effect',
    effectResult: record,
    body,
    before,
    after: clone(next.current),
    changes: [body],
    createdAt: record.createdAt,
  });
  return next;
}
