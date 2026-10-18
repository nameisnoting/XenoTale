import { test, expect } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { createRoom, addResponse, emptyDelta, branchRoom, deleteLast } from './engine';
import { commitRisuState, risuChatEntries } from './risuState';

test('Risu button changes use checkpoints, reject stale commits and survive branching', () => {
  const room = createRoom(exampleWork());
  const changed = commitRisuState(room, { state: { choice: 'Elf' }, chats: [], text: '' }, 0);
  expect(room.current.runtime.risu).toBeUndefined();
  expect(changed.current.runtime.risu?.choice).toBe('Elf');
  expect(branchRoom(changed, changed.timeline[0].id).current.runtime.risu?.choice).toBe('Elf');
  expect(() => commitRisuState(changed, { state: {}, chats: [], text: '' }, 2)).toThrow('변경');
  const answered = addResponse(
    changed,
    '입력',
    {
      kind: 'turn',
      requestedCharacterIds: [],
      body: '응답',
      choices: [],
      delta: emptyDelta(),
    },
    { model: 'demo' },
    { risuState: { choice: 'Dwarf' } },
  );
  expect(deleteLast(answered, false).current.runtime.risu?.choice).toBe('Elf');
});

test('script chat edits and appended character lines are saved without silently sending user input', () => {
  const room = addResponse(
    createRoom(exampleWork()),
    '입력',
    {
      kind: 'turn',
      requestedCharacterIds: [],
      body: '응답',
      choices: [],
      delta: emptyDelta(),
    },
    { model: 'demo' },
  );
  const chats = risuChatEntries(room).map(({ role, data }) => ({ role, data }));
  chats[1].data = '규칙을 반영한 응답';
  chats.push({ role: 'char', data: '설정 완료' }, { role: 'user', data: '다음 입력' });
  const next = commitRisuState(room, { state: { done: '1' }, chats, text: '' }, 0);
  expect(risuChatEntries(next).map((c) => c.data)).toEqual([
    '입력',
    '규칙을 반영한 응답',
    '설정 완료',
  ]);
  expect(() => commitRisuState(room, { state: {}, chats: [], text: '' }, 0)).toThrow('삭제');
});
