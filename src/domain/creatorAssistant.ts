import { z } from 'zod';
import type { Work } from './types';
import { workSchema } from '../persistence/files';
import { validateWork } from './engine';

// One source of field types: the same schema used for importing/saving works.
export const creatorSections = [
  {
    id: 'overview',
    name: '작품 개요',
    fields: [
      'title',
      'description',
      'cover',
      'prompt',
      'systemMode',
      'customSystem',
      'quality',
      'lore',
    ],
  },
  { id: 'characters', name: '등장 캐릭터', fields: ['characters', 'characterGroups'] },
  { id: 'openings', name: '도입부', fields: ['openings'] },
  { id: 'media', name: '미디어', fields: ['media'] },
  {
    id: 'relations',
    name: '관계도',
    fields: ['relations', 'relationPositions', 'relationSplit', 'relationNodeIds'],
  },
  { id: 'statuses', name: '상태창', fields: ['statuses', 'statusTemplate'] },
  { id: 'items', name: '아이템', fields: ['items'] },
  { id: 'scenarios', name: '시나리오', fields: ['chapters'] },
  { id: 'shortcuts', name: '단축어', fields: ['shortcuts'] },
  { id: 'effects', name: '연출', fields: ['effects'] },
  { id: 'personas', name: '추천 페르소나', fields: ['personas'] },
  { id: 'guide', name: '플레이가이드', fields: ['guide'] },
] as const;
type SectionId = (typeof creatorSections)[number]['id'];
type EditableField = (typeof creatorSections)[number]['fields'][number];
const sectionSchemas = Object.fromEntries(
  creatorSections.map((section) => [
    section.id,
    z
      .object(Object.fromEntries(section.fields.map((field) => [field, workSchema.shape[field]])))
      .strict(),
  ]),
) as Record<SectionId, z.ZodObject>;
const answerSchema = z
  .object({
    reply: z.string().max(20000),
    proposals: z
      .array(
        z
          .object({
            section: z.enum(creatorSections.map((s) => s.id) as [SectionId, ...SectionId[]]),
            reason: z.string().max(4000),
            replacement: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(creatorSections.length),
    questions: z.array(z.string().max(4000)).max(10),
  })
  .strict();

export type CreatorRequest = {
  draft: Record<SectionId, Record<string, unknown>>;
  draftSchema: Record<SectionId, unknown>;
  sections: { id: SectionId; name: string }[];
  assets: Record<string, string>;
};
export type CreatorProposal = {
  sections: { id: SectionId; name: string; reason: string; replacement: Record<string, unknown> }[];
  changes: { field: EditableField; before: unknown; after: unknown }[];
};
export type CreatorMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposal?: CreatorProposal;
  applied?: boolean;
};

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a),
    bk = Object.keys(b);
  return (
    ak.length === bk.length &&
    ak.every(
      (key) =>
        Object.hasOwn(b, key) &&
        same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
function mapStrings(value: unknown, transform: (s: string) => string): unknown {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, transform));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, transform)]));
  return value;
}

export function creatorRequest(work: Work, assets: Record<string, string> = {}): CreatorRequest {
  const tokens = new Map<string, string>(
    Object.entries(assets).map(([token, value]) => [value, token]),
  );
  const draft = Object.fromEntries(
    creatorSections.map((section) => [
      section.id,
      Object.fromEntries(
        section.fields
          .filter((field) => work[field] !== undefined)
          .map((field) => [field, work[field]]),
      ),
    ]),
  );
  // Uploaded media remains local. The model can preserve/move these opaque references.
  const safeDraft = mapStrings(draft, (text) => {
    if (!text.startsWith('data:')) return text;
    if (!tokens.has(text)) {
      const token = `xenotale-local-asset:${tokens.size + 1}`;
      tokens.set(text, token);
      assets[token] = text;
    }
    return tokens.get(text)!;
  }) as CreatorRequest['draft'];
  return {
    draft: safeDraft,
    draftSchema: Object.fromEntries(
      creatorSections.map((s) => [
        s.id,
        z.toJSONSchema(sectionSchemas[s.id], { target: 'draft-7', unrepresentable: 'any' }),
      ]),
    ) as CreatorRequest['draftSchema'],
    sections: creatorSections.map(({ id, name }) => ({ id, name })),
    assets,
  };
}

function checkReferences(work: Work) {
  validateWork(work);
  const characters = new Set(work.characters.map((c) => c.id));
  const entities = new Set(['user', ...characters]);
  if (work.media.characters.some((c) => !characters.has(c.characterId)))
    throw new Error('미디어의 캐릭터 참조를 확인해 주세요.');
  if (
    work.relationNodeIds?.some((id) => !entities.has(id)) ||
    Object.keys(work.relationPositions ?? {}).some((id) => !entities.has(id))
  )
    throw new Error('관계도 배치의 인물 참조를 확인해 주세요.');
  if (
    work.media.rangeMin !== undefined &&
    work.media.rangeMax !== undefined &&
    work.media.rangeMin > work.media.rangeMax
  )
    throw new Error('미디어 상황 코드의 범위를 확인해 주세요.');
  const lists = [
    work.characters,
    work.openings,
    work.statuses,
    work.items,
    work.relations,
    work.chapters,
    work.effects,
    work.lore,
    work.personas,
    work.shortcuts,
    work.characterGroups ?? [],
    ...work.characters.map((c) => c.lore),
    ...work.chapters.map((c) => c.conditions),
  ];
  if (
    lists.some(
      (list) =>
        list.some((v) => !v.id.trim()) || new Set(list.map((v) => v.id)).size !== list.length,
    )
  )
    throw new Error('항목 ID가 비어 있거나 중복되어 있습니다.');
  for (const entries of [work.media.characters, work.media.situations])
    if (new Set(entries.map((e) => e.code)).size !== entries.length)
      throw new Error('미디어 코드가 중복되어 있습니다.');
  const namedEffects = work.effects.filter((e) => e.name.trim());
  if (
    new Set(namedEffects.map((e) => e.name.trim())).size !== namedEffects.length ||
    namedEffects.some((e) => /[{}]/.test(e.name) || /^(user|img:.*|effect:.*)$/.test(e.name))
  )
    throw new Error('연출 이름은 서로 다르게 입력하고 예약 태그는 사용하지 마세요.');
}

export function parseCreatorAnswer(raw: unknown, original: Work, request: CreatorRequest) {
  const answer = answerSchema.safeParse(raw);
  if (!answer.success) throw new Error('서포터 응답 형식이 올바르지 않습니다. 다시 요청해 주세요.');
  const sections: CreatorProposal['sections'] = [];
  const changes: CreatorProposal['changes'] = [];
  const seen = new Set<SectionId>();
  for (const p of answer.data.proposals) {
    if (seen.has(p.section)) throw new Error('같은 제작 항목의 제안이 중복되었습니다.');
    seen.add(p.section);
    const schema = sectionSchemas[p.section];
    const parsed = schema.safeParse(p.replacement);
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path.join('.') || 'replacement';
      throw new Error(
        `${creatorSections.find((s) => s.id === p.section)!.name}: ${path} 형식을 확인해 주세요.`,
      );
    }
    // Zod's nested import schemas strip unknown keys. Never silently accept them here.
    if (!same(parsed.data, p.replacement))
      throw new Error('제작 구조에 없는 필드가 포함되어 있습니다.');
    const replacement = mapStrings(parsed.data, (text) => {
      if (!text.startsWith('xenotale-local-asset:')) return text;
      if (!Object.hasOwn(request.assets, text))
        throw new Error('등록되지 않은 로컬 미디어 참조입니다.');
      return request.assets[text];
    }) as Record<string, unknown>;
    const definition = creatorSections.find((s) => s.id === p.section)!;
    const changed = definition.fields.filter((field) => !same(original[field], replacement[field]));
    if (!changed.length) continue;
    sections.push({ id: p.section, name: definition.name, reason: p.reason, replacement });
    for (const field of changed)
      changes.push({
        field,
        before: structuredClone(original[field]),
        after: structuredClone(replacement[field]),
      });
  }
  const proposal = { sections, changes };
  if (changes.length) applyCreatorProposal(original, proposal);
  return { reply: answer.data.reply, questions: answer.data.questions, proposal };
}

export function applyCreatorProposal(current: Work, proposal: CreatorProposal): Work {
  if (proposal.changes.some((c) => !same(current[c.field], c.before)))
    throw new Error('요청 후 제안 대상 항목을 수정하셨습니다. 현재 내용으로 다시 요청해 주세요.');
  const next = { ...current };
  for (const change of proposal.changes) {
    if (change.after === undefined) delete next[change.field];
    else Object.assign(next, { [change.field]: structuredClone(change.after) });
  }
  const parsed = workSchema.safeParse(next);
  if (!parsed.success) throw new Error('제안의 작품 데이터 형식이 올바르지 않습니다.');
  checkReferences(parsed.data);
  return next;
}

export function creatorPreview(value: unknown): string {
  if (typeof value === 'string') return value.startsWith('data:') ? '(등록된 미디어)' : value;
  return (
    JSON.stringify(
      mapStrings(value, (text) => (text.startsWith('data:') ? '(등록된 미디어)' : text)),
      null,
      2,
    ) ?? '(없음)'
  );
}
