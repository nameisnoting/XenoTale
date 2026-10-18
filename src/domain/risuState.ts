import { clone, id, selected } from './types';
import type { Room } from './types';
import type { RisuResult } from '../engine/risu/types';
export function risuChatEntries(room: Room) {
  // Risu renders a not-yet-sent greeting separately from saved chat entries.
  return room.timeline.flatMap((event) =>
    event.kind === 'turn'
      ? [
          { role: 'user', data: event.input, eventId: event.id },
          { role: 'char', data: selected(event).body, eventId: event.id },
        ]
      : event.risuChat
        ? [{ ...event.risuChat, eventId: event.id }]
        : [],
  );
}
/** UI actions use the same checkpoint/event journal as all other room changes. */
export function commitRisuState(room: Room, result: RisuResult, revision: number) {
  if (room.revision !== revision)
    throw new Error('대화가 변경되었습니다. 현재 화면에서 다시 선택해 주세요.');
  const next = clone(room),
    before = clone(next.current);
  const existing = risuChatEntries(next);
  if (result.chats.length < existing.length)
    throw new Error('이 스크립트의 대화 삭제 동작은 지원하지 않습니다.');
  existing.forEach((entry, index) => {
    const changed = result.chats[index];
    if (changed.role !== entry.role)
      throw new Error('스크립트의 대화 역할 변경은 지원하지 않습니다.');
    if (changed.data === entry.data) return;
    const event = next.timeline.find((e) => e.id === entry.eventId)!;
    if (event.kind === 'turn') {
      if (entry.role === 'user') event.input = changed.data;
      else selected(event).body = changed.data;
    } else if (event.risuChat) {
      event.risuChat.data = changed.data;
      event.body = changed.data;
    }
  });
  next.current.runtime.risu = clone(result.state);
  next.timeline.push({
    id: id(),
    kind: 'action',
    risuEvent: true,
    body: '작품 설정 변경',
    before,
    after: clone(next.current),
    changes: ['작품 설정 변경'],
    createdAt: Date.now(),
  });
  for (const chat of result.chats.slice(existing.length))
    if (chat.role !== 'user')
      next.timeline.push({
        id: id(),
        kind: 'action',
        risuEvent: true,
        risuChat: clone(chat),
        body: chat.data,
        before: clone(next.current),
        after: clone(next.current),
        changes: ['작품 메시지'],
        createdAt: Date.now(),
      });
  return next;
}
