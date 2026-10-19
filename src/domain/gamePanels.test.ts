import { it, expect } from 'vitest';
import { emptyWork } from './defaults';
import { addCharacterSetup, actionSelected, gameText } from './gamePanels';
import { createRoom, validateWork, branchRoom } from './engine';
import { executeAction } from './actions';
import { canCompleteEffect, completeEffect } from './effects';
import { readImport, workSchema, roomSchema } from '../persistence/files';
import { buildMessages } from '../engine/openrouter';
import { after } from './types';
import { creatorRequest, parseCreatorAnswer, applyCreatorProposal } from './creatorAssistant';

it('lets the creation assistant propose linked native values, rules and UI through the same schema', () => {
  const original = emptyWork();
  original.title = '모험';
  original.prompt = '모험';
  original.openings[0].body = '시작';
  const generated = addCharacterSetup(original);
  const request = creatorRequest(original);
  const answer = parseCreatorAnswer(
    {
      reply: '선택 화면을 추가했습니다.',
      questions: [],
      proposals: [
        {
          section: 'statuses',
          reason: '캐릭터 만들기',
          replacement: creatorRequest(generated).draft.statuses,
        },
      ],
    },
    original,
    request,
  );
  const next = applyCreatorProposal(original, answer.proposal);
  expect(next.statuses).toEqual(generated.statuses);
  expect(next.actions).toEqual(generated.actions);
  expect(next.statusPanels).toEqual(generated.statusPanels);
  expect(() => validateWork(next, true)).not.toThrow();
});

function fixture() {
  const w = emptyWork();
  w.title = '모험';
  w.prompt = '모험을 진행한다.';
  w.openings[0].body = '모험을 준비하세요.';
  return addCharacterSetup(w);
}

it('creates a native wizard without overwriting existing definitions and round-trips all bindings', () => {
  const work = fixture();
  expect(() => validateWork(work, true)).not.toThrow();
  expect(workSchema.parse(work)).toEqual(work);
  const twice = addCharacterSetup(work);
  expect(new Set(twice.statuses.map((s) => s.name)).size).toBe(twice.statuses.length);
  expect(twice.actions?.slice(0, work.actions!.length)).toEqual(work.actions);
  expect(() => validateWork(twice, true)).not.toThrow();
});

it('runs choices and navigation locally, checks requirements, restores checkpoints and sends actual values to AI', () => {
  const work = fixture();
  const byName = (name: string) => work.actions!.find((a) => a.name === name)!;
  const initial = createRoom(work);
  expect(() => executeAction(initial, byName('클래스 · 다음 ▶').id)).toThrow('조건');
  let room = executeAction(initial, byName('엘프').id);
  expect(actionSelected(byName('엘프'), room.current.runtime)).toBe(true);
  expect(actionSelected(byName('인간'), room.current.runtime)).toBe(false);
  room = executeAction(room, byName('클래스 · 다음 ▶').id);
  room = executeAction(room, byName('마법사').id);
  expect(actionSelected(byName('마법사'), room.current.runtime)).toBe(true);
  const saved = roomSchema.parse(room);
  expect(saved.current.runtime).toEqual(room.current.runtime);
  room = executeAction(room, byName('확인 · 다음 ▶').id);
  room = executeAction(room, byName('이 캐릭터로 시작').id);
  expect(() => executeAction(room, byName('이 캐릭터로 시작').id)).toThrow('조건');
  const text = gameText(
    '종족 {{종족}} / 클래스 {{클래스}} / HP {{HP}}',
    work,
    room.current.runtime,
  );
  expect(text).toBe('종족 엘프 / 클래스 마법사 / HP 8');
  expect(gameText('{{아직 없는 값}}', work, room.current.runtime)).toBe('{{아직 없는 값}}');
  const before = branchRoom(room, room.timeline[2].id);
  expect(before.current.runtime).toEqual(after(room.timeline[2]).runtime);
  const request = JSON.stringify(
    buildMessages(room, room.current, '시작한다', {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: false,
      transport: 'json',
    }),
  );
  expect(request).toContain('엘프');
  expect(request).toContain('마법사');
  expect(initial.current.runtime.status).not.toEqual(room.current.runtime.status);
});

it('rejects broken button and display-condition references at publication', () => {
  const work = fixture(),
    panel = work.statusPanels!.at(-1)!;
  panel.blocks![0].buttons[0].actionId = 'missing';
  expect(() => validateWork(work, true)).toThrow('버튼 이름과 실행할 규칙');
  panel.blocks![0].buttons = [];
  panel.blocks![0].conditions[0].ref = 'missing';
  expect(() => validateWork(work, true)).toThrow('표시 조건');
});

it('limits effect actions to their whitelist and source, and keeps completing an effect valid after its own actions', async () => {
  const work = fixture();
  const elf = work.actions!.find((a) => a.name === '엘프')!;
  const human = work.actions!.find((a) => a.name === '인간')!;
  work.effects = [
    {
      id: 'setup',
      name: '설정',
      prompt: '',
      content: '<div>설정</div>',
      actionIds: [elf.id, human.id],
    },
  ];
  work.openings[0].body = '{{설정}}';
  const origin = {
    effectId: 'setup',
    source: { eventId: `opening:${work.openings[0].id}`, occurrence: 0 },
  };
  const first = createRoom(work);
  let room = executeAction(first, elf.id, origin);
  room = executeAction(room, human.id, origin);
  expect(canCompleteEffect(room, 'setup', origin.source)).toBe(true);
  expect(roomSchema.parse(room).timeline[0]).toHaveProperty('effectOrigin', origin);
  expect(() => executeAction(room, work.actions![3].id, origin)).toThrow('실행할 수 없는');
  const done = completeEffect(room, 'setup', origin.source, { summary: '인간 선택' });
  const imported = await readImport(
    new File(
      [JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room: done })],
      'game.room.json',
    ),
  );
  expect(imported.kind).toBe('room');
  if (imported.kind === 'room') expect(imported.room.current.runtime).toEqual(done.current.runtime);
  expect(() => executeAction(done, elf.id, origin)).toThrow('실행할 수 없는');
  const unrelated = executeAction(room, elf.id);
  expect(canCompleteEffect(unrelated, 'setup', origin.source)).toBe(false);
  expect(first.current.runtime.status).not.toEqual(room.current.runtime.status);
});
