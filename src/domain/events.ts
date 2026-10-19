import type { Work, Condition } from './types';
import { id } from './types';
import type { WorkAction } from './actions';

export const eventTriggers = [
  { value: 'button', label: '플레이어가 버튼을 누르면' },
  { value: 'after-response', label: 'AI 응답이 완료되면' },
  { value: 'item-gained', label: '아이템을 획득하면' },
  { value: 'state-changed', label: '상태값이 바뀌면' },
] as const;
export const eventOperations = [
  { value: 'add', label: '숫자 상태 증감' },
  { value: 'set', label: '숫자 상태 설정' },
  { value: 'text', label: '문자·객관식 상태 설정' },
  { value: 'gain', label: '아이템 획득' },
  { value: 'consume', label: '아이템 소비' },
  { value: 'relation', label: '표면 관계 변경' },
  { value: 'inner-relation', label: '내면 관계 변경' },
  { value: 'background', label: '배경 이미지 변경' },
  { value: 'music', label: '음악 변경' },
  { value: 'effect', label: '수동연출 보기 버튼 추가' },
] as const;
export type EventStep = WorkAction['steps'][number];
export function newEvent(actions: WorkAction[] = []): WorkAction {
  let number = 1;
  while (actions.some((a) => a.name === `이벤트${number}`)) number++;
  return {
    id: id(),
    name: `이벤트${number}`,
    defaultName: `이벤트${number}`,
    trigger: 'button',
    mode: 'all',
    conditions: [],
    steps: [],
    workspace: { view: 'blocks' },
  };
}
export function newEventStep(work: Work, kind: EventStep['kind']): EventStep {
  const target =
    kind === 'effect'
      ? work.effects[0]?.id
      : ['relation', 'inner-relation'].includes(kind)
        ? work.relations[0]?.id
        : ['gain', 'consume'].includes(kind)
          ? work.items[0]?.id
          : work.statuses.find((s) => (kind === 'text' ? s.type !== 'number' : s.type === 'number'))
              ?.id;
  const text = work.statuses.find((s) => s.id === target);
  return {
    kind,
    target: target ?? '',
    value: ['gain', 'consume'].includes(kind)
      ? '1'
      : kind === 'background'
        ? (work.media.assets?.[0]?.id ?? '')
        : kind === 'text'
          ? String(text?.initial ?? '')
          : ['music', 'relation', 'inner-relation', 'effect'].includes(kind)
            ? ''
            : '0',
  };
}
export function stepTitle(work: Work, step: EventStep) {
  const name =
    work.statuses.find((s) => s.id === step.target)?.name ??
    work.items.find((s) => s.id === step.target)?.name ??
    work.effects.find((s) => s.id === step.target)?.name;
  const operation = eventOperations.find((op) => op.value === step.kind)?.label ?? step.kind;
  if (step.kind === 'background')
    return `${operation} · ${work.media.assets?.find((a) => a.id === step.value)?.name || '이미지 선택'}`;
  if (['relation', 'inner-relation'].includes(step.kind))
    return `${operation} · ${step.value || '내용 입력'}`;
  return `${operation}${name ? ` · ${name}` : ''}`;
}
export function conditionTitle(work: Work, condition: Condition) {
  const name =
    work.statuses.find((s) => s.id === condition.ref)?.name ??
    work.items.find((s) => s.id === condition.ref)?.name ??
    '대상 선택';
  const op = { gte: '이상', lte: '이하', eq: '같음', ne: '다름' }[condition.op];
  return condition.kind === 'item'
    ? `${name} · ${condition.value ? '보유' : '미보유'}${condition.op === 'ne' ? ' 아님' : ''}`
    : `${name} · ${String(condition.value)} ${op}`;
}
/** Derived links always read the original chapter/inner conditions, never copies. */
export function eventConnections(work: Work, action: WorkAction) {
  const affected = new Set(
    action.steps
      .filter((s) => ['add', 'set', 'text', 'gain', 'consume'].includes(s.kind))
      .map((s) => s.target),
  );
  const chapters = work.chapters.filter(
    (chapter) =>
      action.workspace?.chapters?.includes(chapter.id) ||
      chapter.conditions.some((c) => affected.has(c.ref)),
  );
  const inner =
    !!action.workspace?.innerUnlock ||
    !!work.innerUnlock?.conditions.some((c) => affected.has(c.ref));
  return { chapters, inner };
}
export function moveEventStep(action: WorkAction, from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= action.steps.length || to >= action.steps.length)
    return action.steps;
  const steps = [...action.steps];
  steps.splice(to, 0, steps.splice(from, 1)[0]);
  return steps;
}
