import { describe, it, expect } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { emptyWork } from './defaults';
import {
  createRoom,
  addResponse,
  emptyDelta,
  deleteLast,
  branchRoom,
  switchCandidate,
} from './engine';
import { selected } from './types';
import { visualNovelPages, chapterMusic } from './visualNovel';
import { completeEffect } from './effects';
import { checkPresentation } from './presentation';
import {
  DEFAULT_CHAT_UI,
  chatUiEnabled,
  codeApproval,
  codeChecked,
  codeProblems,
  publicationCodeProblems,
} from './chatUi';
import { readImport } from '../persistence/files';

const usage = { model: 'demo', cost: 0, duration: 0 };
describe('visual novel views share the actual timeline', () => {
  it('pages newlines, retains speakers and exact effect occurrences, changes images in order', () => {
    const work = exampleWork();
    work.effects = [{ id: 'fx', name: '빛', prompt: '', content: '빛' }];
    work.media = {
      template: 'https://example.com/{{char_code}}-{{situation_code}}.png',
      characters: [{ code: '1', characterId: work.characters[0].id }],
      situations: [{ code: '2', name: '미소' }],
    };
    work.openings[0].body =
      '{{img:1/2}}\n@아리아: {{user}}님.\n두 번째 줄 {{빛}}\n\n*지문*\n{{빛}}';
    const room = createRoom(work);
    const pages = visualNovelPages(room);
    expect(pages).toHaveLength(4);
    expect(pages[0]).toMatchObject({
      actor: '아리아',
      text: room.initial.context.persona.name + '님.',
      background: 'https://example.com/1-2.png',
    });
    expect(pages[1].effects[0].source.occurrence).toBe(work.openings[0].body.indexOf('{{빛}}'));
    expect(pages[2].actor).toBeUndefined();
    expect(pages[3]).toMatchObject({ effectOnly: true, last: true });
  });
  it('keeps candidate views and user messages separate, without mutating history', () => {
    let room = createRoom(exampleWork());
    room = addResponse(
      room,
      '입력',
      {
        kind: 'turn',
        requestedCharacterIds: [],
        body: '@아리아: 처음\n다음',
        choices: ['선택'],
        delta: emptyDelta(),
      },
      usage,
    );
    room = addResponse(
      room,
      '입력',
      {
        kind: 'turn',
        requestedCharacterIds: [],
        body: '다른 후보',
        choices: [],
        delta: emptyDelta(),
      },
      usage,
      { reroll: true },
    );
    const last = room.timeline.at(-1)!;
    if (last.kind !== 'turn') throw Error('turn');
    const before = structuredClone(room);
    const pages = visualNovelPages(room, (turn) => turn.candidates[0]);
    expect(pages.at(-1)?.text).toBe('다음');
    expect(pages.filter((page) => page.player)).toHaveLength(1);
    expect(room).toEqual(before);
    room = switchCandidate(room, last.id, last.candidates[0].id);
    expect(visualNovelPages(room).at(-1)?.source.candidateId).toBe(
      selected(last).id === last.candidates[0].id ? selected(last).id : last.candidates[0].id,
    );
  });
  it('inherits chapter music, supports explicit stop and guards cycles', () => {
    const work = exampleWork();
    work.openings[0].bgm = 'https://example.com/open.mp3';
    work.chapters = [
      {
        id: 'one',
        name: '1',
        type: 'chapter',
        from: work.openings[0].id,
        mode: 'all',
        conditions: [],
        prologue: '',
        prompt: '',
        afterstory: true,
      },
      {
        id: 'two',
        name: '2',
        type: 'ending',
        from: 'one',
        mode: 'all',
        conditions: [],
        prologue: '',
        prompt: '',
        afterstory: false,
        bgm: '',
      },
    ];
    expect(chapterMusic(work, 'one')).toBe(work.openings[0].bgm);
    expect(chapterMusic(work, 'two')).toBe('');
    work.chapters[0].from = 'one';
    expect(chapterMusic(work, 'one')).toBe('');
  });
  it('reroll/candidate/delete restores sourced effects while preserving room UI choices', () => {
    const work = exampleWork();
    work.effects = [{ id: 'fx', name: '빛', prompt: '', content: '빛' }];
    const room = createRoom(work);
    const first = addResponse(
      room,
      '입력',
      { kind: 'turn', requestedCharacterIds: [], body: '{{빛}}', choices: [], delta: emptyDelta() },
      usage,
    );
    const event = first.timeline[0];
    if (event.kind !== 'turn') throw Error('turn');
    const completed = completeEffect(
      first,
      'fx',
      { eventId: event.id, candidateId: event.selectedId, occurrence: 0 },
      { summary: '밝아짐' },
      { theme: { textbox: '#333333' } },
    );
    completed.current.context.settings.uiType = 'visual-novel';
    completed.current.context.settings.uiSource = 'default';
    const switched = switchCandidate(completed, event.id, event.selectedId);
    expect(switched.timeline).toHaveLength(1);
    expect(switched.current.runtime.presentation).toBeUndefined();
    expect(switched.current.context.settings.uiType).toBe('visual-novel');
    const rerolled = addResponse(
      completed,
      '입력',
      {
        kind: 'turn',
        requestedCharacterIds: [],
        body: '새 응답',
        choices: [],
        delta: emptyDelta(),
      },
      usage,
      { reroll: true },
    );
    expect(rerolled.timeline).toHaveLength(1);
    expect(rerolled.current.runtime.effectResults).toBeUndefined();
    expect(deleteLast(completed, false).current.context.settings).toMatchObject({
      uiType: 'visual-novel',
      uiSource: 'default',
    });
  });
  it('saves presentation with effect results, restores it on delete/branch and round trips', async () => {
    const work = exampleWork();
    work.effects = [{ id: 'fx', name: '빛', prompt: '', content: '빛' }];
    work.openings[0].body = '{{빛}}';
    const room = createRoom(work),
      source = { eventId: 'opening:' + room.openingId, occurrence: 0 };
    const saved = completeEffect(
      room,
      'fx',
      source,
      { summary: '화면 변경' },
      { uiType: 'visual-novel', theme: { text: '#ffffff' } },
    );
    expect(saved.current.runtime.presentation?.uiType).toBe('visual-novel');
    const next = addResponse(
      saved,
      '이어서',
      { kind: 'turn', requestedCharacterIds: [], body: '다음', choices: [], delta: emptyDelta() },
      usage,
    );
    expect(deleteLast(next, false).current.runtime.presentation).toEqual(
      saved.current.runtime.presentation,
    );
    expect(branchRoom(saved, saved.timeline[0].id).current.runtime.presentation?.uiType).toBe(
      'visual-novel',
    );
    const imported = await readImport(
      new File(
        [JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room: saved })],
        'room.json',
      ),
    );
    expect(imported.kind === 'room' && imported.room.current.runtime.presentation).toEqual(
      saved.current.runtime.presentation,
    );
  });
});
describe('authored code validation', () => {
  it('new work uses the built-in UI until customization is enabled and approved', () => {
    const work = emptyWork();
    expect(chatUiEnabled(work.chatUi)).toBe(false);
    expect(publicationCodeProblems(work)).toEqual([]);
    work.chatUi!.enabled = true;
    expect(publicationCodeProblems(work)).toContain('대화방 UI 유효성 검사를 통과해 주세요.');
    expect(codeProblems(DEFAULT_CHAT_UI, 'ui', work)).toEqual([]);
    work.chatUi!.validation = codeApproval(work.chatUi!.code);
    expect(publicationCodeProblems(work)).toEqual([]);
    work.chatUi!.code += '\n<!--edit-->';
    expect(codeChecked(work.chatUi!.code, work.chatUi!.validation)).toBe(false);
    expect(publicationCodeProblems(work)).toContain('대화방 UI 유효성 검사를 통과해 주세요.');
    work.chatUi!.enabled = false;
    expect(publicationCodeProblems(work)).toEqual([]);
  });
  it('legacy custom layouts still require approval; absent layouts do not', () => {
    const work = exampleWork();
    expect(publicationCodeProblems(work)).toEqual([]);
    work.chatUi = { code: DEFAULT_CHAT_UI + '\n<!--custom-->' };
    expect(chatUiEnabled(work.chatUi)).toBe(true);
    expect(publicationCodeProblems(work)).toContain('대화방 UI 유효성 검사를 통과해 주세요.');
  });
  it('older untouched pending templates default OFF while approved templates stay ON', () => {
    const work = emptyWork();
    work.chatUi = { code: DEFAULT_CHAT_UI };
    expect(chatUiEnabled(work.chatUi)).toBe(false);
    expect(publicationCodeProblems(work)).toEqual([]);
    work.chatUi.validation = codeApproval(DEFAULT_CHAT_UI);
    expect(chatUiEnabled(work.chatUi)).toBe(true);
  });
  it('a disabled layout round-trips with its draft but does not bypass effect validation', async () => {
    const work = exampleWork();
    work.chatUi = { enabled: false, code: '<script>fetch("https://example.com")</script>' };
    const imported = await readImport(
      new File([JSON.stringify({ kind: 'xenotale.work', schemaVersion: 2, work })], 'work.json'),
    );
    expect(imported.kind === 'work' && imported.work.chatUi).toEqual(work.chatUi);
    expect(publicationCodeProblems(work)).toEqual([]);
    work.effects = [{ id: 'effect', name: '효과', prompt: '', content: '<p>효과</p>' }];
    expect(publicationCodeProblems(work)).toContain('효과: 유효성 검사를 통과해 주세요.');
  });
  it('resource changes revoke approval and external communication/missing slots are reported', () => {
    const stamp = codeApproval(DEFAULT_CHAT_UI, ['https://example.com/a.png']);
    expect(codeChecked(DEFAULT_CHAT_UI, stamp, [])).toBe(false);
    expect(
      codeProblems(
        DEFAULT_CHAT_UI.replaceAll('data-xenotale-slot="composer"', 'data-xenotale-slot="removed"'),
        'ui',
      ),
    ).toContain('composer: 필수 대화방 영역이 하나 있어야 합니다.');
    expect(
      codeProblems('<script>fetch("https://example.com")</script>', 'effect').join(''),
    ).toContain('외부 통신');
    expect(
      codeProblems('<img src="https://example.com/a.png">', 'effect', undefined, [
        'https://example.com/a.png',
      ]),
    ).toEqual([]);
  });
  it('presentation only accepts registered assets and supported operations', () => {
    const work = exampleWork();
    expect(() => checkPresentation({ music: 'https://evil.example/a' }, work)).toThrow();
    expect(() => checkPresentation({ background: '999/999' }, work)).toThrow();
    expect(() => checkPresentation({ apiKey: 'x' }, work)).toThrow();
    expect(checkPresentation({ music: null, uiType: 'novel' }, work)).toEqual({
      music: null,
      uiType: 'novel',
    });
  });
});
