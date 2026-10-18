import { conditionsMet } from './conditions';
export { effectiveStatus, conditionMet, conditionsMet } from './conditions';
import { displayRuleProblem } from './displayRules';
import { effectiveSystemPrompt } from './systemPrompt';
import { z } from 'zod';
import type { Work, Runtime, Checkpoint, Room, Candidate, Turn, Usage } from './types';
import { id, clone, after } from './types';
import { defaultPersona, settings } from './defaults';
import { validMemories, repairMemoryActivity } from './memory';
import { runtimeRelations } from './relations';
import { cleanWork, relationsEnabled } from './workContent';
import { applyAction, actionAvailable, actionSchema, calculate } from './actions';

const changes = <T extends z.ZodType>(schema: T) => z.array(schema).max(100);
export const envelopeSchema = z
  .object({
    kind: z.enum(['turn', 'need_context']),
    requestedCharacterIds: z.array(z.string()).max(10),
    body: z.string().max(200000),
    choices: z.array(z.string().max(300)).max(3),
    delta: z
      .object({
        numeric: changes(z.object({ fieldId: z.string(), amount: z.number().finite() }).strict()),
        text: changes(z.object({ fieldId: z.string(), value: z.string().max(2000) }).strict()),
        choice: changes(z.object({ fieldId: z.string(), optionId: z.string() }).strict()),
        inventory: changes(z.object({ itemId: z.string(), owned: z.boolean() }).strict()),
        presence: changes(z.object({ characterId: z.string(), present: z.boolean() }).strict()),
        relationships: changes(
          z.union([
            z
              .object({
                relationId: z.string(),
                label: z.string().max(200),
                innerLabel: z.string().max(200).nullable().optional(),
              })
              .strict(),
            z
              .object({
                from: z.string(),
                to: z.string(),
                label: z.string().max(200),
                innerLabel: z.string().max(200).nullable().optional(),
              })
              .strict(),
          ]),
        ),
      })
      .strict(),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const emptyDelta = (): Envelope['delta'] => ({
  numeric: [],
  text: [],
  choice: [],
  inventory: [],
  presence: [],
  relationships: [],
});
function fail(s: string): never {
  throw new Error(s);
}
export type WorkIssue = {
  field: keyof Work;
  index?: number;
  message: string;
  related: (keyof Work)[];
};
export function validateWork(w: Work, publish = false, report?: (issue: WorkIssue) => void) {
  w = cleanWork(w);
  let location: Omit<WorkIssue, 'message'> = { field: 'title', related: [] };
  const at = (field: keyof Work, index?: number, related: (keyof Work)[] = []) => {
    location = { field, index, related };
  };
  const fail = (message: string) => {
    if (report) report({ ...location, message });
    else throw new Error(message);
  };
  if (publish && (!w.title.trim() || !w.prompt.trim()))
    fail('작품 제목과 프롬프트를 입력해 주세요.');
  if (publish && !effectiveSystemPrompt(w).trim()) fail('시스템 프롬프트를 입력해 주세요.');
  at('openings');
  if (!w.openings.length) fail('도입부가 하나 이상 필요합니다.');
  const ids = (list: { id: string }[], field: keyof Work, related: (keyof Work)[] = []) => {
    at(field, undefined, related);
    if (new Set(list.map((x) => x.id)).size !== list.length) fail('중복된 ID가 있습니다.');
  };
  for (const field of [
    'characters',
    'openings',
    'statuses',
    'items',
    'relations',
    'chapters',
    'effects',
  ] as const)
    ids(w[field], field);
  at('effects');
  if (publish && w.effects.some((e) => !e.name.trim() || !e.content.trim()))
    fail('연출의 이름과 내용을 입력해 주세요.');
  if (
    publish &&
    (new Set(w.effects.map((e) => e.name.trim())).size !== w.effects.length ||
      w.effects.some((e) => /[{}]/.test(e.name) || /^(user|img:.*|effect:.*)$/.test(e.name)))
  )
    fail('연출 이름은 서로 다르게 입력하고 user·img:·effect:·중괄호는 사용하지 마세요.');
  ids([...w.openings, ...w.chapters], 'chapters', ['openings']);
  at('characters');
  if (w.characters.some((c) => c.id === 'user')) fail('user는 플레이어 전용 ID입니다.');
  if (publish) {
    if (
      w.characters.some((c) => !c.name.trim() || !(c.role === 'main' ? c.prompt : c.trigger).trim())
    )
      fail('캐릭터 이름과 필수 프롬프트를 입력해 주세요.');
    if (new Set(w.characters.map((c) => c.name.trim())).size !== w.characters.length)
      fail('캐릭터 이름은 서로 달라야 합니다.');
    if (w.openings.some((o) => !o.name.trim() || !o.body.trim()))
      fail('도입부 제목과 내용을 입력해 주세요.');
  }
  for (const [index, d] of w.statuses.entries()) {
    at('statuses', index);
    if (d.levels?.some((level) => level.min > level.max))
      fail(`${d.name}: 레벨 구간의 범위를 확인해 주세요.`);
    if (
      d.type === 'number' &&
      (typeof d.initial !== 'number' ||
        !Number.isFinite(d.initial) ||
        d.min > d.max ||
        d.initial < d.min ||
        d.initial > d.max)
    )
      fail(`${d.name}: 숫자 범위와 초기값을 확인해 주세요.`);
    if (d.type === 'choice' && (!d.options.length || !d.options.includes(String(d.initial))))
      fail(`${d.name}: 초기값을 선택지 안에서 골라 주세요.`);
    if (d.type !== 'number' && typeof d.initial !== 'string')
      fail(`${d.name}: 문자 초기값을 입력해 주세요.`);
  }
  ids(w.statusPanels ?? [], 'statusPanels');
  for (const [index, panel] of (w.statusPanels ?? []).entries()) {
    at('statusPanels', index, ['statuses']);
    if (!panel.id.trim() || (publish && !panel.name.trim()))
      fail('상태창 이름과 ID를 확인해 주세요.');
    if (
      panel.statusIds &&
      (new Set(panel.statusIds).size !== panel.statusIds.length ||
        panel.statusIds.some((key) => !w.statuses.some((s) => s.id === key)))
    )
      fail(`${panel.name}: 표시할 상태값의 연결을 확인해 주세요.`);
  }
  const entityIds = new Set(['user', ...w.characters.map((c) => c.id)]);
  at('quality', undefined, ['characters']);
  for (const key of [w.quality.viewpointActorId, w.quality.viewpointTargetId])
    if (key && !entityIds.has(key)) fail('서술 시점의 인물 참조를 확인해 주세요.');
  for (const [index, r] of (relationsEnabled(w) ? w.relations : []).entries()) {
    at('relations', index, ['characters']);
    if (!entityIds.has(r.from) || !entityIds.has(r.to))
      fail('관계도의 인물 참조가 올바르지 않습니다.');
  }
  for (const [index, o] of w.openings.entries()) {
    at('openings', index, ['characters']);
    if (o.presence.some((p) => !w.characters.some((c) => c.id === p)))
      fail('도입부의 등장인물 참조가 올바르지 않습니다.');
  }
  for (const [index, c] of w.chapters.entries()) {
    at('chapters', index, ['openings', 'chapters']);
    if (![...w.openings, ...w.chapters].some((n) => n.id === c.from))
      fail(`${c.name}: 이전 노드를 선택해 주세요.`);
    const seen = new Set([c.id]);
    let current = c.from;
    while (w.chapters.some((n) => n.id === current)) {
      if (seen.has(current)) {
        fail('시나리오는 순환해서 연결할 수 없습니다.');
        break;
      }
      seen.add(current);
      current = w.chapters.find((n) => n.id === current)!.from;
    }
  }
  for (const [index, c] of [
    ...w.chapters,
    ...(relationsEnabled(w) && w.relationSplit && w.innerUnlock
      ? [{ name: '내면 해금', conditions: w.innerUnlock.conditions }]
      : []),
  ].entries()) {
    for (const condition of c.conditions) {
      at(
        index < w.chapters.length ? 'chapters' : 'innerUnlock',
        index < w.chapters.length ? index : undefined,
        ['number', 'choice'].includes(condition.kind) ? ['statuses'] : ['items'],
      );
      const d = w.statuses.find((s) => s.id === condition.ref);
      if (
        (condition.kind === 'number' && d?.type !== 'number') ||
        (condition.kind === 'choice' && d?.type !== 'choice') ||
        (['item', 'level', 'quantity'].includes(condition.kind) &&
          !w.items.some((i) => i.id === condition.ref))
      )
        fail(`${c.name}: 조건의 참조가 올바르지 않습니다.`);
      if (
        condition.kind === 'choice' &&
        (!d?.options.includes(String(condition.value)) || !['eq', 'ne'].includes(condition.op))
      )
        fail(`${c.name}: 객관식 조건의 선택지를 확인해 주세요.`);
      if (
        condition.kind === 'item' &&
        (typeof condition.value !== 'boolean' || !['eq', 'ne'].includes(condition.op))
      )
        fail(`${c.name}: 아이템 조건을 확인해 주세요.`);
      if (
        ['number', 'level', 'quantity'].includes(condition.kind) &&
        (typeof condition.value !== 'number' || !Number.isFinite(condition.value))
      )
        fail(`${c.name}: 숫자 조건을 확인해 주세요.`);
      if (condition.kind === 'level' && !w.items.find((i) => i.id === condition.ref)?.enhancement)
        fail(`${c.name}: 강화 가능한 아이템을 선택해 주세요.`);
    }
  }
  for (const [index, rule] of (w.displayRules ?? []).entries()) {
    at('displayRules', index);
    if (rule.enabled) {
      const error = w.risu?.rules.some((r) => r.id === rule.id && r.cbs)
        ? ''
        : displayRuleProblem(rule.pattern, rule.flags);
      if (error) fail(`${rule.name}: ${error}`);
    }
  }
  ids(w.actions ?? [], 'actions');
  for (const [index, action] of (w.actions ?? []).entries()) {
    at('actions', index);
    if (!actionSchema.safeParse(action).success) {
      fail('규칙의 설정 형식을 확인해 주세요.');
      continue;
    }
    if (!publish) continue;
    if (!action.name.trim() || !action.steps.length)
      fail('규칙 이름과 실행할 작업을 입력해 주세요.');
    const fields = Object.fromEntries(
      w.statuses.filter((s) => s.type === 'number').map((s) => [s.id, 1]),
    );
    for (const condition of action.conditions) {
      const target = ['item', 'quantity', 'level'].includes(condition.kind) ? w.items : w.statuses;
      if (!target.some((t) => t.id === condition.ref))
        fail(`${action.name}: 실행 조건의 연결을 확인해 주세요.`);
      const field = w.statuses.find((s) => s.id === condition.ref);
      if (condition.kind === 'number' && field?.type !== 'number')
        fail(`${action.name}: 숫자 상태 조건을 선택해 주세요.`);
      if (
        condition.kind === 'choice' &&
        (field?.type !== 'choice' || !field.options.includes(String(condition.value)))
      )
        fail(`${action.name}: 객관식 조건의 선택지를 확인해 주세요.`);
      if (
        condition.kind === 'item' &&
        (typeof condition.value !== 'boolean' || !['eq', 'ne'].includes(condition.op))
      )
        fail(`${action.name}: 소지 여부 조건을 확인해 주세요.`);
      if (
        ['number', 'quantity', 'level'].includes(condition.kind) &&
        typeof condition.value !== 'number'
      )
        fail(`${action.name}: 조건에 숫자를 입력해 주세요.`);
    }
    for (const step of action.steps) {
      const target =
        step.kind === 'effect'
          ? w.effects
          : ['gain', 'consume'].includes(step.kind)
            ? w.items
            : w.statuses;
      if (!['background', 'music'].includes(step.kind) && !target.some((t) => t.id === step.target))
        fail(`${action.name}: 작업 대상의 연결을 확인해 주세요.`);
      const field = w.statuses.find((s) => s.id === step.target);
      if (['add', 'set'].includes(step.kind) && field?.type !== 'number')
        fail(`${action.name}: 숫자 상태를 선택해 주세요.`);
      if (
        step.kind === 'text' &&
        (!field ||
          field.type === 'number' ||
          (field.type === 'choice' && !field.options.includes(step.value)))
      )
        fail(`${action.name}: 문자·객관식 상태의 값을 확인해 주세요.`);
      if (step.kind === 'background' && !w.media.assets?.some((a) => a.id === step.value))
        fail(`${action.name}: 등록된 이미지를 선택해 주세요.`);
      if (step.kind === 'music' && step.value && !/^https:\/\//.test(step.value))
        fail(`${action.name}: 음악에는 HTTPS 주소를 입력해 주세요.`);
      if (['add', 'set', 'gain', 'consume'].includes(step.kind))
        try {
          calculate(step.value, fields, () => 0.5);
        } catch (error) {
          fail(`${action.name}: ${(error as Error).message}`);
        }
    }
  }
  at('media');
  const assets = w.media.assets ?? [];
  if (
    [...new Map(assets.map((a) => [a.url, a.size])).values()].reduce((n, size) => n + size, 0) >
    2 * 1024 ** 3
  )
    fail('내장 이미지 합계는 2GB 이하여야 합니다.');
  const names = new Set<string>();
  for (const asset of assets) {
    if (
      !asset.name.trim() ||
      /[{}:/]/.test(asset.name) ||
      asset.name === 'user' ||
      names.has(asset.name) ||
      w.effects.some((e) => e.name === asset.name)
    )
      fail('이미지 이름은 예약어·연출 이름과 겹치지 않게 입력해 주세요.');
    names.add(asset.name);
  }
  for (const [index, item] of w.items.entries()) {
    at('items', index, ['statuses']);
    if (item.enhancement) {
      const e = item.enhancement;
      if (
        ![e.currency, e.target].every((ref) =>
          w.statuses.some((s) => s.id === ref && s.type === 'number'),
        )
      )
        fail(`${item.name}: 강화에 사용할 숫자 상태를 선택해 주세요.`);
      if (
        e.currency === e.target ||
        e.costBase < 0 ||
        e.costStep < 0 ||
        e.gainBase < 0 ||
        e.gainStep < 0 ||
        !e.probabilities.length ||
        e.probabilities.some((p) => p < 0 || p > 1) ||
        e.keepWeight < 0 ||
        e.resetWeight < 0 ||
        e.keepWeight + e.resetWeight <= 0
      )
        fail(`${item.name}: 강화 수치를 확인해 주세요.`);
    }
  }
}
export function workIssues(work: Work): WorkIssue[] {
  const issues: WorkIssue[] = [];
  validateWork(work, false, (issue) => issues.push(issue));
  return issues;
}
export function initialState(w: Work, openingId: string): Runtime {
  const opening = w.openings.find((o) => o.id === openingId) ?? w.openings[0];
  return {
    status: Object.fromEntries(w.statuses.map((s) => [s.id, s.initial])),
    inventory: Object.fromEntries(
      w.items.map((i) => [
        i.id,
        {
          owned: i.owned,
          level: 0,
          bonus: 0,
          ...(i.quantity !== undefined ? { quantity: i.owned ? i.quantity : 0 } : {}),
        },
      ]),
    ),
    presence: [...opening.presence],
    relationships: Object.fromEntries(w.relations.map((r) => [r.id, r.label])),
    innerRelationships: Object.fromEntries(w.relations.map((r) => [r.id, r.innerLabel ?? ''])),
    nodeId: opening.id,
    visited: [opening.id],
    turnCount: 0,
    ending: null,
  };
}
export function createRoom(
  work: Work,
  modelId = 'demo',
  persona = work.personas[0] ?? defaultPersona(),
  openingId = work.openings[0].id,
): Room {
  work = cleanWork(work);
  validateWork(work, true);
  return createPreviewRoom(work, modelId, persona, openingId);
}
// Creator previews accept unfinished drafts. Starting a chat turn still requires
// createRoom's publish validation.
export function createPreviewRoom(
  work: Work,
  modelId = 'demo',
  persona = work.personas[0] ?? defaultPersona(),
  openingId = work.openings[0].id,
): Room {
  work = cleanWork(work);
  const initial: Checkpoint = {
    runtime: initialState(work, openingId),
    context: {
      persona: clone(persona),
      notes: [],
      memories: [],
      settings: {
        ...settings(modelId),
        uiType: work.defaultUi ?? 'novel',
        quality: clone(work.quality),
      },
    },
  };
  return {
    id: id(),
    name: work.title,
    work: clone(work),
    openingId,
    initial: clone(initial),
    current: clone(initial),
    timeline: [],
    revision: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pendingInput: '',
    folderId: null,
    pinned: false,
  };
}
export function applyDelta(work: Work, before: Runtime, delta: Envelope['delta']) {
  const next = clone(before);
  const log: string[] = [];
  const unique = (keys: string[]) => {
    if (new Set(keys).size !== keys.length) fail('중복 상태 변경을 적용할 수 없습니다.');
  };
  unique([...delta.numeric, ...delta.text, ...delta.choice].map((x) => x.fieldId));
  unique(delta.inventory.map((x) => x.itemId));
  unique(delta.presence.map((x) => x.characterId));
  for (const d of delta.numeric) {
    const def = work.statuses.find((s) => s.id === d.fieldId);
    if (def?.type !== 'number') fail('존재하지 않는 숫자 상태입니다.');
    const prev = Number(next.status[d.fieldId]);
    next.status[d.fieldId] = Math.max(def.min, Math.min(def.max, prev + d.amount));
    if (prev !== next.status[d.fieldId])
      log.push(`${def.name} ${prev} → ${next.status[d.fieldId]}`);
  }
  for (const d of delta.text) {
    const def = work.statuses.find((s) => s.id === d.fieldId);
    if (def?.type !== 'text') fail('문자 상태 형식이 맞지 않습니다.');
    next.status[d.fieldId] = d.value;
    log.push(`${def.name}: ${d.value}`);
  }
  for (const d of delta.choice) {
    const def = work.statuses.find((s) => s.id === d.fieldId);
    if (def?.type !== 'choice' || !def.options.includes(d.optionId))
      fail('등록되지 않은 선택지입니다.');
    next.status[d.fieldId] = d.optionId;
    log.push(`${def.name}: ${d.optionId}`);
  }
  for (const d of delta.inventory) {
    const item = work.items.find((i) => i.id === d.itemId);
    if (!item) fail('등록되지 않은 아이템입니다.');
    if (next.inventory[d.itemId].owned !== d.owned)
      log.push(`${item.name} ${d.owned ? '획득' : '유실'}`);
    next.inventory[d.itemId].owned = d.owned;
    if (next.inventory[d.itemId].quantity !== undefined)
      next.inventory[d.itemId].quantity = d.owned
        ? Math.max(1, next.inventory[d.itemId].quantity!)
        : 0;
  }
  for (const d of delta.presence) {
    const c = work.characters.find((c) => c.id === d.characterId);
    if (!c) fail('등록되지 않은 등장인물입니다.');
    const present = next.presence.includes(d.characterId);
    if (present !== d.present) log.push(`${c.name} ${d.present ? '등장' : '퇴장'}`);
    next.presence = d.present
      ? Array.from(new Set([...next.presence, d.characterId]))
      : next.presence.filter((x) => x !== d.characterId);
  }
  const actors = new Set(['user', ...work.characters.map((c) => c.id)]);
  const changedRelations = new Set<string>();
  const changedPairs = new Set<string>();
  for (const d of delta.relationships) {
    const relations = runtimeRelations(work, next);
    let r =
      'relationId' in d
        ? relations.find((relation) => relation.id === d.relationId)
        : relations.find((relation) => relation.from === d.from && relation.to === d.to);
    if ('relationId' in d && !r) fail('등록되지 않은 관계입니다.');
    if ('from' in d) {
      if (!actors.has(d.from) || !actors.has(d.to)) fail('등록되지 않은 관계 인물입니다.');
      if (d.from === d.to) fail('자기 자신과의 관계는 만들 수 없습니다.');
      if (!r) {
        r = { id: id(), from: d.from, to: d.to, label: d.label };
        next.generatedRelations = [...(next.generatedRelations ?? []), r];
      }
    }
    if (!r) fail('등록되지 않은 관계입니다.');
    const pair = JSON.stringify([r.from, r.to]);
    if (changedRelations.has(r.id) || changedPairs.has(pair))
      fail('중복 관계 변경을 적용할 수 없습니다.');
    changedRelations.add(r.id);
    changedPairs.add(pair);
    next.relationships[r.id] = d.label;
    if (d.innerLabel != null) {
      next.innerRelationships = { ...next.innerRelationships, [r.id]: d.innerLabel };
    }
    log.push(`관계 변화: ${d.label}`);
  }
  next.turnCount += 1;
  return { state: next, log };
}
export function availableChapters(work: Work, state: Runtime) {
  if (state.ending) return [];
  return work.chapters.filter(
    (c) => c.from === state.nodeId && conditionsMet(work, state, c.conditions, c.mode),
  );
}
export function addResponse(
  room: Room,
  input: string,
  raw: unknown,
  usage: Usage,
  options: { reroll?: boolean; dice?: number; risuState?: Record<string, string> } = {},
): Room {
  if (room.current.runtime.ending && !room.current.runtime.ending.allowAfterstory)
    fail('이 이야기는 끝났습니다. 이전 대화에서 분기할 수 있습니다.');
  const result = envelopeSchema.parse(raw);
  if (result.kind !== 'turn' || result.requestedCharacterIds.length || !result.body.trim())
    fail('완성된 대화 응답이 아닙니다.');
  const next = options.reroll ? rewindResponseEffects(room) : clone(room);
  const last = next.timeline.at(-1);
  if (options.reroll && last?.kind !== 'turn') fail('가장 최근 대화에서만 리롤할 수 있습니다.');
  const before = options.reroll ? clone((last as Turn).before) : clone(next.current);
  const { state, log } = applyDelta(next.work, before.runtime, result.delta);
  if (options.risuState) state.risu = clone(options.risuState);
  for (const action of next.work.actions ?? []) {
    if (action.trigger === 'after-response' && actionAvailable(next.work, state, action)) {
      try {
        Object.assign(state, applyAction(next.work, state, action));
        log.push(action.name);
        for (const step of action.steps)
          if (step.kind === 'effect') result.body += `\n{{effect:${step.target}}}`;
      } catch (error) {
        log.push(`${action.name} 실행 보류: ${(error as Error).message}`);
      }
    }
  }
  const context = clone(next.current.context);
  context.memories = repairMemoryActivity(
    validMemories(next, context.memories, next.timeline.slice(0, options.reroll ? -1 : undefined)),
  );
  const candidate: Candidate = {
    id: id(),
    body: result.body,
    choices: result.choices, // Visibility is a UI preference, never a data filter.
    checkpoint: { runtime: state, context },
    changes: log,
    usage,
    createdAt: Date.now(),
  };
  if (options.reroll && last?.kind === 'turn') {
    last.candidates.push(candidate);
    last.selectedId = candidate.id;
  } else
    next.timeline.push({
      id: id(),
      kind: 'turn',
      input,
      before,
      candidates: [candidate],
      selectedId: candidate.id,
      createdAt: Date.now(),
      dice: options.dice,
    });
  next.current = clone(candidate.checkpoint);
  next.pendingInput = '';
  return next;
}
export function switchCandidate(room: Room, eventId: string, candidateId: string): Room {
  const next = rewindResponseEffects(room);
  const last = next.timeline.at(-1);
  if (last?.kind !== 'turn' || last.id !== eventId)
    fail('응답 후보는 진행 중인 마지막 대화에서만 바꿀 수 있습니다.');
  const c = last.candidates.find((c) => c.id === candidateId);
  if (!c) fail('응답 후보를 찾을 수 없습니다.');
  last.selectedId = c.id;
  next.current = clone(c.checkpoint);
  preserveUi(room, next);
  return next;
}
export function editTurnText(
  room: Room,
  eventId: string,
  kind: 'user' | 'assistant',
  body: string,
  candidateId?: string,
): Room {
  if (!body.trim()) fail('대사를 입력해 주세요.');
  const next = clone(room);
  const event = next.timeline.find((t) => t.id === eventId);
  if (!event || event.kind !== 'turn') fail('수정할 대화를 찾을 수 없습니다.');
  const affected = new Set<string>();
  if (kind === 'user') {
    event.input = body;
    for (const c of event.candidates) affected.add(`${event.id}:${c.id}`);
  } else {
    const candidate = event.candidates.find((c) => c.id === (candidateId ?? event.selectedId));
    if (!candidate) fail('수정할 응답을 찾을 수 없습니다.');
    candidate.body = body;
    affected.add(`${event.id}:${candidate.id}`);
  }
  const invalidate = (checkpoint: Checkpoint) => {
    checkpoint.context.memories = repairMemoryActivity(
      checkpoint.context.memories
        .filter((m) => m.manual || !m.sources.some((s) => affected.has(s)))
        .map((m) => (m.manual ? { ...m, sources: m.sources.filter((s) => !affected.has(s)) } : m)),
    );
  };
  invalidate(next.initial);
  invalidate(next.current);
  for (const e of next.timeline) {
    invalidate(e.before);
    if (e.kind === 'turn') e.candidates.forEach((c) => invalidate(c.checkpoint));
    else invalidate(e.after);
  }
  return next;
}

export function branchRoom(room: Room, eventId: string, candidateId?: string): Room {
  const index = room.timeline.findIndex((t) => t.id === eventId);
  if (index < 0) fail('분기 지점을 찾을 수 없습니다.');
  const next = clone(room);
  next.timeline = next.timeline.slice(0, index + 1);
  const event = next.timeline[index];
  if (event.kind === 'turn' && candidateId) {
    if (!event.candidates.some((c) => c.id === candidateId)) fail('분기 응답을 찾을 수 없습니다.');
    event.selectedId = candidateId;
  }
  next.id = id();
  next.name = `${room.name} · 분기`;
  next.current = clone(after(event));
  preserveUi(room, next);
  next.revision = 0;
  next.pendingInput = '';
  next.createdAt = next.updatedAt = Date.now();
  next.pinned = false;
  next.branchFrom = {
    roomId: room.id,
    eventId,
    candidateId: event.kind === 'turn' ? event.selectedId : undefined,
  };
  return next;
}
// Effects tied to the latest response roll back with that response. Chapter and
// inventory progress still requires an explicit branch instead of silent loss.
export function editableLastTurn(room: Room): Turn | undefined {
  const reversedIndex = [...room.timeline].reverse().findIndex((event) => event.kind === 'turn');
  const index = reversedIndex < 0 ? -1 : room.timeline.length - 1 - reversedIndex;
  if (index < 0) return;
  const turn = room.timeline[index] as Turn;
  return room.timeline
    .slice(index + 1)
    .every(
      (event) =>
        (event.kind === 'action' && event.risuEvent) ||
        (event.kind === 'effect' &&
          event.effectResult?.source.eventId === turn.id &&
          event.effectResult.source.candidateId === turn.selectedId),
    )
    ? turn
    : undefined;
}
export function rewindResponseEffects(room: Room): Room {
  const next = clone(room),
    turn = editableLastTurn(next);
  if (!turn) return next;
  const index = next.timeline.findIndex((event) => event.id === turn.id);
  next.timeline = next.timeline.slice(0, index + 1);
  next.current = { runtime: clone(after(turn).runtime), context: clone(room.current.context) };
  if (room.work.risu && room.current.runtime.risu)
    next.current.runtime.risu = clone(room.current.runtime.risu);
  return next;
}
function preserveUi(room: Room, next: Room) {
  next.current.context.settings.uiType = room.current.context.settings.uiType;
  next.current.context.settings.uiSource = room.current.context.settings.uiSource;
}
export function deleteLast(room: Room, keepInput: boolean): Room {
  const next = rewindResponseEffects(room);
  const last = next.timeline.at(-1);
  if (last?.kind !== 'turn') fail('마지막 대화만 삭제할 수 있습니다.');
  next.timeline.pop();
  next.current = clone(last.before);
  preserveUi(room, next);
  next.pendingInput = keepInput ? last.input : '';
  return next;
}
export function enterChapter(room: Room, chapterId: string): Room {
  const chapter = availableChapters(room.work, room.current.runtime).find(
    (c) => c.id === chapterId,
  );
  if (!chapter) fail('지금은 이동할 수 없는 챕터입니다.');
  const next = clone(room);
  const before = clone(next.current);
  next.current.runtime.nodeId = chapter.id;
  if (chapter.bgm !== undefined && next.current.runtime.presentation)
    delete next.current.runtime.presentation.music;
  next.current.runtime.visited.push(chapter.id);
  if (chapter.type === 'ending')
    next.current.runtime.ending = { id: chapter.id, allowAfterstory: chapter.afterstory };
  next.timeline.push({
    id: id(),
    kind: 'chapter',
    body: chapter.prologue,
    before,
    after: clone(next.current),
    changes: [`${chapter.name} 이동`],
    createdAt: Date.now(),
  });
  return next;
}
export function enhance(room: Room, itemId: string, random = Math.random()): Room {
  const next = clone(room);
  const item = next.work.items.find((i) => i.id === itemId);
  const cfg = item?.enhancement;
  const held = next.current.runtime.inventory[itemId];
  if (!item || !cfg || !held?.owned) fail('강화할 수 없는 아이템입니다.');
  if (held.level >= cfg.probabilities.length) fail('최대 강화 단계입니다.');
  if (random < 0 || random >= 1) fail('잘못된 확률 값입니다.');
  const cost = cfg.costBase + cfg.costStep * held.level;
  const balance = Number(next.current.runtime.status[cfg.currency]);
  if (balance < cost) fail('강화 재화가 부족합니다.');
  const before = clone(next.current);
  const success = cfg.probabilities[held.level];
  next.current.runtime.status[cfg.currency] = balance - cost;
  let outcome: string;
  if (random < success) {
    held.bonus += cfg.gainBase + cfg.gainStep * held.level;
    held.level += 1;
    outcome = `강화 성공 · +${held.level}`;
  } else if (
    random <
    success + ((1 - success) * cfg.keepWeight) / (cfg.keepWeight + cfg.resetWeight)
  )
    outcome = '강화 실패 · 단계 유지';
  else {
    held.level = 0;
    held.bonus = 0;
    outcome = '강화 실패 · 단계 초기화';
  }
  const msg = `${item.name} ${outcome}`;
  next.timeline.push({
    id: id(),
    kind: 'enhance',
    body: msg,
    before,
    after: clone(next.current),
    changes: [msg, `재화 ${cost} 소모`],
    createdAt: Date.now(),
  });
  return next;
}
