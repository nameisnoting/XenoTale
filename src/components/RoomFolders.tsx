import { useId, useState } from 'react';
import { Folder, MoreVertical, Pin, Plus, Pencil, Trash2, Wand2 } from 'lucide-react';
import type { Profile, Room } from '../domain/types';
import { id } from '../domain/types';
import { db, changeProfile, removeFolder } from '../persistence/db';
import { saveRoomFolder } from '../persistence/collections';
import { navigate } from '../app/navigation';
import { DismissibleMenu } from './DismissibleMenu';
import { RoomListItem } from './RoomListItem';
import {
  ActionButton,
  Button,
  Confirm,
  Empty,
  Field,
  IconButton,
  Modal,
  TextInput,
  useAction,
} from './UI';
import './RoomFolders.css';

type FolderDraft = { id: string | null; name: string; roomIds: string[]; renameOnly?: boolean };

export function RoomFolders({
  profile,
  rooms,
  compact = false,
  onOpen,
}: {
  profile: Profile;
  rooms: Room[];
  compact?: boolean;
  onOpen?: () => void;
}) {
  const [opened, setOpened] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuPrefix = useId();
  const run = useAction();
  const edit = (folder: Profile['folders'][number], renameOnly = false) => {
    setDraft({
      id: folder.id,
      name: folder.name,
      roomIds: rooms.filter((r) => r.folderId === folder.id).map((r) => r.id),
      renameOnly,
    });
    setMenu(null);
  };
  const autoFolder = async () => {
    await db.transaction('rw', db.profiles, db.rooms, async () => {
      const profile = await db.profiles.get('profile');
      if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
      const mapping = new Map<string, string>();
      for (const room of await db.rooms.toArray()) {
        let folderId = mapping.get(room.work.id);
        if (!folderId) {
          const existing = profile.folders.find((f) => f.name === room.work.title);
          folderId = existing?.id ?? id();
          if (!existing)
            profile.folders.push({ id: folderId, name: room.work.title, pinned: false });
          mapping.set(room.work.id, folderId);
        }
        if (room.folderId !== folderId)
          await db.rooms.update(room.id, { folderId, revision: room.revision + 1 });
      }
      await db.profiles.put(profile);
    });
    setAuto(false);
  };
  return (
    <>
      <div className={compact ? 'sidebar-label' : 'section-title'}>
        {compact ? <span>대화 폴더</span> : <h2>대화방 폴더</h2>}
        <div className="inline-actions">
          <IconButton
            hover="none"
            title="폴더 생성"
            onClick={() => setDraft({ id: null, name: '', roomIds: [] })}
          >
            <Plus size={20} />
          </IconButton>
          <IconButton hover="none" title="자동 폴더링" onClick={() => setAuto(true)}>
            <Wand2 size={18} />
          </IconButton>
        </div>
      </div>
      <div className={`folder-list ${compact ? 'folder-list--compact' : ''}`}>
        {[...profile.folders]
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
          .map((folder) => {
            const folderRooms = rooms.filter((r) => r.folderId === folder.id);
            const menuId = `${menuPrefix}-${folder.id}`;
            return (
              <div className="folder-group" key={folder.id}>
                <div className="folder-list-row list-row">
                  <ActionButton
                    hover="none"
                    className="folder-list-open"
                    aria-expanded={opened.includes(folder.id)}
                    onClick={() =>
                      setOpened((current) =>
                        current.includes(folder.id)
                          ? current.filter((f) => f !== folder.id)
                          : [...current, folder.id],
                      )
                    }
                  >
                    <span className="folder-avatar">
                      <Folder size={compact ? 22 : 28} />
                    </span>
                    <span className="folder-list-text">
                      <span>
                        {folder.pinned && <Pin size={12} />} {folder.name}
                      </span>
                      <small>대화방 {folderRooms.length}개</small>
                    </span>
                  </ActionButton>
                  <IconButton
                    hover="none"
                    title={`${folder.name} 폴더 메뉴`}
                    aria-controls={menuId}
                    aria-haspopup="menu"
                    aria-expanded={menu === folder.id}
                    onClick={() => setMenu((current) => (current === folder.id ? null : folder.id))}
                  >
                    <MoreVertical size={20} />
                  </IconButton>
                </div>
                {menu === folder.id && (
                  <DismissibleMenu
                    id={menuId}
                    label={`${folder.name} 폴더 메뉴`}
                    onDismiss={() => setMenu(null)}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        run(
                          changeProfile((p) => {
                            const target = p.folders.find((f) => f.id === folder.id);
                            if (target) target.pinned = !target.pinned;
                          }),
                        );
                        setMenu(null);
                      }}
                    >
                      <Pin size={16} />
                      {folder.pinned ? '고정 해제' : '상단 고정'}
                    </button>
                    <button role="menuitem" onClick={() => edit(folder)}>
                      <Plus size={16} />
                      대화방 추가
                    </button>
                    <button role="menuitem" onClick={() => edit(folder, true)}>
                      <Pencil size={16} />
                      이름 변경
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDeleting(folder.id);
                        setMenu(null);
                      }}
                    >
                      <Trash2 size={16} />
                      폴더 삭제
                    </button>
                  </DismissibleMenu>
                )}
                {opened.includes(folder.id) && (
                  <div className="folder-rooms">
                    {folderRooms.map((room) => (
                      <RoomListItem
                        key={room.id}
                        room={room}
                        folders={profile.folders}
                        compact={compact}
                        onOpen={() => {
                          navigate(`/chat/${room.id}`);
                          onOpen?.();
                        }}
                      />
                    ))}
                    {!folderRooms.length && <Empty>비어 있는 폴더입니다.</Empty>}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {!profile.folders.length && <p className="sidebar-empty">생성된 폴더가 없습니다.</p>}
      {draft && (
        <Modal
          title={draft.renameOnly ? '폴더 이름 변경' : draft.id ? '대화방 추가' : '폴더 생성'}
          className="folder-editor-modal"
          onClose={() => {
            if (!saving) setDraft(null);
          }}
        >
          <fieldset className="folder-editor-fields" disabled={saving}>
            <Field label="제목">
              <TextInput
                value={draft.name}
                placeholder="폴더 제목을 입력해 주세요."
                onChange={(name) => setDraft({ ...draft, name })}
              />
            </Field>
            {!draft.renameOnly && (
              <>
                <h3 className="field-label">폴더에 대화방 추가</h3>
                <div className="folder-room-picker">
                  {rooms.map((room) => (
                    <RoomListItem
                      key={room.id}
                      room={room}
                      folders={profile.folders}
                      onOpen={() => {}}
                      selection={{
                        selected: draft.roomIds.includes(room.id),
                        onToggle: () =>
                          setDraft({
                            ...draft,
                            roomIds: draft.roomIds.includes(room.id)
                              ? draft.roomIds.filter((r) => r !== room.id)
                              : [...draft.roomIds, room.id],
                          }),
                      }}
                    />
                  ))}
                  {!rooms.length && <Empty>추가할 대화방이 없습니다.</Empty>}
                </div>
              </>
            )}
            <Button
              className="primary full"
              disabled={!draft.name.trim() || saving}
              onClick={() => {
                setSaving(true);
                const action = draft.renameOnly
                  ? changeProfile((p) => {
                      const folder = p.folders.find((f) => f.id === draft.id);
                      if (!folder) throw new Error('폴더를 찾을 수 없습니다.');
                      folder.name = draft.name.trim();
                    })
                  : saveRoomFolder(draft.id, draft.name, draft.roomIds);
                run(action.then(() => setDraft(null)).finally(() => setSaving(false)));
              }}
            >
              {saving ? '저장 중…' : '완료'}
            </Button>
          </fieldset>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="폴더 삭제"
          label="삭제"
          tone="danger"
          onClose={() => setDeleting(null)}
          onConfirm={() => run(removeFolder(deleting).then(() => setDeleting(null)))}
        >
          폴더를 삭제합니다. 폴더 안의 대화방은 삭제되지 않고 일반 목록으로 돌아갑니다.
        </Confirm>
      )}
      {auto && (
        <Modal title="자동 폴더링" className="auto-folder-modal" onClose={() => setAuto(false)}>
          <p>
            같은 작품의 대화방끼리 폴더링합니다.
            <br />
            계속하시겠습니까?
          </p>
          <div className="modal-actions">
            <Button onClick={() => setAuto(false)}>취소</Button>
            <Button className="primary" onClick={() => run(autoFolder())}>
              확인
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
