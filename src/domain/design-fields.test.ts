import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { addResponse, branchRoom, createRoom, emptyDelta, switchCandidate } from './engine';
import { clone } from './types';
import { readImport, workSchema } from '../persistence/files';
import { buildMessages } from '../engine/openrouter';

it('keeps persona images, custom personas, summary settings and inner relations at the branch point', () => {
  const w = exampleWork();
  w.relationSplit = true;
  w.relations[0].innerLabel = '관찰 중';
  let room = createRoom(w);
  room.current.context.persona = {
    id: 'custom',
    name: '은하',
    image: 'data:image/png;base64,AAAA',
    gender: '여성',
    prompt: '기록자',
  };
  room.current.context.noteGroups = ['빈 그룹'];
  room.current.context.personas = [clone(room.current.context.persona)];
  room.current.context.shortcuts = [
    { id: 's1', name: '일기', description: '', prompt: '오늘 일을 기록한다' },
  ];
  room.current.context.settings.shortSummaryPrompt = '시간 순으로 정리';
  const result = {
    kind: 'turn',
    requestedCharacterIds: [],
    body: '첫 응답',
    choices: [],
    delta: {
      ...emptyDelta(),
      relationships: [{ relationId: w.relations[0].id, label: '지인', innerLabel: '신뢰' }],
    },
  };
  room = addResponse(room, '안녕', result, { model: 'demo' });
  const checkpoint = clone(room.current);
  const event = room.timeline[0];
  if (event.kind !== 'turn') throw new Error();
  room.current.context.persona.name = '최근 이름';
  room.current.context.noteGroups = ['새 그룹'];
  room.current.context.personas = [];
  room.current.context.shortcuts = [
    { id: 's2', name: '산책', description: '', prompt: '산책한다' },
  ];
  room.current.context.settings.shortSummaryPrompt = '최근 지침';
  room = addResponse(
    room,
    '다음',
    {
      ...result,
      delta: {
        ...emptyDelta(),
        relationships: [{ relationId: w.relations[0].id, label: '친구', innerLabel: '애정' }],
      },
    },
    { model: 'demo' },
  );
  const branch = branchRoom(room, event.id);
  expect(branch.current).toEqual(checkpoint);
  expect(branch.current.runtime.innerRelationships?.[w.relations[0].id]).toBe('신뢰');
});

it('restores inner relation values when selecting an earlier reroll candidate', () => {
  const w = exampleWork();
  const key = w.relations[0].id;
  const response = (innerLabel: string) => ({
    kind: 'turn',
    requestedCharacterIds: [],
    body: innerLabel,
    choices: [],
    delta: { ...emptyDelta(), relationships: [{ relationId: key, label: '지인', innerLabel }] },
  });
  let room = addResponse(createRoom(w), 'hi', response('신뢰'), { model: 'demo' });
  const event = room.timeline[0];
  if (event.kind !== 'turn') throw new Error();
  room = addResponse(room, 'hi', response('경계'), { model: 'demo' }, { reroll: true });
  expect(room.current.runtime.innerRelationships?.[key]).toBe('경계');
  expect(
    switchCandidate(room, event.id, event.selectedId).current.runtime.innerRelationships?.[key],
  ).toBe('신뢰');
});

it('imports original v2 files and preserves the newly added optional design fields', async () => {
  const w = exampleWork();
  expect(workSchema.parse(w).title).toBe(w.title);
  w.characterGroups = [{ id: 'g', name: '관리인', prompt: '공통 비밀' }];
  w.statuses[0].levels = [{ min: 0, max: 20, prompt: '아직 낯설다' }];
  w.statuses[0].displayMax = true;
  w.quality.viewpointActorId = w.characters[0].id;
  w.relationPositions = { user: { x: 80, y: 160 } };
  w.media.rangeMin = 2;
  w.media.rangeMax = 8;
  w.media.situationNames = '기본, 미소\n';
  w.media.registered = false;
  w.personas[0].gender = '직접 정의한 성별';
  const payload = { kind: 'xenotale.work', schemaVersion: 2, work: w };
  const imported = await readImport(new File([JSON.stringify(payload)], 'work.json'));
  if (imported.kind !== 'work') throw new Error();
  expect(imported.work).toEqual(w);
});

it('passes gender, viewpoint targets, group instructions and status ranges to the model', () => {
  const w = exampleWork();
  w.characterGroups = [{ id: 'g', name: '관리인', prompt: '공통 비밀' }];
  w.statuses[0].levels = [{ min: 0, max: 20, prompt: '아직 낯설다' }];
  const room = createRoom(w);
  room.current.context.persona.gender = '여성';
  room.current.context.settings.quality.viewpointActorId = 'aria';
  const messages = buildMessages(room, room.current, '안녕', {
    reroll: false,
    extra: [],
    directive: '',
    canRequest: true,
    transport: 'frame',
  });
  expect(messages[0].content).toContain('공통 비밀');
  expect(messages[0].content).toContain('아직 낯설다');
  expect(JSON.parse(messages[1].content as string).roomProfile.persona.gender).toBe('여성');
  expect(messages.at(-1)?.content).toContain('viewpointActorId');
});
