import { z } from 'zod';
import type { Work } from './types';
import type { CreatorProposal } from './creatorAssistant';
import { workIssues, type WorkIssue } from './engine';
import { workSchema } from '../persistence/files';

export type CreatorIssue = {
  field?: string;
  index?: number;
  sectionIndex?: number;
  message: string;
};
type Field = CreatorProposal['changes'][number]['field'];
type Unit = { field: Field; index?: number; value: unknown; blocked: boolean };

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
const itemId = (value: unknown) =>
  value && typeof value === 'object' && 'id' in value ? value.id : undefined;
const hasUnknownAsset = (value: unknown): boolean => {
  if (typeof value === 'string') return value.startsWith('xenotale-local-asset:');
  if (Array.isArray(value)) return value.some(hasUnknownAsset);
  return !!value && typeof value === 'object' && Object.values(value).some(hasUnknownAsset);
};

// The same work rules guard publication and assistant changes. Add locations to
// the additional creator-only reference checks so valid sibling items can survive.
function creatorIssues(work: Work): WorkIssue[] {
  const issues = workIssues(work);
  const add = (field: keyof Work, message: string, index?: number, related: (keyof Work)[] = []) =>
    issues.push({ field, message, index, related });
  const characters = new Set(work.characters.map((c) => c.id));
  const entities = new Set(['user', ...characters]);
  if (work.media.characters.some((c) => !characters.has(c.characterId)))
    add('media', '미디어의 캐릭터 참조를 확인해 주세요.', undefined, ['characters']);
  if (work.relationNodeIds?.some((id) => !entities.has(id)))
    add('relationNodeIds', '관계도 배치의 인물 참조를 확인해 주세요.', undefined, ['characters']);
  if (Object.keys(work.relationPositions ?? {}).some((id) => !entities.has(id)))
    add('relationPositions', '관계도 배치의 인물 참조를 확인해 주세요.', undefined, ['characters']);
  if (
    work.media.rangeMin !== undefined &&
    work.media.rangeMax !== undefined &&
    work.media.rangeMin > work.media.rangeMax
  )
    add('media', '미디어 상황 코드의 범위를 확인해 주세요.');
  const lists = [
    'characters',
    'openings',
    'statuses',
    'items',
    'relations',
    'chapters',
    'effects',
    'lore',
    'personas',
    'shortcuts',
    'characterGroups',
  ] as const;
  for (const field of lists) {
    const list = work[field] ?? [];
    const counts = new Map<string, number>();
    for (const item of list) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    for (const [index, item] of list.entries()) {
      if (!item.id.trim() || counts.get(item.id)! > 1)
        add(field, '항목 ID가 비어 있거나 중복되어 있습니다.', index);
    }
  }
  for (const [index, character] of work.characters.entries())
    if (
      character.lore.some((v) => !v.id.trim()) ||
      new Set(character.lore.map((v) => v.id)).size !== character.lore.length
    )
      add('characters', '로어북 항목 ID가 비어 있거나 중복되어 있습니다.', index);
  for (const [index, chapter] of work.chapters.entries())
    if (
      chapter.conditions.some((v) => !v.id.trim()) ||
      new Set(chapter.conditions.map((v) => v.id)).size !== chapter.conditions.length
    )
      add('chapters', '조건 ID가 비어 있거나 중복되어 있습니다.', index);
  for (const entries of [work.media.characters, work.media.situations])
    if (new Set(entries.map((e) => e.code)).size !== entries.length)
      add('media', '미디어 코드가 중복되어 있습니다.');
  const effectNames = new Map<string, number>();
  for (const effect of work.effects)
    effectNames.set(effect.name.trim(), (effectNames.get(effect.name.trim()) ?? 0) + 1);
  for (const [index, effect] of work.effects.entries())
    if (
      effect.name.trim() &&
      (effectNames.get(effect.name.trim())! > 1 ||
        /[{}]/.test(effect.name) ||
        /^(user|img:.*|effect:.*)$/.test(effect.name))
    )
      add('effects', '연출 이름은 서로 다르게 입력하고 예약 태그는 사용하지 마세요.', index);
  return issues;
}

export function reviewCreatorProposal(current: Work, proposal: CreatorProposal) {
  const units: Unit[] = [];
  const issues: CreatorIssue[] = [...(proposal.issues ?? [])];
  const blockedFields = new Set<Field>();
  const originalIssues = creatorIssues(current);
  const issue = (unit: Unit, message: string) => {
    unit.blocked = true;
    if (
      !issues.some((v) => v.field === unit.field && v.index === unit.index && v.message === message)
    )
      issues.push({ field: unit.field, index: unit.index, message });
  };
  const check = (unit: Unit, schema: z.ZodType) => {
    const parsed = schema.safeParse(unit.value);
    if (!parsed.success) {
      for (const error of parsed.error.issues) {
        const path = error.path.join('.');
        issue(unit, `${path ? path + ': ' : ''}입력 형식을 확인해 주세요. ${error.message}`);
      }
    } else if (!same(parsed.data, unit.value))
      issue(unit, '제작 구조에 없는 필드가 포함되어 있습니다.');
    if (hasUnknownAsset(unit.value)) issue(unit, '등록되지 않은 로컬 미디어 참조입니다.');
  };
  for (const change of proposal.changes) {
    const schema = workSchema.shape[change.field];
    if (!schema) continue;
    const unwrapped = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
    const itemSchema =
      unwrapped instanceof z.ZodArray &&
      unwrapped.element instanceof z.ZodObject &&
      Object.hasOwn(unwrapped.element.shape, 'id')
        ? unwrapped.element
        : undefined;
    const isList = !!itemSchema && Array.isArray(change.after);
    const entries =
      isList && (change.after as unknown[]).length
        ? (change.after as unknown[]).map((value, index) => ({ value, index }))
        : [{ value: change.after, index: undefined }];
    // Optional lists can be wrapped in ZodOptional; handle them as one field.
    if (
      isList &&
      !(schema as z.ZodArray).safeParse(change.after).success &&
      (change.after as unknown[]).length > 10000
    ) {
      const unit = { field: change.field, value: change.after, blocked: false };
      units.push(unit);
      check(unit, schema);
      continue;
    }
    for (const { value, index } of entries) {
      const unit: Unit = { field: change.field, index, value, blocked: false };
      units.push(unit);
      if (!same(current[change.field], change.before)) {
        issue(unit, '요청 후 직접 수정한 항목입니다. 현재 내용을 유지합니다.');
        continue;
      }
      check(unit, isList && index !== undefined ? itemSchema! : schema);
    }
  }
  const build = (): Work => {
    const next = { ...current };
    for (const change of proposal.changes) {
      const fieldUnits = units.filter((unit) => unit.field === change.field);
      if (blockedFields.has(change.field)) continue;
      if (!same(current[change.field], change.before)) continue;
      if (fieldUnits.some((unit) => unit.index !== undefined)) {
        const old = (current[change.field] ?? []) as unknown[];
        const list = fieldUnits.flatMap((unit) => {
          if (!unit.blocked) return [structuredClone(unit.value)];
          const previous = old.find(
            (value) => itemId(value) !== undefined && itemId(value) === itemId(unit.value),
          );
          return previous === undefined ? [] : [previous];
        });
        Object.assign(next, { [change.field]: list });
      } else if (!fieldUnits.some((unit) => unit.blocked)) {
        if (change.after === undefined) delete next[change.field];
        else Object.assign(next, { [change.field]: structuredClone(change.after) });
      }
    }
    return next;
  };
  let next = build();
  // Recheck after exclusions: e.g. a valid chapter can still refer to a rejected
  // new status. Never delete a bad condition alone and accidentally unlock a scene.
  for (;;) {
    const failures = creatorIssues(next);
    let rejected = false;
    for (const failure of failures) {
      const value =
        failure.index === undefined
          ? next[failure.field]
          : (next[failure.field] as unknown[])[failure.index];
      const original =
        failure.index === undefined
          ? current[failure.field]
          : (current[failure.field] as unknown[])?.find((v) => itemId(v) === itemId(value));
      if (
        same(value, original) &&
        originalIssues.some((v) => v.field === failure.field && v.message === failure.message)
      )
        continue;
      const target = units.filter(
        (unit) =>
          unit.field === failure.field &&
          !unit.blocked &&
          (failure.index === undefined ||
            unit.index === undefined ||
            itemId(unit.value) === itemId(value)),
      );
      const rejectField = (field: Field) => {
        if (blockedFields.has(field)) return;
        blockedFields.add(field);
        issues.push({ field, message: failure.message });
        for (const unit of units.filter((v) => v.field === field)) unit.blocked = true;
        rejected = true;
      };
      if (
        failure.index === undefined &&
        proposal.changes.some((change) => change.field === failure.field) &&
        !same(current[failure.field], next[failure.field])
      ) {
        rejectField(failure.field as Field);
        continue;
      }
      if (!target.length) {
        for (const change of proposal.changes)
          if (
            failure.related.includes(change.field) &&
            !same(current[change.field], next[change.field])
          )
            rejectField(change.field);
        continue;
      }
      for (const unit of target) {
        issue(unit, failure.message);
        rejected = true;
      }
    }
    if (!rejected) break;
    next = build();
  }
  // Rejected deletions have no replacement item to restore; preserve the whole
  // affected list when it violates a required count or an unchanged reference.
  const accepted = proposal.changes
    .filter((change) => !same(current[change.field], next[change.field]))
    .map((change) => ({ ...change, after: next[change.field] }));
  return { work: next, changes: accepted, issues, applicable: accepted.length > 0 };
}
