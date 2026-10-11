import { useMemo, useState } from 'react';
import type { Room, Profile } from '../domain/types';
import { normalizeNotes, mergeNotes } from '../domain/notes';
import { changeProfile } from '../persistence/db';
import { NoteLibrary } from '../components/NoteLibrary';
import { Button, Modal, Empty, useAction, useNotify } from '../components/UI';
import './RoomNotes.css';

export function RoomNotes({
  room,
  profile,
  mutate,
}: {
  room: Room;
  profile: Profile;
  mutate: (fn: (r: Room) => Room) => Promise<unknown>;
}) {
  const [loading, setLoading] = useState(false),
    [picker, setPicker] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]),
    [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const run = useAction(),
    notify = useNotify();
  const ctx = room.current.context;
  const library = useMemo(() => normalizeNotes(profile), [profile]);
  const save = async () => {
    setLoading(true);
    try {
      let source = normalizeNotes(ctx);
      // Persist legacy group identities once so later renames still update the same group.
      await mutate((r) => {
        source = normalizeNotes(r.current.context);
        r.current.context.noteGroupIds = source.noteGroupIds;
        return r;
      });
      await changeProfile((p) => Object.assign(p, mergeNotes(p, source)));
      notify('마이페이지 유저노트에 저장했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const load = async () => {
    setLoading(true);
    try {
      // Read the selected snapshot. Groups include empty groups and members of selected notes.
      const notes = profile.notes.filter(
        (n) => selectedNotes.includes(n.id) || selectedGroups.includes(n.group),
      );
      const groups = library.noteGroups.filter(
        (name) => selectedGroups.includes(name) || notes.some((n) => n.group === name),
      );
      const source = normalizeNotes({
        notes,
        noteGroups: groups,
        noteGroupIds: library.noteGroupIds,
      });
      await changeProfile((p) => {
        p.noteGroupIds = { ...library.noteGroupIds, ...p.noteGroupIds };
      });
      await mutate((r) => {
        Object.assign(r.current.context, mergeNotes(r.current.context, source));
        return r;
      });
      setPicker(false);
      notify('선택한 유저노트를 불러왔습니다.');
    } finally {
      setLoading(false);
    }
  };
  const toggle = (value: string, values: string[], set: (values: string[]) => void) =>
    set(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return (
    <>
      <NoteLibrary
        values={ctx.notes}
        groups={ctx.noteGroups}
        groupIds={ctx.noteGroupIds}
        onChange={(notes, noteGroups, noteGroupIds) =>
          run(
            mutate((r) => {
              Object.assign(r.current.context, { notes, noteGroups, noteGroupIds });
              return r;
            }),
          )
        }
      />
      <div className="note-transfer-actions">
        <Button
          size="small"
          disabled={loading || (!ctx.notes.length && !ctx.noteGroups?.length)}
          onClick={() => run(save())}
        >
          저장
        </Button>
        <Button
          size="small"
          disabled={loading}
          onClick={() => {
            setSelectedNotes([]);
            setSelectedGroups([]);
            setPicker(true);
          }}
        >
          불러오기
        </Button>
      </div>
      {picker && (
        <Modal
          title="유저노트 불러오기"
          onClose={() => {
            if (!loading) setPicker(false);
          }}
          className="note-import-modal"
          density="compact"
        >
          <fieldset className="note-import-options" disabled={loading}>
            {library.noteGroups.map((name) => (
              <div className="note-import-group" key={name}>
                <label className="note-import-option">
                  <input
                    type="checkbox"
                    aria-label={`${name} 그룹 선택`}
                    checked={selectedGroups.includes(name)}
                    onChange={() => toggle(name, selectedGroups, setSelectedGroups)}
                  />
                  <strong title={name}>{name}</strong>
                  <small>노트 {profile.notes.filter((n) => n.group === name).length}개</small>
                </label>
                {profile.notes
                  .filter((n) => n.group === name)
                  .map((note) => (
                    <label className="note-import-option" key={note.id}>
                      <input
                        type="checkbox"
                        aria-label={`${note.name} 선택`}
                        checked={selectedGroups.includes(name) || selectedNotes.includes(note.id)}
                        disabled={selectedGroups.includes(name)}
                        onChange={() => toggle(note.id, selectedNotes, setSelectedNotes)}
                      />
                      <span title={note.name}>{note.name || '이름 없는 노트'}</span>
                    </label>
                  ))}
              </div>
            ))}
            {profile.notes
              .filter((n) => !n.group)
              .map((note) => (
                <label className="note-import-option" key={note.id}>
                  <input
                    type="checkbox"
                    aria-label={`${note.name} 선택`}
                    checked={selectedNotes.includes(note.id)}
                    onChange={() => toggle(note.id, selectedNotes, setSelectedNotes)}
                  />
                  <span title={note.name}>{note.name || '이름 없는 노트'}</span>
                </label>
              ))}
            {!library.noteGroups.length && !profile.notes.length && (
              <Empty>마이페이지에 저장된 유저노트가 없습니다.</Empty>
            )}
          </fieldset>
          <Button
            size="small"
            className="primary full"
            disabled={loading || (!selectedNotes.length && !selectedGroups.length)}
            onClick={() => run(load())}
          >
            불러오기
          </Button>
        </Modal>
      )}
    </>
  );
}
