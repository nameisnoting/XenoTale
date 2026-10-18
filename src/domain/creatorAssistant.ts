import { z } from 'zod';
import type { Work } from './types';
import { workSchema } from '../persistence/files';
import { reviewCreatorProposal, same } from './creatorReview';
import type { CreatorIssue } from './creatorReview';

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
      'defaultUi',
      'lore',
    ],
  },
  { id: 'characters', name: '등장 캐릭터', fields: ['characters', 'characterGroups'] },
  { id: 'openings', name: '도입부', fields: ['openings'] },
  { id: 'media', name: '미디어', fields: ['media'] },
  { id: 'personas', name: '추천 페르소나', fields: ['personas'] },
  {
    id: 'relations',
    name: '관계도',
    fields: [
      'relations',
      'relationPositions',
      'relationSplit',
      'relationNodeIds',
      'relationsEnabled',
      'innerUnlock',
    ],
  },
  { id: 'statuses', name: '상태창', fields: ['statuses', 'statusTemplate'] },
  { id: 'items', name: '아이템', fields: ['items'] },
  { id: 'actions', name: '행동·규칙', fields: ['actions'] },
  { id: 'scenarios', name: '시나리오', fields: ['chapters'] },
  { id: 'shortcuts', name: '단축어', fields: ['shortcuts'] },
  { id: 'effects', name: '연출', fields: ['effects', 'displayRules'] },
] as const;
type SectionId = (typeof creatorSections)[number]['id'];
type EditableField = (typeof creatorSections)[number]['fields'][number] | 'guide';
const sectionSchemas = Object.fromEntries(
  creatorSections.map((section) => [
    section.id,
    z
      .object(Object.fromEntries(section.fields.map((field) => [field, workSchema.shape[field]])))
      .strict(),
  ]),
) as Record<SectionId, z.ZodObject>;

export type CreatorRequest = {
  draft: Record<SectionId, Record<string, unknown>>;
  draftSchema: Record<SectionId, unknown>;
  sections: { id: SectionId; name: string }[];
  assets: Record<string, string>;
};
export type CreatorProposal = {
  sections: { id: string; name: string; reason: string; replacement: Record<string, unknown> }[];
  changes: { field: EditableField; before: unknown; after: unknown }[];
  issues?: CreatorIssue[];
};
export type CreatorMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposal?: CreatorProposal;
  applied?: boolean;
  appliedIssues?: CreatorIssue[];
};

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

// Keep paid output even when some proposed data cannot be applied.
export function parseCreatorAnswer(raw: unknown, original: Work, request: CreatorRequest) {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sections: CreatorProposal['sections'] = [];
  const changes: CreatorProposal['changes'] = [];
  const issues: CreatorIssue[] = [];
  const proposals = Array.isArray(record.proposals) ? record.proposals : [];
  const seen = new Set<string>();
  for (const [sectionIndex, value] of proposals.entries()) {
    const entry = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const sectionId = typeof entry.section === 'string' ? entry.section : 'unknown';
    const definition = creatorSections.find((s) => s.id === sectionId);
    const replacement: Record<string, unknown> =
      entry.replacement &&
      typeof entry.replacement === 'object' &&
      !Array.isArray(entry.replacement)
        ? (mapStrings(entry.replacement, (text) =>
            Object.hasOwn(request.assets, text) ? request.assets[text] : text,
          ) as Record<string, unknown>)
        : { response: entry.replacement ?? value };
    const name = definition?.name ?? '알 수 없는 제작 항목';
    sections.push({
      id: sectionId,
      name,
      reason: typeof entry.reason === 'string' ? entry.reason : creatorPreview(entry.reason),
      replacement,
    });
    if (!definition) {
      issues.push({
        sectionIndex,
        message: '등록되지 않은 제작 항목입니다. 이 제안은 적용하지 않습니다.',
      });
      continue;
    }
    if (
      !entry.replacement ||
      typeof entry.replacement !== 'object' ||
      Array.isArray(entry.replacement)
    ) {
      issues.push({
        sectionIndex,
        message:
          '항목 내용의 형식이 올바르지 않습니다. 원문을 보존하며 이 항목은 적용하지 않습니다.',
      });
      continue;
    }
    if (seen.has(sectionId)) {
      issues.push({
        sectionIndex,
        message: '같은 제작 항목이 중복되었습니다. 중복 제안은 적용하지 않습니다.',
      });
      for (let i = 0; i < sectionIndex; i++)
        if (sections[i].id === sectionId)
          issues.push({
            sectionIndex: i,
            message: '같은 제작 항목이 중복되었습니다. 중복 제안은 적용하지 않습니다.',
          });
      continue;
    }
    seen.add(sectionId);
    for (const field of Object.keys(replacement)) {
      if (!(definition.fields as readonly string[]).includes(field))
        issues.push({
          sectionIndex,
          message: `${field}: 제작 구조에 없는 필드이므로 적용하지 않습니다.`,
          field,
        });
    }
    for (const field of definition.fields) {
      if (!same(original[field], replacement[field]))
        changes.push({
          field,
          before: structuredClone(original[field]),
          after: structuredClone(replacement[field]),
        });
    }
  }
  // Ambiguous duplicate sections never decide which replacement wins.
  const duplicates = new Set(
    sections
      .filter((s, i) => sections.findIndex((other) => other.id === s.id) !== i)
      .map((s) => s.id),
  );
  const proposal: CreatorProposal = {
    sections,
    changes: changes.filter(
      (change) =>
        !creatorSections.some(
          (s) => duplicates.has(s.id) && (s.fields as readonly string[]).includes(change.field),
        ),
    ),
    issues,
  };
  const reply =
    typeof record.reply === 'string'
      ? record.reply
      : typeof raw === 'string'
        ? raw
        : creatorPreview(raw);
  const questions = Array.isArray(record.questions)
    ? record.questions.map((v) => (typeof v === 'string' ? v : creatorPreview(v)))
    : record.questions === undefined
      ? []
      : [
          typeof record.questions === 'string'
            ? record.questions
            : creatorPreview(record.questions),
        ];
  if (
    !sections.length &&
    (typeof raw === 'string' || !Object.hasOwn(record, 'reply') || !Array.isArray(record.proposals))
  ) {
    proposal.sections.push({
      id: 'unknown',
      name: '응답 형식',
      reason: '',
      replacement: { response: raw },
    });
    issues.push({
      sectionIndex: 0,
      message:
        '응답이 완성되지 않았거나 제안 형식이 올바르지 않습니다. 원문을 보존하며 자동 적용하지 않습니다.',
    });
  }
  return { reply, questions, proposal };
}

export function applyCreatorProposal(current: Work, proposal: CreatorProposal): Work {
  return reviewCreatorProposal(current, proposal).work;
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
