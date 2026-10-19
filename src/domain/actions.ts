import { z } from 'zod';
import type { Work, Runtime, Room, Condition, EffectSource } from './types';
import { canCompleteEffect } from './effects';
import { clone, id } from './types';
import { conditionsMet } from './conditions';

const key = z.string().min(1).max(1000);
export const actionSchema = z.object({
  id: key,
  name: z.string().max(1000),
  trigger: z.enum(['button', 'after-response']),
  buttonLocation: z.enum(['composer', 'screen']).optional(),
  mode: z.enum(['all', 'any']),
  conditions: z
    .array(
      z.object({
        id: key,
        kind: z.enum(['number', 'choice', 'item', 'level', 'quantity']),
        ref: z.string().max(1000),
        op: z.enum(['gte', 'lte', 'eq', 'ne']),
        value: z.union([z.string(), z.number().finite(), z.boolean()]),
      }),
    )
    .max(100),
  steps: z
    .array(
      z.object({
        kind: z.enum(['add', 'set', 'text', 'gain', 'consume', 'background', 'music', 'effect']),
        target: z.string().max(1000),
        value: z.string().max(2000),
      }),
    )
    .max(100),
});
export type WorkAction = z.infer<typeof actionSchema>;

/** Small arithmetic language, never eval/Function. References use stable status IDs in [brackets]. */
export function calculate(
  expression: string,
  status: Runtime['status'],
  roll = Math.random,
): number {
  const tokens = expression.match(/\[[^\]]+\]|\d+(?:\.\d+)?|[a-z]+|[()+*/%,\-]/gi) ?? [];
  if (!expression.trim() || tokens.join('').replace(/\s/g, '') !== expression.replace(/\s/g, ''))
    throw new Error('계산식 문법을 확인해 주세요.');
  if (tokens.length > 200) throw new Error('계산식이 너무 깁니다.');
  let i = 0;
  const take = (token: string) => tokens[i] === token && !!++i;
  const atom = (): number => {
    if (take('-')) return -atom();
    if (take('+')) return atom();
    if (take('(')) {
      const n = sum();
      if (!take(')')) throw new Error('닫는 괄호가 필요합니다.');
      return n;
    }
    const token = tokens[i++];
    if (!token) throw new Error('계산할 값이 필요합니다.');
    if (token.startsWith('[')) {
      const v = status[token.slice(1, -1)];
      if (typeof v !== 'number') throw new Error('숫자 상태를 선택해 주세요.');
      return v;
    }
    if (/^\d/.test(token)) return Number(token);
    if (!take('(')) throw new Error('지원하지 않는 계산식입니다.');
    const args = [sum()];
    while (take(',')) args.push(sum());
    if (!take(')')) throw new Error('닫는 괄호가 필요합니다.');
    if (token === 'dice' && args.length === 2) {
      const [n, s] = args;
      if (!Number.isInteger(n) || !Number.isInteger(s) || n < 1 || n > 100 || s < 2 || s > 1000)
        throw new Error('주사위는 1~100개, 2~1000면입니다.');
      return Array.from({ length: n }, () => Math.floor(roll() * s) + 1).reduce((a, b) => a + b, 0);
    }
    const fn = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, abs: Math.abs }[
      token
    ];
    if (!fn) throw new Error('min, max, floor, ceil, abs, dice를 사용할 수 있습니다.');
    return (fn as (...values: number[]) => number)(...args);
  };
  const product = (): number => {
    let n = atom();
    while (['*', '/', '%'].includes(tokens[i])) {
      const op = tokens[i++],
        v = atom();
      n = op === '*' ? n * v : op === '/' ? n / v : n % v;
    }
    return n;
  };
  const sum = (): number => {
    let n = product();
    while (['+', '-'].includes(tokens[i])) {
      const op = tokens[i++],
        v = product();
      n = op === '+' ? n + v : n - v;
    }
    return n;
  };
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result) || Math.abs(result) > 1e9)
    throw new Error('계산 결과가 올바르지 않습니다.');
  return result;
}
export const actionAvailable = (work: Work, state: Runtime, action: WorkAction) =>
  conditionsMet(work, state, action.conditions as Condition[], action.mode);
export function applyAction(work: Work, state: Runtime, action: WorkAction): Runtime {
  actionSchema.parse(action);
  if (!actionAvailable(work, state, action))
    throw new Error('행동의 실행 조건을 충족하지 않았습니다.');
  const next = clone(state);
  for (const step of action.steps) {
    const field = work.statuses.find((s) => s.id === step.target),
      item = work.items.find((s) => s.id === step.target);
    if (step.kind === 'add' || step.kind === 'set') {
      if (field?.type !== 'number') throw new Error('숫자 상태의 연결을 확인해 주세요.');
      const n =
        calculate(step.value, next.status) +
        (step.kind === 'add' ? Number(next.status[field.id]) : 0);
      next.status[field.id] = Math.max(field.min, Math.min(field.max, n));
    } else if (step.kind === 'text') {
      if (
        !field ||
        field.type === 'number' ||
        (field.type === 'choice' && !field.options.includes(step.value))
      )
        throw new Error('문자·선택 상태의 연결을 확인해 주세요.');
      next.status[field.id] = step.value;
    } else if (step.kind === 'gain' || step.kind === 'consume') {
      if (!item) throw new Error('아이템의 연결을 확인해 주세요.');
      const old = next.inventory[item.id],
        quantity = old?.quantity ?? (old?.owned ? 1 : 0),
        amount = calculate(step.value, next.status);
      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1e6 ||
        (step.kind === 'consume' && quantity < amount)
      )
        throw new Error('아이템 수량이 부족하거나 올바르지 않습니다.');
      const total = quantity + (step.kind === 'gain' ? amount : -amount);
      if (total > 1e6) throw new Error('아이템은 최대 1,000,000개까지 보관할 수 있습니다.');
      next.inventory[item.id] = {
        ...old,
        level: old?.level ?? 0,
        bonus: old?.bonus ?? 0,
        owned: total > 0,
        quantity: total,
      };
    } else if (step.kind === 'effect') {
      if (!work.effects.some((e) => e.id === step.target))
        throw new Error('연출의 연결을 확인해 주세요.');
    } else {
      const presentation = { ...next.presentation };
      if (step.kind === 'music') {
        if (step.value && !/^https:\/\//.test(step.value))
          throw new Error('음악에는 HTTPS 주소를 입력해 주세요.');
        presentation.music = step.value || null;
      } else {
        const asset = work.media.assets?.find((a) => a.id === step.value);
        if (!asset) throw new Error('등록된 이미지를 선택해 주세요.');
        presentation.background = asset.name;
      }
      next.presentation = presentation;
    }
  }
  return next;
}
export function executeAction(
  room: Room,
  actionId: string,
  effectOrigin?: { effectId: string; source: EffectSource },
) {
  if (
    effectOrigin &&
    (!canCompleteEffect(room, effectOrigin.effectId, effectOrigin.source) ||
      !room.work.effects.find((e) => e.id === effectOrigin.effectId)?.actionIds?.includes(actionId))
  )
    throw new Error('이 연출에서 실행할 수 없는 규칙이거나 이전 장면입니다.');
  const action = room.work.actions?.find((a) => a.id === actionId);
  if (!action || action.trigger !== 'button') throw new Error('실행할 행동을 찾을 수 없습니다.');
  const next = clone(room),
    before = clone(next.current);
  next.current.runtime = applyAction(next.work, next.current.runtime, action);
  const body = [
    action.name,
    ...action.steps.filter((s) => s.kind === 'effect').map((s) => `{{effect:${s.target}}}`),
  ].join('\n');
  next.timeline.push({
    id: id(),
    kind: 'action',
    ...(effectOrigin ? { effectOrigin: clone(effectOrigin) } : {}),
    body,
    before,
    after: clone(next.current),
    changes: [action.name],
    createdAt: Date.now(),
  });
  return next;
}
