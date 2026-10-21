import { afterEach, expect, it, vi } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import {
  addResponse,
  createRoom,
  emptyDelta,
  enterChapter,
  branchRoom,
  editTurnText,
  switchCandidate,
  deleteLast,
} from '../domain/engine';
import { readImport, roomSchema, workSchema } from '../persistence/files';
import { roomUsage } from '../domain/usage';
import type { Model, Turn } from '../domain/types';
import { selected } from '../domain/types';
import { visualNovelPages } from '../domain/visualNovel';
import { generateChapter } from './chapter';

const model: Model = {
  id: 'test/chapter',
  name: 'Test',
  context_length: 200000,
  supported_parameters: ['structured_outputs'],
};
const response = () => ({
  kind: 'turn' as const,
  requestedCharacterIds: [],
  body: '방금 나눈 약속을 떠올리며 아리아와 함께 서고의 문턱을 넘는다.',
  choices: ['기록을 살핀다.'],
  delta: { ...emptyDelta(), numeric: [{ fieldId: 'affinity', amount: 2 }] },
});
const setup = () => {
  const work = exampleWork();
  work.chapters[0] = {
    ...work.chapters[0],
    conditions: [],
    prologueMode: 'ai',
    prologue: '사용하지 않을 고정 장면',
    prompt: '방금 나눈 약속을 이어 서고로 들어간다.',
  };
  return addResponse(
    createRoom(work),
    '약속을 기억하고 문을 열자.',
    { ...response(), body: '문 앞에서 아리아와 약속했다.', delta: emptyDelta() },
    { model: 'demo', cost: 0 },
  );
};
const reply = (value = response()) =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
      usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.002 },
    }),
  );
afterEach(() => vi.unstubAllGlobals());

it('uses previous dialogue and destination context, applies state/rules once and stores one portable chapter event', async () => {
  const room = setup();
  room.work.actions = [
    {
      id: 'bonus',
      name: '응답 보너스',
      trigger: 'after-response',
      mode: 'all',
      conditions: [],
      steps: [{ kind: 'add', target: 'affinity', value: '3' }],
    },
  ];
  const original = structuredClone(room);
  const fetch = vi.fn(async (_url, init) => {
    const payload = JSON.parse(init.body);
    const all = JSON.stringify(payload.messages);
    expect(all).toContain('문 앞에서 아리아와 약속했다.');
    expect(all).toContain('방금 나눈 약속을 이어 서고로 들어간다.');
    expect(all).not.toContain('사용하지 않을 고정 장면');
    const tail = JSON.parse(payload.messages.at(-1).content.split('\n\n').at(-1));
    expect(tail.runtimeContext.chapter.id).toBe('archive');
    expect(tail.runtimeContext.currentState.nodeId).toBe('archive');
    return reply();
  });
  vi.stubGlobal('fetch', fetch);
  const next = await generateChapter(
    room,
    'archive',
    model,
    'fake-key',
    new AbortController().signal,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(room).toEqual(original);
  expect(next.timeline).toHaveLength(2);
  expect(next.timeline.filter((event) => event.kind === 'turn' && !event.chapterId)).toHaveLength(
    1,
  );
  expect(next.timeline.at(-1)).toMatchObject({
    kind: 'turn',
    chapterId: 'archive',
    input: '',
    candidates: [
      {
        body: response().body,
        usage: { model: model.id, cost: 0.002 },
        choices: response().choices,
      },
    ],
    before: original.current,
  });
  expect(next.current.runtime).toMatchObject({
    nodeId: 'archive',
    turnCount: 2,
    status: { affinity: 15 },
  });
  expect(roomUsage(next).reduce((sum, usage) => sum + (usage.cost ?? 0), 0)).toBe(0.002);
  expect(roomSchema.parse(next)).toEqual(next);
  expect(workSchema.parse(next.work).chapters[0].prologueMode).toBe('ai');
  const imported = await readImport(
    new File(
      [JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room: next })],
      'chapter.json',
    ),
  );
  expect(imported.kind === 'room' && imported.room).toEqual(next);
  const branched = branchRoom(next, next.timeline.at(-1)!.id);
  expect(branched.current).toEqual(next.current);
  expect(branched.timeline.at(-1)).toEqual(next.timeline.at(-1));
});

it('keeps a legacy written chapter local and does not call a model', async () => {
  const room = setup();
  delete room.work.chapters[0].prologueMode;
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const next = await generateChapter(room, 'archive', model, '', new AbortController().signal);
  expect(next.timeline.at(-1)).toMatchObject({ kind: 'chapter', body: '사용하지 않을 고정 장면' });
  expect(next.current.runtime.turnCount).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not enter, visit, or append a chapter on provider failure or cancellation', async () => {
  const room = setup();
  const original = structuredClone(room);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 400 }),
    ),
  );
  await expect(
    generateChapter(room, 'archive', model, 'fake-key', new AbortController().signal),
  ).rejects.toThrow();
  expect(room).toEqual(original);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new DOMException('취소', 'AbortError');
    }),
  );
  await expect(
    generateChapter(room, 'archive', model, 'fake-key', new AbortController().signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(room).toEqual(original);
});

it('checks availability before making a request and rejects incomplete direct AI transitions', async () => {
  const room = setup();
  expect(() => enterChapter(room, 'archive')).toThrow('먼저 생성');
  room.work.chapters[0].conditions = [
    { id: 'locked', kind: 'number', ref: 'affinity', op: 'gte', value: 999 },
  ];
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    generateChapter(room, 'archive', model, 'fake-key', new AbortController().signal),
  ).rejects.toThrow('이동할 수 없는');
  expect(fetch).not.toHaveBeenCalled();
});

it('generates a terminal ending before applying its afterstory lock', async () => {
  const room = setup();
  room.work.chapters[0].type = 'ending';
  room.work.chapters[0].afterstory = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply()),
  );
  const next = await generateChapter(
    room,
    'archive',
    model,
    'fake-key',
    new AbortController().signal,
  );
  expect(next.current.runtime.ending).toEqual({ id: 'archive', allowAfterstory: false });
  expect(selected(next.timeline.at(-1) as Turn).body).toBe(response().body);
  expect(() => addResponse(next, '계속', response(), { model: model.id })).toThrow('끝났습니다');
  const rerolled = await generateChapter(
    next,
    'archive',
    model,
    'fake-key',
    new AbortController().signal,
    undefined,
    { reroll: true },
  );
  expect((rerolled.timeline.at(-1) as Turn).candidates).toHaveLength(2);
  expect(deleteLast(rerolled, true).current.runtime.ending).toBeNull();
});

it('edits, rerolls, selects candidates and deletes through the normal response lifecycle without duplicating chapter entry', async () => {
  const original = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply()),
  );
  const entered = await generateChapter(
    original,
    'archive',
    model,
    'fake-key',
    new AbortController().signal,
  );
  const turn = entered.timeline.at(-1) as Turn;
  const edited = editTurnText(entered, turn.id, 'assistant', '직접 수정한 프롤로그');
  expect(selected(edited.timeline.at(-1) as Turn).body).toBe('직접 수정한 프롤로그');
  expect(edited.current).toEqual(entered.current);
  expect(
    visualNovelPages(edited)
      .filter((page) => page.source.eventId === turn.id)
      .every((page) => !page.player),
  ).toBe(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      expect(JSON.stringify(payload.messages)).not.toContain('직접 수정한 프롤로그');
      const tail = JSON.parse(payload.messages.at(-1).content.split('\n\n').at(-1));
      expect(tail.runtimeContext.currentState.status.affinity).toBe(10);
      expect(tail.runtimeContext.chapter.id).toBe('archive');
      return reply({
        ...response(),
        body: '새 후보 프롤로그',
        delta: { ...emptyDelta(), numeric: [{ fieldId: 'affinity', amount: 4 }] },
      });
    }),
  );
  const rerolled = await generateChapter(
    edited,
    'archive',
    model,
    'fake-key',
    new AbortController().signal,
    undefined,
    { reroll: true },
  );
  expect(rerolled.timeline).toHaveLength(2);
  expect((rerolled.timeline.at(-1) as Turn).candidates).toHaveLength(2);
  expect(rerolled.current.runtime.status.affinity).toBe(14);
  expect(rerolled.current.runtime.visited.filter((key) => key === 'archive')).toHaveLength(1);
  const restored = switchCandidate(rerolled, turn.id, turn.selectedId);
  expect(restored.current.runtime.status.affinity).toBe(12);
  expect(selected(restored.timeline.at(-1) as Turn).body).toBe('직접 수정한 프롤로그');
  const deleted = deleteLast(restored, true);
  expect(deleted.current).toEqual(original.current);
  expect(deleted.pendingInput).toBe('');
  expect(deleted.timeline).toEqual(original.timeline);
});
