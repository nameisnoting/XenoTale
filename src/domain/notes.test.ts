import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { mergeNotes, normalizeNotes } from './notes';
import { createRoom } from './engine';
import { exampleWork } from './defaults';
import { readImport } from '../persistence/files';
const note = (id: string, group = '') => ({
  id,
  name: id,
  body: '처음 내용',
  enabled: true,
  group,
});
describe('note transfers', () => {
  it('updates the same ID without duplicating it and preserves unrelated notes', () => {
    const source = {
      notes: [{ ...note('same'), name: '새 제목', body: '새 내용', enabled: false }],
    };
    const result = mergeNotes({ notes: [note('same'), note('other')] }, source);
    expect(mergeNotes(result, source).notes).toEqual([source.notes[0], note('other')]);
  });
  it('renames a group by identity, including members that were not selected', () => {
    const result = mergeNotes(
      {
        notes: [note('a', '옛 이름'), note('b', '옛 이름')],
        noteGroups: ['옛 이름'],
        noteGroupIds: { '옛 이름': 'group-id' },
      },
      {
        notes: [note('a', '새 이름')],
        noteGroups: ['새 이름'],
        noteGroupIds: { '새 이름': 'group-id' },
      },
    );
    expect(result.noteGroups).toEqual(['새 이름']);
    expect(result.notes.map((n) => n.group)).toEqual(['새 이름', '새 이름']);
    expect(result.noteGroupIds).toEqual({ '새 이름': 'group-id' });
  });
  it('preserves empty groups through repeated transfers', () => {
    const source = { notes: [], noteGroups: ['빈 그룹'], noteGroupIds: { '빈 그룹': 'empty-id' } };
    expect(mergeNotes(mergeNotes({ notes: [] }, source), source)).toEqual(source);
  });
  it('adds identities to legacy groups without changing note IDs or content', () => {
    const source = { notes: [note('legacy', '기존 그룹')], noteGroups: ['비어 있음'] };
    const normalized = normalizeNotes(source);
    expect(normalized.notes).toEqual(source.notes);
    expect(Object.keys(normalized.noteGroupIds)).toEqual(['비어 있음', '기존 그룹']);
    expect(normalizeNotes(normalized)).toEqual(normalized);
  });
  it('keeps grouping safe for arbitrary user-entered names', () => {
    const source = { notes: [note('n', '__proto__')], noteGroups: ['__proto__'] };
    const result = mergeNotes({ notes: [] }, source);
    expect(Object.hasOwn(result.noteGroupIds, '__proto__')).toBe(true);
    expect(result.noteGroups).toEqual(['__proto__']);
  });
  it('preserves group identities in portable room files', async () => {
    const room = createRoom(exampleWork());
    Object.assign(room.current.context, {
      notes: [note('n', '그룹')],
      noteGroups: ['그룹'],
      noteGroupIds: { 그룹: 'group-id' },
    });
    const file = new File(
      [JSON.stringify({ kind: 'xenotale.room', schemaVersion: 2, room })],
      'room.json',
    );
    const result = await readImport(file);
    expect(result.kind).toBe('room');
    if (result.kind === 'room')
      expect(result.room.current.context.noteGroupIds).toEqual({ 그룹: 'group-id' });
  });
});
