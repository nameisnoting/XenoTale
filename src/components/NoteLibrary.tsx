import { DeleteAction } from './DeleteAction';
import { CardHeader } from './DisclosureCard';
import { requiresDeleteConfirmation } from '../domain/deletion';
import { useMemo, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { AddButton } from './AddButton';
import type { Note } from '../domain/types';
import { id } from '../domain/types';
import { normalizeNotes } from '../domain/notes';
import { ActionButton, Area, Button, Field, IconButton, Modal, TextInput, Toggle } from './UI';
import './NoteLibrary.css';
type Change = (notes: Note[], groups: string[], groupIds: Record<string, string>) => void;
function NoteCard({
  note,
  onChange,
  onDelete,
}: {
  note: Note;
  onChange: (note: Note) => void;
  onDelete: () => void;
}) {
  const [rename, setRename] = useState(false);
  return (
    <details className="note-card edit-card-typography" open>
      <CardHeader
        title={note.name}
        titleClassName="note-title"
        chevronClassName="note-chevron"
        titleContent={
          rename ? (
            <input
              aria-label="노트 이름"
              autoFocus
              value={note.name}
              maxLength={300}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...note, name: e.target.value })}
              onBlur={() => setRename(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setRename(false);
                }
              }}
            />
          ) : (
            note.name
          )
        }
      >
        <IconButton
          title="노트 이름 수정"
          onClick={(e) => {
            e.preventDefault();
            setRename(true);
          }}
        >
          <Pencil size={16} />
        </IconButton>
        <DeleteAction
          title="노트 삭제"
          name={note.name}
          className="note-delete"
          needsConfirmation={requiresDeleteConfirmation('note', note)}
          onDelete={onDelete}
        />
      </CardHeader>
      <div className="note-body">
        <Area
          size="small"
          ariaLabel="프롬프트"
          value={note.body}
          onChange={(body) => onChange({ ...note, body })}
          placeholder="자유롭게 입력해 주세요."
        />
      </div>
      <Toggle
        label="적용하기"
        value={note.enabled}
        onChange={(enabled) => onChange({ ...note, enabled })}
      />
    </details>
  );
}
function NoteGroupRow({
  name,
  notes,
  onEdit,
  onToggle,
}: {
  name: string;
  notes: Note[];
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="note-group">
      <ActionButton hover="none" className="note-group-open" onClick={onEdit}>
        <strong title={name}>{name}</strong>
        <small>노트 {notes.length}개</small>
      </ActionButton>
      <Toggle
        label={`${name} 전체 적용`}
        displayLabel="전체적용"
        disabled={!notes.length}
        value={notes.length > 0 && notes.every((n) => n.enabled)}
        onChange={onToggle}
      />
    </div>
  );
}
function NoteGroupModal({
  original,
  notes,
  groups,
  onSave,
  onDelete,
  onClose,
}: {
  original: string;
  notes: Note[];
  groups: string[];
  onSave: (name: string, ids: string[]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(original);
  const [ids, setIds] = useState(
    notes.filter((n) => n.group === original && !!original).map((n) => n.id),
  );
  const duplicate = groups.some(
    (g) =>
      g !== original &&
      g.normalize('NFKC').toLowerCase() === name.trim().normalize('NFKC').toLowerCase(),
  );
  return (
    <Modal
      title={original ? '그룹 편집' : '그룹 생성'}
      className="note-group-modal design-ui"
      onClose={onClose}
    >
      <Field label="제목">
        <TextInput
          value={name}
          onChange={setName}
          placeholder="그룹 이름을 입력해 주세요"
          maxLength={300}
        />
      </Field>
      <Field label="그룹에 노트 추가">
        <div className="note-group-options">
          {notes.map((note) => (
            <label className="group-note-option" key={note.id}>
              <input
                type="checkbox"
                aria-label={note.name}
                checked={ids.includes(note.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked ? [...ids, note.id] : ids.filter((value) => value !== note.id),
                  )
                }
              />
              <span>{note.name || '이름 없는 노트'}</span>
              {note.group && note.group !== original && <small>{note.group}에서 이동</small>}
            </label>
          ))}
          {!notes.length && (
            <p className="muted">
              아직 노트가 없습니다. 빈 그룹을 만든 뒤 노트를 추가할 수 있습니다.
            </p>
          )}
        </div>
      </Field>
      <p className="muted">포함된 노트 {ids.length}개 · 선택을 해제하면 그룹에서 제거됩니다.</p>
      {duplicate && (
        <p role="alert" className="danger-text">
          같은 이름의 그룹이 있습니다.
        </p>
      )}
      <Button
        className="primary full"
        disabled={!name.trim() || duplicate}
        onClick={() => onSave(name.trim(), ids)}
      >
        완료
      </Button>
      {original && (
        <DeleteAction
          title="노트 그룹 해제"
          name={original}
          label="그룹 해제"
          className="full"
          needsConfirmation
          description="그룹만 해제됩니다. 포함된 노트는 유지됩니다."
          onDelete={onDelete}
        />
      )}
    </Modal>
  );
}
export function NoteLibrary({
  values,
  groups: savedGroups = [],
  groupIds: savedGroupIds,
  onChange,
}: {
  values: Note[];
  groups?: string[];
  groupIds?: Record<string, string>;
  onChange: Change;
}) {
  const { noteGroups: groups, noteGroupIds: groupIds } = useMemo(
    () => normalizeNotes({ notes: values, noteGroups: savedGroups, noteGroupIds: savedGroupIds }),
    [values, savedGroups, savedGroupIds],
  );
  const emit = (notes: Note[], names: string[], identities = groupIds) =>
    onChange(
      notes,
      names,
      Object.fromEntries(
        names.map((name) => [name, Object.hasOwn(identities, name) ? identities[name] : id()]),
      ),
    );
  const [group, setGroup] = useState<string | null>(null);
  const changeNote = (note: Note) =>
    emit(
      values.map((n) => (n.id === note.id ? note : n)),
      groups,
    );
  return (
    <div className="note-library">
      <div className="note-group-heading">
        <h3>노트 그룹</h3>
        <IconButton title="노트 그룹 추가" onClick={() => setGroup('')}>
          <Plus size={16} />
        </IconButton>
      </div>
      {!groups.length && <p className="note-groups-empty">생성된 그룹이 없습니다.</p>}
      {groups.map((name) => (
        <NoteGroupRow
          key={name}
          name={name}
          notes={values.filter((n) => n.group === name)}
          onEdit={() => setGroup(name)}
          onToggle={(enabled) =>
            emit(
              values.map((n) => (n.group === name ? { ...n, enabled } : n)),
              groups,
            )
          }
        />
      ))}
      <div className="note-list">
        {values.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onChange={changeNote}
            onDelete={() =>
              emit(
                values.filter((n) => n.id !== note.id),
                groups,
              )
            }
          />
        ))}
      </div>
      <AddButton
        onClick={() =>
          emit(
            [
              ...values,
              {
                id: id(),
                name: `노트 ${values.length + 1}`,
                defaultName: `노트 ${values.length + 1}`,
                body: '',
                enabled: true,
                group: '',
              },
            ],
            groups,
          )
        }
      >
        노트 추가
      </AddButton>
      {group !== null && (
        <NoteGroupModal
          original={group}
          notes={values}
          groups={groups}
          onClose={() => setGroup(null)}
          onSave={(name, ids) => {
            emit(
              values.map((n) =>
                ids.includes(n.id)
                  ? { ...n, group: name }
                  : n.group === group
                    ? { ...n, group: '' }
                    : n,
              ),
              [...groups.filter((g) => g !== group), name],
              { ...groupIds, [name]: group ? groupIds[group] : id() },
            );
            setGroup(null);
          }}
          onDelete={() => {
            emit(
              values.map((n) => (n.group === group ? { ...n, group: '' } : n)),
              groups.filter((g) => g !== group),
            );
            setGroup(null);
          }}
        />
      )}
    </div>
  );
}
