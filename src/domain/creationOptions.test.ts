import { describe, it, expect } from 'vitest';
import { emptyWork } from './defaults';
import { createRoom, conditionsMet, validateWork } from './engine';
import { cleanWork } from './workContent';
import { transformDisplay } from './displayRules';
import { buildMessages } from '../engine/openrouter';

const finished = () => {
  const work = emptyWork();
  work.title = '작품';
  work.prompt = '등장인물은 여기에 자유롭게 작성합니다.';
  work.openings[0].body = '시작';
  return work;
};
describe('creation options', () => {
  it('injects always-active lore and matching keywords, while keeping lookup-only data out of AI context', () => {
    const work = finished();
    work.lore = [
      { id: 'always', name: '기본', keywords: [], prompt: 'ALWAYS_INCLUDED', activation: 'always' },
      {
        id: 'lookup',
        name: 'Aboleth',
        keywords: ['Aboleth'],
        prompt: 'LOOKUP_NOT_AUTOMATIC',
        activation: 'reference',
      },
      { id: 'keyword', name: '정원', keywords: ['정원'], prompt: 'MATCHED_KEYWORD' },
      { id: 'other', name: '서고', keywords: ['서고'], prompt: 'UNMATCHED_KEYWORD' },
    ];
    const room = createRoom(work);
    const text = JSON.stringify(
      buildMessages(room, room.current, '정원에 Aboleth가 있다', {
        reroll: false,
        extra: [],
        directive: '',
        canRequest: false,
        transport: 'json',
      }),
    );
    expect(text).toContain('ALWAYS_INCLUDED');
    expect(text).toContain('MATCHED_KEYWORD');
    expect(text).not.toContain('LOOKUP_NOT_AUTOMATIC');
    expect(text).not.toContain('UNMATCHED_KEYWORD');
  });
  it('blank character placeholders are optional and excluded from the published conversation and prompt', () => {
    const work = finished(),
      room = createRoom(work);
    expect(room.work.characters).toEqual([]);
    expect(room.initial.runtime.presence).toEqual([]);
    expect(cleanWork(room.work)).toEqual(room.work);
    expect(() => validateWork(work, true)).not.toThrow();
    const messages = buildMessages(room, room.current, '안녕', {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: false,
      transport: 'json',
    });
    expect(messages[0].content).not.toContain('"directory":');
    expect(messages[0].content).not.toContain('"mainCharacters":');
    expect(work.characters).toHaveLength(1);
  });
  it('omits blank recommended personas and uses only a contentful persona in context', () => {
    const work = finished();
    const blank = work.personas[0];
    expect(work.personas).toHaveLength(1);
    expect(cleanWork(work).personas).toEqual([]);
    expect(createRoom(work, 'demo', blank).current.context.persona.name).toBe('여행자');
    work.personas.push({ id: 'named', name: '설정한 인물', prompt: '설정한 페르소나', image: '' });
    const room = createRoom(work, 'demo', blank);
    expect(room.work.personas.map((p) => p.id)).toEqual(['named']);
    expect(room.current.context.persona.id).toBe('named');
    expect(work.personas).toHaveLength(2);
    const addedPlaceholder = {
      id: 'new',
      name: '페르소나 2',
      defaultName: '페르소나 2',
      prompt: '',
      image: '',
    };
    expect(cleanWork({ ...work, personas: [addedPlaceholder] }).personas).toEqual([]);
    expect(
      cleanWork({ ...work, personas: [{ ...addedPlaceholder, prompt: '직접 작성' }] }).personas,
    ).toHaveLength(1);
  });
  it('the chosen default UI initializes every new room but does not change existing choices', () => {
    const work = finished(),
      original = createRoom(work);
    work.defaultUi = 'visual-novel';
    expect(createRoom(work).current.context.settings.uiType).toBe('visual-novel');
    expect(original.current.context.settings.uiType).toBe('novel');
  });
  it('inner visibility uses the same inventory/state AND/OR rules as chapters', () => {
    const work = finished();
    work.items = [
      { id: 'magatama', name: '곡옥', image: '', owned: false, prompt: '', enhancement: null },
    ];
    const room = createRoom(work),
      conditions = [
        { id: 'one', kind: 'item' as const, ref: 'magatama', op: 'eq' as const, value: true },
      ];
    expect(conditionsMet(work, room.current.runtime, conditions, 'all')).toBe(false);
    room.current.runtime.inventory.magatama.owned = true;
    expect(conditionsMet(work, room.current.runtime, conditions, 'all')).toBe(true);
    work.relationsEnabled = true;
    work.relationSplit = true;
    work.innerUnlock = { mode: 'all', conditions: [{ ...conditions[0], ref: 'missing' }] };
    expect(() => validateWork(work, true)).toThrow('내면 해금');
  });
  it('automatic regex changes display without modifying stored text and rejects malformed expressions', () => {
    const text = '체력: 12',
      rules = [
        {
          id: 'rule',
          name: '상태창',
          pattern: '체력: (\\d+)',
          flags: 'g',
          replacement: '<strong>HP $1</strong>',
          enabled: true,
        },
      ];
    expect(transformDisplay(text, rules)).toBe('<strong>HP 12</strong>');
    expect(text).toBe('체력: 12');
    expect(() => transformDisplay(text, [{ ...rules[0], pattern: '(' }])).toThrow('정규식');
  });
});
