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
