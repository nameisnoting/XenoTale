import type { Turn } from './types';
import { describe, it, expect } from 'vitest';
import { emptyWork, exampleWork } from './defaults';
import {
  createRoom,
  createPreviewRoom,
  addResponse,
  editTurnText,
  emptyDelta,
  switchCandidate,
  branchRoom,
  deleteLast,
  enhance,
  availableChapters,
  enterChapter,
  effectiveStatus,
  validateWork,
} from './engine';
import { clone, selected } from './types';
const response = (amount = 2) => ({
  kind: 'turn',
  requestedCharacterIds: [],
  body: '@아리아: 안녕하세요.',
  choices: ['살펴본다'],
  delta: { ...emptyDelta(), numeric: [{ fieldId: 'affinity', amount }] },
});
const turn = (room: ReturnType<typeof createRoom>, amount = 2) =>
  addResponse(room, '대화', response(amount), { model: 'demo' });

for (const afterstory of [true, false]) {
  it(`treats endings as terminal nodes and ${afterstory ? 'allows' : 'blocks'} afterstory turns`, () => {
    const work = exampleWork();
    work.chapters = [{ ...work.chapters[1], from: work.openings[0].id, afterstory }];
    const ended = enterChapter(createRoom(work), work.chapters[0].id);
    expect(availableChapters(work, ended.current.runtime)).toEqual([]);
    if (afterstory) {
      const next = turn(ended);
      expect(next.current.runtime.ending).toEqual(ended.current.runtime.ending);
      expect(next.current.runtime.turnCount).toBe(1);
      expect(availableChapters(work, next.current.runtime)).toEqual([]);
    } else {
      expect(() => turn(ended)).toThrow('끝났습니다');
      expect(ended.timeline).toHaveLength(1);
      expect(ended.current.runtime.turnCount).toBe(0);
    }
  });
}

it('renders unfinished drafts without weakening saved conversation validation', () => {
  const work = emptyWork();
  work.openings.push({
    ...clone(work.openings[0]),
    id: 'other-opening',
    body: '*미완성 도입부*',
    presence: [],
  });
  expect(() => createRoom(work)).toThrow();
  const preview = createPreviewRoom(work, 'demo', undefined, 'other-opening');
  expect(preview.openingId).toBe('other-opening');
  expect(preview.current.runtime.nodeId).toBe('other-opening');
  expect(preview.current.runtime.presence).toEqual([]);
  expect(preview.timeline).toEqual([]);
  preview.work.openings[1].body = '테스트 변경';
  expect(work.openings[1].body).toBe('*미완성 도입부*');
});
describe('conversation state invariants', () => {
  it('clamps numeric deltas atomically and restores the exact pre-turn state on deletion', () => {
    const r = createRoom(exampleWork());
    const next = turn(r, 999);
    expect(next.current.runtime.status.affinity).toBe(100);
    expect(r.current.runtime.status.affinity).toBe(10);
    expect(deleteLast(next, true).current).toEqual(r.current);
    expect(deleteLast(next, true).pendingInput).toBe('대화');
  });
  it('rejects the whole response on unknown or duplicated fields without changing the room', () => {
    const r = createRoom(exampleWork());
    const snapshot = clone(r);
    const invalid = response();
    invalid.delta.numeric.push({ fieldId: 'missing', amount: 20 });
    expect(() => addResponse(r, 'hi', invalid, { model: 'demo' })).toThrow();
    expect(r).toEqual(snapshot);
    const duplicate = response();
    duplicate.delta.numeric.push({ fieldId: 'affinity', amount: 2 });
    expect(() => addResponse(r, 'hi', duplicate, { model: 'demo' })).toThrow();
  });
  it('rerolls from before, retains candidates, and restores the selected candidate state', () => {
    const r = turn(createRoom(exampleWork()), 2);
    const last = r.timeline[0];
    if (last.kind !== 'turn') throw Error();
    const original = last.selectedId;
    const rr = addResponse(r, '대화', response(5), { model: 'demo' }, { reroll: true });
    expect(rr.current.runtime.status.affinity).toBe(15);
    const restored = switchCandidate(rr, last.id, original);
    expect(restored.current).toEqual(r.current);
    expect(restored.timeline[0].kind === 'turn' && restored.timeline[0].candidates.length).toBe(2);
    expect(() => switchCandidate(turn(rr), last.id, original)).toThrow();
  });
  it('branches with inventory, enhancement, relationships, chapter, memories and settings as of the historical candidate', () => {
    let r = createRoom(exampleWork());
    r.current.context.memories.push({
      id: 'm1',
      body: '이전 기억',
      kind: 'short',
      sources: [],
      createdAt: 1,
      manual: true,
    });
    r.current.context.settings.creativity = 1;
    r = turn(r, 6);
    r = enterChapter(r, 'archive');
    r = enhance(r, 'sword', 0);
    const env = response();
    env.delta.inventory = [{ itemId: 'key', owned: true }];
    env.delta.relationships = [{ relationId: 'aria-user', label: '신뢰' }];
    r = addResponse(r, '열쇠', env, { model: 'demo' });
    const point = r.timeline.at(-1)!;
    const checkpoint = clone(r.current);
    r.current.context.memories.push({
      id: 'future',
      body: '미래 기억',
      kind: 'long',
      sources: [],
      createdAt: 2,
      manual: true,
    });
    r.current.context.settings.creativity = 4;
    r = enhance(r, 'sword', 0);
    r = enterChapter(r, 'end');
    r = turn(r);
    const fork = branchRoom(r, point.id);
    expect(fork.id).not.toBe(r.id);
    expect(fork.current).toEqual(checkpoint);
    expect(fork.current.runtime.inventory.sword.level).toBe(1);
    expect(fork.current.runtime.status.gold).toBe(90);
    expect(fork.current.runtime.inventory.key.owned).toBe(true);
    expect(fork.current.runtime.nodeId).toBe('archive');
    expect(fork.current.context.memories.some((m) => m.id === 'future')).toBe(false);
    expect(fork.timeline.length).toBe(4);
  });
  it('branches an older nonselected variant and leaves the original history intact', () => {
    let r = turn(createRoom(exampleWork()));
    const first = r.timeline[0];
    if (first.kind !== 'turn') throw Error();
    r = addResponse(r, '대화', response(9), { model: 'demo' }, { reroll: true });
    r = turn(r);
    const original = clone(r);
    const fork = branchRoom(r, first.id, first.selectedId);
    expect(fork.current.runtime.status.affinity).toBe(12);
    expect(r).toEqual(original);
  });
  it('uses effective enhanced status for chapter conditions and never double-counts bonuses', () => {
    let r = createRoom(exampleWork());
    r.work.chapters[0].conditions = [
      { id: 'test', kind: 'number', ref: 'power', op: 'gte', value: 15 },
    ];
    r = enhance(r, 'sword', 0);
    expect(r.current.runtime.status.power).toBe(5);
    expect(effectiveStatus(r.work, r.current.runtime, 'power')).toBe(15);
    expect(availableChapters(r.work, r.current.runtime)[0].id).toBe('archive');
  });
  it('validates graph cycles and rejects enhancement when funds are insufficient', () => {
    const w = exampleWork();
    w.chapters[0].from = 'end';
    expect(() => validateWork(w)).toThrow();
    const r = createRoom(exampleWork());
    r.current.runtime.status.gold = 0;
    const original = clone(r);
    expect(() => enhance(r, 'sword', 0)).toThrow();
    expect(r).toEqual(original);
  });
});

it('preserves hidden choices through rerolls and restoring an earlier candidate', () => {
  let room = createRoom(exampleWork());
  room.current.context.settings.choices = false;
  const result = {
    kind: 'turn',
    requestedCharacterIds: [],
    body: '첫 대사',
    choices: ['첫 선택'],
    delta: emptyDelta(),
  };
  room = addResponse(room, '안녕', result, { model: 'demo' });
  const event = room.timeline[0];
  if (event.kind !== 'turn') throw new Error();
  const firstId = event.selectedId;
  room = addResponse(
    room,
    '안녕',
    { ...result, choices: ['리롤 선택'] },
    { model: 'demo' },
    { reroll: true },
  );
  expect(selected(room.timeline[0] as Turn).choices).toEqual(['리롤 선택']);
  room = switchCandidate(room, event.id, firstId);
  expect(selected(room.timeline[0] as Turn).choices).toEqual(['첫 선택']);
});

it('edits text in place while preserving all runtime checkpoints and future turns', () => {
  let room = createRoom(exampleWork());
  room = addResponse(room, '원래 입력', response(), { model: 'demo' });
  const event = room.timeline[0] as Turn;
  room = addResponse(room, '원래 입력', response(3), { model: 'demo' }, { reroll: true });
  const chosen = (room.timeline[0] as Turn).selectedId;
  room = addResponse(room, '나중 입력', response(), { model: 'demo' });
  const states = (value: typeof room) => [
    value.current.runtime,
    value.initial.runtime,
    ...value.timeline.flatMap((t) =>
      t.kind === 'turn'
        ? [t.before.runtime, ...t.candidates.map((c) => c.checkpoint.runtime)]
        : [t.before.runtime, t.after.runtime],
    ),
  ];
  const before = states(room);
  const source = `${event.id}:${chosen}`;
  room.current.context.memories = [
    { id: 'm', kind: 'short', body: '오래된 요약', sources: [source], manual: false, createdAt: 0 },
    {
      id: 'manual',
      kind: 'short',
      body: '직접 기억',
      sources: [source],
      manual: true,
      createdAt: 0,
    },
  ];
  const edited = editTurnText(room, event.id, 'assistant', '오타를 고친 응답', chosen);
  expect(edited.id).toBe(room.id);
  expect(edited.timeline).toHaveLength(2);
  expect(states(edited)).toEqual(before);
  expect(selected(edited.timeline[0] as Turn).body).toBe('오타를 고친 응답');
  expect((edited.timeline[0] as Turn).candidates.map((c) => c.id)).toEqual(
    (room.timeline[0] as Turn).candidates.map((c) => c.id),
  );
  expect(edited.current.context.memories).toEqual([
    { id: 'manual', kind: 'short', body: '직접 기억', sources: [], manual: true, createdAt: 0 },
  ]);
  const input = editTurnText(edited, event.id, 'user', '오타를 고친 입력');
  expect((input.timeline[0] as Turn).input).toBe('오타를 고친 입력');
  expect(states(input)).toEqual(before);
  expect(() => editTurnText(room, 'missing', 'user', '텍스트')).toThrow();
});
