import type { Work, Runtime, Condition } from './types';

export function effectiveStatus(work: Work, state: Runtime, fieldId: string) {
  const base = state.status[fieldId];
  if (typeof base !== 'number') return base;
  const bonus = work.items.reduce(
    (sum, item) =>
      sum +
      (item.enhancement?.target === fieldId && state.inventory[item.id]?.owned
        ? state.inventory[item.id].bonus
        : 0),
    0,
  );
  const def = work.statuses.find((s) => s.id === fieldId);
  if (!def) return undefined;
  return Math.max(def.min, Math.min(def.max, base + bonus));
}
export function conditionMet(work: Work, state: Runtime, condition: Condition) {
  const v =
    condition.kind === 'item'
      ? state.inventory[condition.ref]?.owned
      : condition.kind === 'quantity'
        ? (state.inventory[condition.ref]?.quantity ??
          (state.inventory[condition.ref]?.owned ? 1 : 0))
        : condition.kind === 'level'
          ? state.inventory[condition.ref]?.owned
            ? state.inventory[condition.ref]?.level
            : -1
          : effectiveStatus(work, state, condition.ref);
  if (v === undefined) return false;
  if (condition.op === 'eq') return v === condition.value;
  if (condition.op === 'ne') return v !== condition.value;
  return condition.op === 'gte'
    ? Number(v) >= Number(condition.value)
    : Number(v) <= Number(condition.value);
}
export function conditionsMet(
  work: Work,
  state: Runtime,
  conditions: Condition[],
  mode: 'all' | 'any',
) {
  return (
    !conditions.length ||
    (mode === 'all'
      ? conditions.every((c) => conditionMet(work, state, c))
      : conditions.some((c) => conditionMet(work, state, c)))
  );
}
