import { describe, it, expect } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { newEvent, eventConnections, moveEventStep } from './events';
import { executeAction, type WorkAction } from './actions';
import {
  createRoom,
  addResponse,
  emptyDelta,
  branchRoom,
  availableChapters,
  enhance,
  validateWork,
} from './engine';
import { conditionsMet } from './conditions';
import { canCompleteEffect } from './effects';
import { workSchema, roomSchema } from '../persistence/files';

function fixture() {
  const work = exampleWork();
  work.statuses = [
    {
      id: 'power',
      name: '마력',
      type: 'number',
      min: 0,
      max: 100,
      initial: 0,
      options: [],
      prompt: '',
      unit: '',
    },
  ];
  work.items = [
    {
      id: 'stone',
      name: '마법석',
      image: '',
      owned: false,
      quantity: 0,
      prompt: '',
      enhancement: null,
    },
  ];
  work.effects = [{ id: 'light', name: '각성 빛', content: '<p>각성</p>', prompt: '' }];
  work.relationsEnabled = true;
  work.relationSplit = true;
  work.relations = [
    { id: 'bond', from: 'user', to: work.characters[0].id, label: '경계', innerLabel: '의심' },
  ];
  work.innerUnlock = {
    mode: 'all',
    conditions: [{ id: 'inner', kind: 'number', ref: 'power', op: 'gte', value: 10 }],
  };
  work.chapters = [
    {
      id: 'awakening',
      from: work.openings[0].id,
      name: '각성',
      type: 'chapter',
      mode: 'all',
      conditions: [{ id: 'door', kind: 'number', ref: 'power', op: 'gte', value: 10 }],
      prologue: '각성했다.',
      prompt: '',
      afterstory: true,
    },
  ];
  const gain: WorkAction = {
    ...newEvent(),
    id: 'gain',
    name: '마법석 줍기',
    steps: [{ kind: 'gain', target: 'stone', value: '1' }],
  };
  const awaken: WorkAction = {
    ...newEvent(),
    id: 'awaken',
    name: '마법석으로 각성',
    trigger: 'item-gained',
    triggerRef: 'stone',
    workspace: { view: 'nodes', chapters: ['awakening'], innerUnlock: true },
    steps: [
      { kind: 'add', target: 'power', value: '10' },
      { kind: 'relation', target: 'bond', value: '동료' },
      { kind: 'inner-relation', target: 'bond', value: '신뢰' },
    ],
  };
  const light: WorkAction = {
    ...newEvent(),
    id: 'light-event',
    name: '마력 변화 연출',
    trigger: 'state-changed',
    triggerRef: 'power',
    steps: [{ kind: 'effect', target: 'light', value: '' }],
  };
  work.actions = [gain, awaken, light];
  return work;
}

describe('shared event authoring and execution', () => {
  it('retains legacy rules and both editor views through work and room schemas', () => {
    const work = fixture();
    delete work.actions![0].workspace;
    const parsed = workSchema.parse(work);
    expect(parsed.actions![0].workspace).toBeUndefined();
    expect(parsed.actions![1].workspace).toEqual(work.actions![1].workspace);
    const room = executeAction(createRoom(parsed), 'gain');
    expect(roomSchema.parse(room).current.runtime).toEqual(room.current.runtime);
  });
  it('chains item and state events, updates relationships and unlocks the existing scenario and inner conditions in one checkpoint', () => {
    const work = fixture(),
      original = createRoom(work);
    const room = executeAction(original, 'gain');
    expect(room.current.runtime.status.power).toBe(10);
    expect(room.current.runtime.inventory.stone.quantity).toBe(1);
    expect(room.current.runtime.relationships.bond).toBe('동료');
    expect(room.current.runtime.innerRelationships?.bond).toBe('신뢰');
    expect(availableChapters(work, room.current.runtime).map((c) => c.id)).toEqual(['awakening']);
    expect(conditionsMet(work, room.current.runtime, work.innerUnlock!.conditions, 'all')).toBe(
      true,
    );
    expect(room.timeline).toHaveLength(1);
    expect(room.timeline[0]).toMatchObject({
      body: '마법석 줍기\n{{effect:light}}',
      changes: ['마법석 줍기', '마법석으로 각성', '마력 변화 연출'],
    });
    expect(original.current.runtime.status.power).toBe(0);
    expect(branchRoom(room, room.timeline[0].id).current.runtime).toEqual(room.current.runtime);
  });
  it('uses the same automatic pipeline for model deltas and never repeats a self-triggering event within a transaction', () => {
    const work = fixture();
    work.actions!.push({
      ...newEvent(),
      id: 'loop',
      name: '마력 보너스',
      trigger: 'state-changed',
      triggerRef: 'power',
      steps: [{ kind: 'add', target: 'power', value: '1' }],
    });
    const delta = emptyDelta();
    delta.inventory.push({ itemId: 'stone', owned: true });
    const room = addResponse(
      createRoom(work),
      '마법석을 줍는다',
      { kind: 'turn', requestedCharacterIds: [], body: '획득했다.', choices: [], delta },
      { model: 'test' },
    );
    expect(room.current.runtime.status.power).toBe(11);
    expect(room.timeline).toHaveLength(1);
  });
  it('preserves successful root work when a following automatic event fails atomically', () => {
    const work = fixture();
    work.actions![1].steps.push({ kind: 'consume', target: 'stone', value: '99' });
    const room = executeAction(createRoom(work), 'gain');
    expect(room.current.runtime.inventory.stone.quantity).toBe(1);
    expect(room.current.runtime.status.power).toBe(0);
    expect(room.current.runtime.relationships.bond).toBe('경계');
    const event = room.timeline[0];
    if (event.kind === 'turn') throw new Error('Expected a local event');
    expect(event.changes.join()).toContain('실행 보류');
  });
  it('derives connections from the actual shared conditions and preserves execution when step order or editor view changes', () => {
    const work = fixture(),
      event = work.actions![1];
    const automatic = { ...event, workspace: { view: 'blocks' as const } };
    expect(eventConnections(work, automatic).chapters[0]).toBe(work.chapters[0]);
    work.chapters[0].conditions[0].value = 20;
    expect(eventConnections(work, automatic).chapters[0].conditions[0].value).toBe(20);
    work.chapters[0].conditions = [];
    expect(eventConnections(work, automatic).chapters).toHaveLength(0);
    expect(eventConnections(work, event).chapters).toHaveLength(1);
    expect(moveEventStep(event, 0, 2).map((s) => s.kind)).toEqual([
      'relation',
      'inner-relation',
      'add',
    ]);
    expect(event.steps[0].kind).toBe('add');
  });
  it('reacts to effective status changes from item enhancement and emits usable effect tags', () => {
    const work = fixture();
    work.statuses.push({ ...work.statuses[0], id: 'gold', name: '골드' });
    work.items[0] = {
      ...work.items[0],
      owned: true,
      quantity: 1,
      enhancement: {
        currency: 'gold',
        target: 'power',
        costBase: 0,
        costStep: 0,
        gainBase: 10,
        gainStep: 0,
        probabilities: [1],
        keepWeight: 1,
        resetWeight: 0,
      },
    };
    const room = enhance(createRoom(work), 'stone', 0);
    const event = room.timeline[0];
    if (event.kind === 'turn') throw new Error('Expected an enhancement');
    expect(event.body).toContain('{{effect:light}}');
    const source = { eventId: event.id, occurrence: event.body.indexOf('{{effect:light}}') };
    expect(canCompleteEffect(room, 'light', source)).toBe(true);
  });
  it('blocks publication for missing trigger targets and disconnected relation edits', () => {
    const work = fixture();
    work.actions![1].triggerRef = 'missing';
    expect(() => validateWork(work, true)).toThrow('획득을 확인');
    work.actions![1].triggerRef = 'stone';
    work.relationSplit = false;
    expect(() => validateWork(work, true)).toThrow('표면 / 내면 분리');
  });
});
