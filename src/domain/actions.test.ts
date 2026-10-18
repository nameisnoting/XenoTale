import { describe, it, expect } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { calculate, applyAction, executeAction, type WorkAction } from './actions';
import {
  createRoom,
  addResponse,
  emptyDelta,
  switchCandidate,
  branchRoom,
  validateWork,
} from './engine';
import { selected } from './types';

function fixture() {
  const work = exampleWork();
  work.statuses = [
    {
      id: 'hp',
      name: 'HP',
      type: 'number',
      initial: 30,
      min: 0,
      max: 100,
      unit: '',
      options: [],
      prompt: '',
    },
  ];
  work.items = [
    {
      id: 'potion',
      name: '회복약',
      image: '',
      owned: true,
      quantity: 2,
      prompt: '회복약',
      enhancement: null,
    },
  ];
  work.chapters = [];
  return work;
}
const heal: WorkAction = {
  id: 'heal',
  name: '회복약 사용',
  trigger: 'button',
  mode: 'all',
  conditions: [{ id: 'q', kind: 'quantity', ref: 'potion', op: 'gte', value: 1 }],
  steps: [
    { kind: 'consume', target: 'potion', value: '1' },
    { kind: 'add', target: 'hp', value: '20' },
  ],
};
describe('authored actions', () => {
  it('evaluates bounded arithmetic and rejects host code', () => {
    expect(calculate('max(0, [hp] - 5) + dice(2, 6)', { hp: 10 }, () => 0)).toBe(7);
    expect(calculate('-2 * (3 + 4)', {})).toBe(-14);
    for (const s of ['globalThis.fetch(1)', '1/0', 'dice(101, 6)', '[missing]', '2 ** 3'])
      expect(() => calculate(s, {})).toThrow();
  });
  it('commits consumption and healing together, enforcing quantities and limits', () => {
    const work = fixture();
    work.actions = [heal];
    const original = createRoom(work);
    const once = executeAction(original, 'heal');
    expect(once.current.runtime.status.hp).toBe(50);
    expect(once.current.runtime.inventory.potion.quantity).toBe(1);
    const twice = executeAction(once, 'heal');
    expect(twice.current.runtime.status.hp).toBe(70);
    expect(twice.current.runtime.inventory.potion.owned).toBe(false);
    expect(() => executeAction(twice, 'heal')).toThrow('조건');
    expect(original.current.runtime.status.hp).toBe(30);
    expect(branchRoom(once, once.timeline[0].id).current.runtime).toEqual(once.current.runtime);
  });
  it('rolls back every step when a later step fails', () => {
    const room = createRoom(fixture()),
      before = structuredClone(room.current.runtime);
    expect(() =>
      applyAction(room.work, before, {
        ...heal,
        conditions: [],
        steps: [
          { kind: 'add', target: 'hp', value: '50' },
          { kind: 'consume', target: 'potion', value: '10' },
        ],
      }),
    ).toThrow();
    expect(before).toEqual(room.current.runtime);
  });
  it('recomputes automatic actions from the checkpoint on reroll and retains answers when a rule fails', () => {
    const work = fixture();
    work.actions = [{ ...heal, trigger: 'after-response' }];
    const room = createRoom(work);
    const reply = {
      kind: 'turn',
      requestedCharacterIds: [],
      body: '응답',
      choices: [],
      delta: emptyDelta(),
    };
    const first = addResponse(room, '입력', reply, { model: 'demo' }),
      second = addResponse(first, '입력', reply, { model: 'demo' }, { reroll: true });
    expect(second.current.runtime.status.hp).toBe(50);
    expect(second.current.runtime.inventory.potion.quantity).toBe(1);
    expect(
      switchCandidate(second, second.timeline[0].id, selected(first.timeline[0] as any).id).current
        .runtime.status.hp,
    ).toBe(50);
    work.actions[0].steps[0].value = '999';
    const bad = addResponse(createRoom(work), '입력', reply, { model: 'demo' });
    expect(selected(bad.timeline[0] as any).body).toBe('응답');
    expect(bad.current.runtime.status.hp).toBe(30);
  });
  it('blocks publication when action targets are lost', () => {
    const work = fixture();
    work.actions = [heal];
    expect(() => validateWork(work, true)).not.toThrow();
    work.statuses = [];
    expect(() => validateWork(work, true)).toThrow('작업 대상');
  });
});
