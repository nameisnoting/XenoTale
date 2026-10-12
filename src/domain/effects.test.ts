import { describe, it, expect } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import {
  addResponse,
  branchRoom,
  createRoom,
  deleteLast,
  emptyDelta,
  switchCandidate,
} from './engine';
import {
  canCompleteEffect,
  completeEffect,
  effectResultSchema,
  resolveEffect,
  storyTokens,
} from './effects';
import { buildMessages } from '../engine/openrouter';
import { readImport } from '../persistence/files';

function fixture() {
  const work = exampleWork();
  work.effects = [{ id: 'railgun', name: '레일건', prompt: '각성할 때', content: '<h1>각성</h1>' }];
  work.openings[0].body = '시작\n\n{{레일건}}\n\n{{effect:railgun}}';
  const room = createRoom(work);
  const source = {
    eventId: `opening:${room.openingId}`,
    occurrence: work.openings[0].body.indexOf('{{'),
  };
  return { room, source };
}
const result = {
  summary: '문을 여는 퍼즐에 성공했다.',
  outcome: 'success',
  score: 100,
  data: { attempts: 2 },
};
const response = (body = '다음 장면') => ({
  kind: 'turn',
  requestedCharacterIds: [],
  body,
  choices: [],
  delta: emptyDelta(),
});
describe('interactive effects', () => {
  it('resolves registered names and legacy IDs while retaining unknown and persona tags', () => {
    const { room } = fixture();
    expect(resolveEffect(room.work, '레일건')?.id).toBe('railgun');
    expect(resolveEffect(room.work, 'effect:railgun')?.name).toBe('레일건');
    expect(resolveEffect(room.work, 'effect:레일건')?.id).toBe('railgun');
    expect(resolveEffect(room.work, '없는연출')).toBeUndefined();
    const text = '{{user}}가 왔다. {{레일건}}';
    expect(
      storyTokens(text)
        .map((t) => t.text)
        .join(''),
    ).toBe(text);
    room.work.effects.push({ ...room.work.effects[0], id: 'other' });
    expect(resolveEffect(room.work, '레일건')).toBeUndefined();
  });
  it('commits once per button, preserves play state, and permits a different button in the same passage', () => {
    const { room, source } = fixture();
    const completed = completeEffect(room, 'railgun', source, result);
    expect(completed.current.runtime.status).toEqual(room.current.runtime.status);
    expect(completed.current.runtime.turnCount).toBe(0);
    expect(completed.timeline.at(-1)?.kind).toBe('effect');
    expect(completed.current.runtime.effectResults?.[0].result).toEqual(result);
    expect(() => completeEffect(completed, 'railgun', source, result)).toThrow('이미');
    const second = { ...source, occurrence: room.work.openings[0].body.lastIndexOf('{{') };
    expect(canCompleteEffect(completed, 'railgun', second)).toBe(true);
    expect(
      completeEffect(completed, 'railgun', second, result).current.runtime.effectResults,
    ).toHaveLength(2);
    expect(room.timeline).toHaveLength(0);
  });
  it('rejects old scenes and alternate candidates, and restores results through branching/deleting', () => {
    const { room } = fixture();
    const first = addResponse(room, '시작', response('{{레일건}}'), { model: 'demo' });
    const turn = first.timeline[0];
    if (turn.kind !== 'turn') throw new Error();
    const source = { eventId: turn.id, candidateId: turn.selectedId, occurrence: 0 };
    const completed = completeEffect(first, 'railgun', source, result);
    expect(
      switchCandidate(completed, turn.id, turn.selectedId).current.runtime.effectResults,
    ).toBeUndefined();
    expect(branchRoom(completed, turn.id).current.runtime.effectResults).toBeUndefined();
    expect(
      branchRoom(completed, completed.timeline[1].id).current.runtime.effectResults,
    ).toHaveLength(1);
    const next = addResponse(completed, '이어서', response(), { model: 'demo' });
    expect(deleteLast(next, false).current.runtime.effectResults).toHaveLength(1);
    expect(
      canCompleteEffect(
        addResponse(first, '다음', response(), { model: 'demo' }),
        'railgun',
        source,
      ),
    ).toBe(false);
    const rerolled = addResponse(
      first,
      '시작',
      response('{{레일건}}'),
      { model: 'demo' },
      { reroll: true },
    );
    expect(canCompleteEffect(rerolled, 'railgun', source)).toBe(false);
  });
  it('rejects unbounded, nested and unsupported result commands', () => {
    for (const invalid of [
      { summary: '' },
      { summary: 'a'.repeat(2001) },
      { ...result, score: NaN },
      { ...result, delta: { inventory: [] } },
      { ...result, data: { nested: { secret: true } } },
      { ...result, data: JSON.parse('{"__proto__":"unsafe"}') },
    ]) {
      expect(effectResultSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it('sends confirmed results in the dynamic prompt without author code or auto-completing tags', () => {
    const { room, source } = fixture();
    const completed = completeEffect(room, 'railgun', source, result);
    const options = {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'json',
    };
    const before = buildMessages(room, room.current, '다음', options);
    const after = buildMessages(completed, completed.current, '다음', options);
    expect(before[0]).toEqual(after[0]);
    expect(after[0].content).not.toContain('<h1>각성</h1>');
    expect(JSON.parse(before.at(-1)!.content as string).runtimeContext.effectResults).toEqual([]);
    expect(
      JSON.parse(after.at(-1)!.content as string).runtimeContext.effectResults[0].result,
    ).toEqual(result);
  });
  it('round-trips result checkpoints and rejects forged source references on import', async () => {
    const { room, source } = fixture();
    const completed = completeEffect(room, 'railgun', source, result);
    const file = () =>
      new File(
        [JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room: completed })],
        'room.json',
      );
    const imported = await readImport(file());
    expect(imported.kind === 'room' && imported.room.current.runtime.effectResults).toEqual(
      completed.current.runtime.effectResults,
    );
    const event = completed.timeline[0];
    if (event.kind !== 'effect' || !event.effectResult) throw new Error();
    event.effectResult.source.occurrence = 999;
    await expect(readImport(file())).rejects.toThrow('참조');
  });
});
