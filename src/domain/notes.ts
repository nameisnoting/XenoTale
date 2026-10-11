import type { Note } from './types';
import { clone, id } from './types';

export type NoteCollection = {
  notes: Note[];
  noteGroups?: string[];
  noteGroupIds?: Record<string, string>;
};
export function normalizeNotes(collection: NoteCollection) {
  const noteGroups = [
    ...new Set(
      [...(collection.noteGroups ?? []), ...collection.notes.map((n) => n.group)].filter(Boolean),
    ),
  ];
  const noteGroupIds = Object.fromEntries(
    noteGroups.map((name) => [
      name,
      Object.hasOwn(collection.noteGroupIds ?? {}, name) ? collection.noteGroupIds![name] : id(),
    ]),
  );
  return { notes: clone(collection.notes), noteGroups, noteGroupIds };
}

// IDs survive transfers. Repeated imports update entries while keeping unrelated notes.
export function mergeNotes(target: NoteCollection, source: NoteCollection) {
  const current = normalizeNotes(target),
    incoming = normalizeNotes(source);
  const groups = new Map(Object.entries(current.noteGroupIds));
  for (const name of incoming.noteGroups) {
    const groupId = incoming.noteGroupIds[name];
    const oldName = [...groups].find(([, value]) => value === groupId)?.[0];
    if (oldName && oldName !== name) {
      groups.delete(oldName);
      current.notes = current.notes.map((n) => (n.group === oldName ? { ...n, group: name } : n));
    }
    groups.set(name, groupId);
  }
  const notes = new Map(current.notes.map((n) => [n.id, n]));
  for (const note of incoming.notes) notes.set(note.id, note);
  return {
    notes: [...notes.values()],
    noteGroups: [...groups.keys()],
    noteGroupIds: Object.fromEntries(groups),
  };
}
