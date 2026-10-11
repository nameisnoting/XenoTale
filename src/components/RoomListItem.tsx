import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pin, Pencil, Trash2 } from 'lucide-react';
import type { Profile, Room } from '../domain/types';
import { selected } from '../domain/types';
import { db, commitRoom } from '../persistence/db';
import { ActionButton, Avatar, Button, Confirm, Field, Modal, TextInput, useAction } from './UI';
import './RoomListItem.css';
import './ListRows.css';

export function RoomListItem({
  room,
  folders,
  compact = false,
  onOpen,
  selection,
}: {
  room: Room;
  folders: Profile['folders'];
  compact?: boolean;
  onOpen: () => void;
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const last = room.timeline.filter((t) => t.kind === 'turn').at(-1);
  const preview = last
    ? selected(last).body.replace(/[*@]/g, '')
    : room.work.description || '이야기를 시작해 보세요';
  return (
    <div
      className={`room-list-item ${compact ? 'room-list-item--compact list-row' : 'manage-row'} ${selection ? 'room-list-item--selectable' : ''} ${selection?.selected ? 'is-selected' : ''}`}
    >
      <ActionButton
        hover={compact ? 'none' : 'surface'}
        className="room-list-open"
        aria-label={selection ? `${room.name} 선택` : undefined}
        aria-pressed={selection?.selected}
        onClick={selection?.onToggle ?? onOpen}
      >
        <Avatar src={room.work.characters[0]?.image} name={room.name} size={compact ? 40 : 44} />
        <span className="room-list-text">
          <span className="room-list-name">
            {room.pinned && <Pin size={compact ? 12 : 14} />} {room.name}
          </span>
          <small>{preview.slice(0, compact ? 70 : 100)}</small>
        </span>
        {selection && (
          <span className="room-selection-mark" aria-hidden="true">
            {selection.selected ? '✓' : '+'}
          </span>
        )}
      </ActionButton>
      {!selection && <RoomActions room={room} folders={folders} />}
    </div>
  );
}

function RoomActions({ room, folders }: { room: Room; folders: Profile['folders'] }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const run = useAction();
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = menu.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(innerWidth - box.width - 8, anchor.right - box.width)),
      top:
        anchor.bottom + box.height + 8 <= innerHeight
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - box.height - 4),
    });
    menu.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node))
        setOpen(false);
    };
    const close = () => setOpen(false);
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  return (
    <>
      <ActionButton
        hover="none"
        ref={trigger}
        type="button"
        className="icon-button room-menu-trigger"
        title={`${room.name} 대화방 메뉴`}
        aria-label={`${room.name} 대화방 메뉴`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreVertical size={20} />
      </ActionButton>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`${room.name} 메뉴`}
            className="room-action-menu"
            style={position}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[
                (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            }}
          >
            <button
              role="menuitem"
              onClick={() => {
                run(commitRoom({ ...room, pinned: !room.pinned }, room.revision));
                setOpen(false);
              }}
            >
              <Pin size={16} />
              {room.pinned ? '고정 해제' : '상단 고정'}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setEdit(structuredClone(room));
                setOpen(false);
              }}
            >
              <Pencil size={16} />
              이름 / 폴더 변경
            </button>
            <button
              role="menuitem"
              className="danger-text"
              onClick={() => {
                setDeleting(true);
                setOpen(false);
              }}
            >
              <Trash2 size={16} />
              삭제
            </button>
          </div>,
          document.body,
        )}
      {edit && (
        <Modal
          title="대화방 수정"
          className="room-action-dialog"
          onClose={() => {
            if (!saving) setEdit(null);
          }}
        >
          <fieldset disabled={saving} className="panel-fieldset">
            <Field label="대화방 이름">
              <TextInput value={edit.name} onChange={(name) => setEdit({ ...edit, name })} />
            </Field>
            <Field label="폴더">
              <select
                value={edit.folderId ?? ''}
                onChange={(e) => setEdit({ ...edit, folderId: e.target.value || null })}
              >
                <option value="">폴더 없음</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              className="primary full"
              disabled={!edit.name.trim()}
              onClick={() => {
                setSaving(true);
                run(
                  commitRoom({ ...edit, name: edit.name.trim() }, edit.revision)
                    .then(() => setEdit(null))
                    .finally(() => setSaving(false)),
                );
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </Button>
          </fieldset>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="대화방 삭제"
          label="삭제"
          tone="danger"
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            run(db.rooms.delete(room.id).then(() => setDeleting(false)));
          }}
        >
          ‘{room.name}’을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </Confirm>
      )}
    </>
  );
}
