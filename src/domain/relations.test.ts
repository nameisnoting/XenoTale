import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultProfile, exampleWork } from './defaults';
import {
  addResponse,
  applyDelta,
  branchRoom,
  createRoom,
  deleteLast,
  emptyDelta,
  envelopeSchema,
  switchCandidate,
  type Envelope,
} from './engine';
import { clone, type Model, type Room } from './types';
import { relationGraphWork, runtimeRelations } from './relations';
import { buildMessages, generate } from '../engine/openrouter';
import { readImport } from '../persistence/files';
import responseSchema from '../engine/turn-envelope.schema.json';

const response = (relationships: Envelope['delta']['relationships']): Envelope => ({
  kind: 'turn',
  requestedCharacterIds: [],
  body: '새로운 인연',
  choices: [],
  delta: { ...emptyDelta(), relationships },
});
const reply = (room: Room, relationships: Envelope['delta']['relationships']) =>
  addResponse(room, '함께 하자', response(relationships), { model: 'mock' });
const creation = () => ({ from: 'user', to: 'sera', label: '동료', innerLabel: '신뢰' });
const roomFile = (room: Room) =>
  new File([JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room })], 'room.json');
afterEach(() => vi.unstubAllGlobals());

it('creates checkpoint-local directed edges without changing authored work or other rooms', () => {
  const work = exampleWork();
  const original = clone(work);
  const room = createRoom(work);
  const other = createRoom(work);
  const next = reply(room, [creation()]);
  const generated = next.current.runtime.generatedRelations!;
  expect(generated).toHaveLength(1);
  expect(generated[0]).toMatchObject({ from: 'user', to: 'sera', label: '동료' });
  expect(generated[0].id).toMatch(/^[0-9a-f-]{36}$/);
  expect(next.current.runtime.relationships[generated[0].id]).toBe('동료');
  expect(next.current.runtime.innerRelationships?.[generated[0].id]).toBe('신뢰');
  expect(next.work).toEqual(original);
  expect(work).toEqual(original);
  expect(room.current.runtime.generatedRelations).toBeUndefined();
  expect(next.initial.runtime.generatedRelations).toBeUndefined();
  expect(other.current.runtime.generatedRelations).toBeUndefined();
  expect(runtimeRelations(next.work, next.current.runtime)).toHaveLength(work.relations.length + 1);
});

it('updates authored and generated edges by endpoints or ID, without adding duplicates', () => {
  let room = reply(createRoom(exampleWork()), [
    { from: 'aria', to: 'user', label: '友人', innerLabel: '우정' },
    creation(),
  ]);
  const key = room.current.runtime.generatedRelations![0].id;
  expect(room.current.runtime.relationships['aria-user']).toBe('友人');
  room = reply(room, [{ from: 'user', to: 'sera', label: '절친', innerLabel: null }]);
  expect(room.current.runtime.generatedRelations).toHaveLength(1);
  expect(room.current.runtime.generatedRelations![0].id).toBe(key);
  expect(room.current.runtime.innerRelationships?.[key]).toBe('신뢰');
  room = reply(room, [{ relationId: key, label: '라이벌', innerLabel: '존중' }]);
  expect(runtimeRelations(room.work, room.current.runtime).find((r) => r.id === key)).toMatchObject(
    { label: '라이벌', innerLabel: '존중' },
  );
  expect(room.work.relations[0].label).toBe('낯선 방문객');
});

it('keeps reverse edges independent and exposes newly linked actors on a curated map', () => {
  const work = exampleWork();
  work.relationNodeIds = ['aria', 'user'];
  work.relationPositions = { aria: { x: 80, y: 90 }, user: { x: 400, y: 500 } };
  const room = reply(createRoom(work), [creation(), { from: 'sera', to: 'user', label: '방문객' }]);
  const view = relationGraphWork(room.work, room.current.runtime);
  expect(view.relations.filter((r) => r.from === 'sera' || r.to === 'sera')).toHaveLength(2);
  expect(view.relationNodeIds).toEqual(['aria', 'user', 'sera']);
  expect(view.relationPositions).toEqual(work.relationPositions);
  expect(room.work.relationNodeIds).toEqual(['aria', 'user']);
});

const invalidChanges = [
  [{ from: 'missing', to: 'user', label: '친구' }],
  [{ from: '아리아', to: 'user', label: '친구' }],
  [{ from: 'aria', to: 'aria', label: '친구' }],
  [{ relationId: 'invented', label: '친구' }],
  [creation(), creation()],
  [
    { relationId: 'aria-user', label: '친구' },
    { from: 'aria', to: 'user', label: '동료' },
  ],
] as Envelope['delta']['relationships'][];
it.each(invalidChanges.map((relationships) => ({ relationships })))(
  'rejects invalid or repeated connections atomically: %j',
  ({ relationships }) => {
    const room = createRoom(exampleWork());
    const before = clone(room.current.runtime);
    expect(() =>
      applyDelta(room.work, room.current.runtime, {
        ...emptyDelta(),
        numeric: [{ fieldId: 'affinity', amount: 1 }],
        relationships,
      }),
    ).toThrow();
    expect(room.current.runtime).toEqual(before);
  },
);

it('restores generated edges through reroll selection, branching and last-turn deletion', () => {
  let room = reply(createRoom(exampleWork()), [creation()]);
  const event = room.timeline[0];
  if (event.kind !== 'turn') throw new Error();
  const firstCheckpoint = clone(room.current);
  room = addResponse(
    room,
    event.input,
    response([{ from: 'aria', to: 'sera', label: '仲間' }]),
    { model: 'mock' },
    { reroll: true },
  );
  expect(room.current.runtime.generatedRelations![0].from).toBe('aria');
  const first = switchCandidate(room, event.id, event.selectedId);
  expect(first.current).toEqual(firstCheckpoint);
  const later = reply(first, [{ from: 'sera', to: 'user', label: '恩人' }]);
  expect(later.current.runtime.generatedRelations).toHaveLength(2);
  const branch = branchRoom(later, event.id, event.selectedId);
  expect(branch.current).toEqual(firstCheckpoint);
  expect(deleteLast(later, false).current).toEqual(firstCheckpoint);
  expect(deleteLast(first, false).current.runtime.generatedRelations).toBeUndefined();
});

it('imports rooms and backups with every candidate graph, and accepts legacy v2 rooms', async () => {
  let room = reply(createRoom(exampleWork()), [creation()]);
  room = addResponse(
    room,
    '함께 하자',
    response([{ from: 'aria', to: 'sera', label: '동료' }]),
    { model: 'mock' },
    { reroll: true },
  );
  expect(await readImport(roomFile(room))).toEqual({ kind: 'room', room });
  const backup = {
    kind: 'xenotale.backup',
    schemaVersion: 2,
    profile: defaultProfile(),
    works: [],
    workspaces: [],
    rooms: [room, createRoom(room.work)],
  };
  const restored = await readImport(new File([JSON.stringify(backup)], 'backup.json'));
  expect(restored).toEqual({ kind: 'backup', data: backup });
  expect(await readImport(roomFile(createRoom(room.work)))).toMatchObject({ kind: 'room' });
});

it('rejects broken generated edges and label maps in any imported snapshot', async () => {
  const room = reply(createRoom(exampleWork()), [creation()]);
  const mutations: ((room: Room) => void)[] = [
    (r) => {
      r.current.runtime.generatedRelations![0].from = 'missing';
    },
    (r) => {
      r.current.runtime.generatedRelations![0].to = 'user';
    },
    (r) => {
      r.current.runtime.generatedRelations![0].id = 'aria-user';
    },
    (r) => {
      r.current.runtime.generatedRelations!.push(clone(r.current.runtime.generatedRelations![0]));
    },
    (r) => {
      Object.assign(r.current.runtime.generatedRelations![0], { from: 'aria', to: 'user' });
    },
    (r) => {
      delete r.current.runtime.relationships[r.current.runtime.generatedRelations![0].id];
    },
    (r) => {
      r.current.runtime.innerRelationships!.missing = 'error';
    },
    (r) => {
      const turn = r.timeline[0];
      if (turn.kind === 'turn')
        turn.candidates[0].checkpoint.runtime.generatedRelations![0].to = 'missing';
    },
  ];
  for (const mutate of mutations) {
    const broken = clone(room);
    mutate(broken);
    await expect(readImport(roomFile(broken))).rejects.toThrow('스냅샷');
  }
});

it('sends authoritative current connections to the model while retaining the authored prefix', () => {
  const room = createRoom(exampleWork());
  const next = reply(room, [creation(), { relationId: 'aria-user', label: '친구' }]);
  const options = { reroll: false, extra: [], directive: '', canRequest: true, transport: 'json' };
  const originalMessages = buildMessages(room, room.current, '처음', options);
  const messages = buildMessages(next, next.current, '다음', options);
  expect(messages[0]).toEqual(originalMessages[0]);
  const context = JSON.parse(messages.at(-1)!.content as string).runtimeContext;
  expect(context.relationships).toEqual(runtimeRelations(next.work, next.current.runtime));
  expect(context.relationships.find((r: { id: string }) => r.id === 'aria-user').label).toBe(
    '친구',
  );
  expect(messages[0].content).toContain('"from"');
});

it('accepts endpoint proposals from structured provider output and resolves them on commit', async () => {
  const room = createRoom(exampleWork());
  const payload = response([creation()]);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
          }),
        ),
    ),
  );
  const model: Model = {
    id: 'mock',
    name: 'Mock',
    context_length: 64000,
    supported_parameters: ['structured_outputs'],
  };
  const result = await generate(
    room,
    room.current,
    '함께 하자',
    model,
    'fake',
    new AbortController().signal,
    { reroll: false },
  );
  const next = addResponse(room, '함께 하자', result.result, result.usage);
  expect(next.current.runtime.generatedRelations).toHaveLength(1);
  expect(room.current.runtime.generatedRelations).toBeUndefined();
  expect(
    envelopeSchema.parse(response([{ relationId: 'aria-user', label: '친구' }])).delta
      .relationships,
  ).toHaveLength(1);
  const alternatives = responseSchema.properties.delta.properties.relationships.items.anyOf;
  expect(alternatives.map((branch) => branch.required)).toEqual([
    ['relationId', 'label', 'innerLabel'],
    ['from', 'to', 'label', 'innerLabel'],
  ]);
  expect(alternatives.every((branch) => branch.additionalProperties === false)).toBe(true);
});
