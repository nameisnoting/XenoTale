import { PageHeader } from '../components/Headers';
import { SortableList } from '../components/SortableList';
import { useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Download,
  FileInput,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import type { Profile, Room, PublishedWork, Carousel, Workspace } from '../domain/types';
import { id } from '../domain/types';
import { workspace } from '../domain/defaults';
import { createRoom } from '../domain/engine';
import { db, useLive, changeProfile, removeWork, lastWorkspace } from '../persistence/db';
import { exportBackup, exportWork, readImport, applyImport } from '../persistence/files';
import { RoomListItem } from '../components/RoomListItem';
import { RoomFolders } from '../components/RoomFolders';
import { deleteCarousel, moveCarouselWork, setCarouselWorks } from '../persistence/collections';
import './Library.css';
import { WorkCard } from '../components/WorkCard';
import { developerCatalog, isRetiredSample } from '../content/developerCatalog';
import type { ImportData } from '../persistence/files';
import { navigate } from '../app/navigation';
import {
  ActionButton,
  Avatar,
  Button,
  IconButton,
  Modal,
  Confirm,
  Field,
  TextInput,
  Segmented,
  Empty,
  useAction,
  useNotify,
  Toggle,
} from '../components/UI';

export async function enterWorkspace(profile: Profile) {
  const previous = await lastWorkspace();
  if (previous) navigate(`/create/${previous.id}`);
  else await newWorkspace(profile);
}
export async function newWorkspace(
  profile: Profile,
  { newTab = false, beforeCreate }: { newTab?: boolean; beforeCreate?: () => Promise<void> } = {},
) {
  // Reserve the tab during the click gesture, before saving asynchronously.
  const tab = newTab ? window.open('about:blank', '_blank') : null;
  if (newTab && !tab)
    throw new Error('새 탭을 열지 못했습니다. 브라우저의 팝업 차단을 해제해 주세요.');
  if (tab) tab.opener = null;
  const entry = workspace(profile.nickname);
  let created = false;
  try {
    await beforeCreate?.();
    if (tab?.closed) throw new Error('새 탭이 닫혀 작업 공간을 만들지 않았습니다.');
    await db.workspaces.add(entry);
    created = true;
    if (tab) {
      if (tab.closed) throw new Error('새 탭이 닫혀 작업 공간을 만들지 않았습니다.');
      const url = new URL(window.location.href);
      url.hash = `/create/${entry.id}`;
      tab.location.replace(url.href);
    } else navigate(`/create/${entry.id}`);
    return entry;
  } catch (error) {
    tab?.close();
    if (created) await db.workspaces.delete(entry.id);
    throw error;
  }
}
export async function editPublished(entry: PublishedWork) {
  const existing = (await db.workspaces.toArray()).find((w) => w.work.id === entry.id);
  if (existing) {
    navigate(`/create/${existing.id}`);
    return;
  }
  const work: Workspace = {
    id: id(),
    work: structuredClone(entry.work),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
    publishedVersion: entry.work.version,
  };
  await db.workspaces.add(work);
  navigate(`/create/${work.id}`);
}
async function copyToWorkspace(entry: PublishedWork) {
  const value: Workspace = {
    id: id(),
    work: {
      ...structuredClone(entry.work),
      id: id(),
      version: 0,
      title: `${entry.work.title} · 복사본`,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
    publishedVersion: 0,
  };
  await db.workspaces.add(value);
  navigate(`/create/${value.id}`);
}
export function RoomSidebar({
  profile,
  mobile,
  onClose,
}: {
  profile: Profile;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const rooms = useLive(() => db.rooms.orderBy('updatedAt').reverse().toArray(), [] as Room[]);
  const unfiledRooms = rooms
    .filter(
      (room) => !room.folderId || !profile.folders.some((folder) => folder.id === room.folderId),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const row = (r: Room) => (
    <RoomListItem
      key={r.id}
      room={r}
      folders={profile.folders}
      compact
      onOpen={() => {
        navigate(`/chat/${r.id}`);
        onClose?.();
      }}
    />
  );
  return (
    <aside className={`room-sidebar ${mobile ? 'mobile-open' : ''}`}>
      <header>
        <ActionButton
          hover="none"
          className="brand"
          onClick={() => {
            navigate('/');
            onClose?.();
          }}
        >
          XenoTale
        </ActionButton>
        {onClose && (
          <IconButton title="메뉴 닫기" onClick={onClose}>
            <X size={20} />
          </IconButton>
        )}
      </header>
      <RoomFolders profile={profile} rooms={rooms} compact onOpen={onClose} />
      <div className="sidebar-label">
        <span>대화 목록</span>
        <IconButton
          hover="none"
          title="대화방 관리"
          onClick={() => {
            navigate('/rooms');
            onClose?.();
          }}
        >
          <ChevronRight size={15} />
        </IconButton>
      </div>
      {unfiledRooms.length ? (
        <div className="recent-list">{unfiledRooms.map(row)}</div>
      ) : (
        <p className="sidebar-empty">대화 내역이 없습니다.</p>
      )}
      <footer>
        <span className="local-indicator" />이 기기에 저장됩니다
      </footer>
    </aside>
  );
}
export function Library({ profile }: { profile: Profile }) {
  const storedWorks = useLive(() => db.works.toArray(), [] as PublishedWork[]);
  const works = storedWorks.filter((work) => !isRetiredSample(work));
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [deletingCarousel, setDeletingCarousel] = useState<Carousel | null>(null);
  const [savingCollection, setSavingCollection] = useState(false);
  const [adding, setAdding] = useState<Carousel | null>(null);
  const [selectedWorks, setSelectedWorks] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PublishedWork | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [includeApiKey, setIncludeApiKey] = useState(true);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = useAction();
  const notify = useNotify();
  const start = async (entry: PublishedWork) => {
    const room = createRoom(
      entry.work,
      profile.defaultModel,
      profile.personas[0] ?? entry.work.personas[0],
    );
    room.current.context.settings.summaryModelId = profile.summaryModel;
    room.initial.context.settings.summaryModelId = profile.summaryModel;
    await db.rooms.add(room);
    navigate(`/chat/${room.id}`);
  };
  const card = (
    entry: PublishedWork,
    collectionId: string,
    selection?: { selected: boolean; onToggle: () => void },
  ) => {
    const occurrence = JSON.stringify([collectionId, entry.id]);
    return (
      <WorkCard
        key={entry.id}
        entry={entry}
        menuOpen={menu === occurrence}
        onToggleMenu={() => setMenu((current) => (current === occurrence ? null : occurrence))}
        onDismissMenu={() => setMenu(null)}
        selection={selection}
        onStart={() => run(start(entry))}
        onEdit={() => {
          setMenu(null);
          run(editPublished(entry));
        }}
        onCopy={() => {
          setMenu(null);
          run(copyToWorkspace(entry));
        }}
        onExport={() => {
          exportWork(entry.work);
          setMenu(null);
        }}
        onDelete={() => {
          setDeleting(entry);
          setMenu(null);
        }}
      />
    );
  };
  const uncategorized = works.filter(
    (w) =>
      !profile.carousels.some((c) => c.workIds.includes(w.id)) &&
      !(developerCatalog.enabled && developerCatalog.workIds.includes(w.id)),
  );
  const collections: Carousel[] = [
    ...profile.carousels,
    ...(uncategorized.length
      ? [{ id: 'library-uncategorized', name: '내 작품', mode: 'slide' as const, workIds: [] }]
      : []),
    ...(developerCatalog.enabled
      ? [
          {
            id: 'library-examples',
            name: '개발자가 만든 작품들',
            mode: 'slide' as const,
            workIds: [],
          },
        ]
      : []),
  ];
  const collectionIds = [
    ...new Set([
      ...(profile.carouselOrder ?? []),
      ...collections.map((collection) => collection.id),
    ]),
  ];
  const orderedCollections = collectionIds
    .map((id) => collections.find((collection) => collection.id === id))
    .filter((collection): collection is Carousel => !!collection);
  const moveCollections = (ordered: Carousel[]) =>
    run(
      changeProfile((p) => {
        p.carouselOrder = ordered.map((collection) => collection.id);
        p.carousels.sort((a, b) => p.carouselOrder!.indexOf(a.id) - p.carouselOrder!.indexOf(b.id));
      }),
    );
  return (
    <div className="library-layout">
      <RoomSidebar profile={profile} mobile={false} />
      <main className="library-main">
        <header className="main-toolbar">
          <strong className="mobile-brand">XenoTale</strong>
          <div className="toolbar-left">
            <ActionButton aria-label="작품 가져오기" onClick={() => input.current?.click()}>
              <FileInput size={16} />
              <span>작품 가져오기</span>
            </ActionButton>
            <ActionButton
              aria-label="캐러셀 만들기"
              onClick={() => setCarousel({ id: id(), name: '', mode: 'slide', workIds: [] })}
            >
              <LayoutList size={16} />
              <span>캐러셀 만들기</span>
            </ActionButton>
            <ActionButton aria-label="백업 및 동기화" onClick={() => setBackupOpen(true)}>
              <Download size={16} />
              <span>백업 및 동기화</span>
            </ActionButton>
          </div>
          <div className="toolbar-right">
            <Button onClick={() => run(enterWorkspace(profile))}>
              <Plus size={17} />
              작품 만들기
            </Button>
            <ActionButton hover="none" aria-label="마이페이지" onClick={() => navigate('/profile')}>
              <Avatar src={profile.image} name={profile.nickname} size={34} />
            </ActionButton>
          </div>
        </header>
        <div className="library-content">
          <SortableList
            items={orderedCollections}
            itemId={(collection) => collection.id}
            itemName={(collection) => collection.name}
            onChange={moveCollections}
          >
            {(c, handle) =>
              c.id === 'library-uncategorized' ? (
                <section className="collection">
                  <div className="collection-heading">
                    <h2>내 작품</h2>
                  </div>
                  <div className="work-grid">{uncategorized.map((w) => card(w, c.id))}</div>
                </section>
              ) : c.id === 'library-examples' ? (
                <section
                  className={`collection examples ${profile.hideExamples ? 'is-hidden' : ''}`}
                >
                  <div className="collection-heading">
                    <h2>
                      {handle}
                      {profile.hideExamples ? '숨김 완료되었습니다' : '개발자가 만든 작품들'}
                      <IconButton
                        hover="none"
                        title={profile.hideExamples ? '기본 작품 표시' : '기본 작품 숨기기'}
                        onClick={() =>
                          run(changeProfile((p) => (p.hideExamples = !p.hideExamples)))
                        }
                      >
                        {profile.hideExamples ? <EyeOff size={17} /> : <Eye size={17} />}
                      </IconButton>
                    </h2>
                  </div>
                  {!profile.hideExamples && (
                    <div className="work-grid">
                      {works
                        .filter(
                          (work) =>
                            developerCatalog.workIds.includes(work.id) &&
                            !profile.carousels.some((collection) =>
                              collection.workIds.includes(work.id),
                            ),
                        )
                        .map((w) => card(w, c.id))}
                    </div>
                  )}
                </section>
              ) : (
                <section
                  className="collection"
                  key={c.id}
                  data-carousel-id={c.id}
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes('workId') ||
                      e.dataTransfer.types.includes('workid')
                    ) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    const workId = e.dataTransfer.getData('workId');
                    if (!works.some((w) => w.id === workId)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu(null);
                    run(moveCarouselWork(c.id, workId));
                  }}
                >
                  <div className="collection-heading">
                    <h2>
                      {handle}
                      {c.name}
                    </h2>
                    <div>
                      <ActionButton
                        aria-label={`${c.name} 캐러셀 삭제`}
                        onClick={() => setDeletingCarousel(c)}
                      >
                        <Trash2 size={15} />
                        캐러셀 삭제
                      </ActionButton>
                      <ActionButton onClick={() => setCarousel(structuredClone(c))}>
                        <Pencil size={15} />
                        캐러셀 수정
                      </ActionButton>
                      <ActionButton
                        onClick={() => {
                          setAdding(c);
                          setSelectedWorks([...c.workIds]);
                          setSearch('');
                        }}
                      >
                        <Plus size={17} />
                        작품 추가
                      </ActionButton>
                    </div>
                  </div>
                  <Collection
                    mode={c.mode}
                    works={c.workIds
                      .map((id) => works.find((w) => w.id === id))
                      .filter((w): w is PublishedWork => !!w)}
                    renderCard={(w) => card(w, c.id)}
                  />
                </section>
              )
            }
          </SortableList>
        </div>
      </main>
      <input
        type="file"
        accept=".json"
        hidden
        ref={input}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(readImport(f).then(setImportData));
          e.target.value = '';
        }}
      />
      {carousel && (
        <Modal
          title={
            profile.carousels.some((c) => c.id === carousel.id) ? '캐러셀 수정' : '캐러셀 만들기'
          }
          className="carousel-settings-modal"
          onClose={() => setCarousel(null)}
        >
          <Field label="캐러셀 이름">
            <TextInput
              value={carousel.name}
              placeholder="캐러셀 이름을 입력해 주세요"
              onChange={(name) => setCarousel({ ...carousel, name })}
            />
          </Field>
          <Segmented
            value={
              carousel.mode === 'slide'
                ? '슬라이드형'
                : carousel.mode === 'pages'
                  ? '2행 페이지'
                  : '위젯형'
            }
            values={['슬라이드형', '2행 페이지', '위젯형']}
            onChange={(v) =>
              setCarousel({
                ...carousel,
                mode: v === '슬라이드형' ? 'slide' : v === '2행 페이지' ? 'pages' : 'widget',
              })
            }
          />
          <div className="modal-actions">
            {profile.carousels.some((c) => c.id === carousel.id) && (
              <Button
                onClick={() => {
                  setDeletingCarousel(carousel);
                  setCarousel(null);
                }}
              >
                <Trash2 size={16} />
                캐러셀 삭제
              </Button>
            )}
            <Button
              className="primary full"
              disabled={!carousel.name.trim()}
              onClick={() => {
                run(
                  changeProfile((p) => {
                    const i = p.carousels.findIndex((c) => c.id === carousel.id);
                    if (i < 0) {
                      p.carousels.push(carousel);
                      if (p.carouselOrder) {
                        const insertion = p.carouselOrder.indexOf('library-uncategorized');
                        const fallback = p.carouselOrder.indexOf('library-examples');
                        p.carouselOrder.splice(
                          insertion >= 0
                            ? insertion
                            : fallback >= 0
                              ? fallback
                              : p.carouselOrder.length,
                          0,
                          carousel.id,
                        );
                      }
                    } else {
                      p.carousels[i].name = carousel.name;
                      p.carousels[i].mode = carousel.mode;
                    }
                  }),
                );
                setCarousel(null);
              }}
            >
              완료
            </Button>
          </div>
        </Modal>
      )}
      {adding && (
        <Modal
          title="작품 추가"
          className="work-picker-modal"
          onClose={() => {
            if (!savingCollection) {
              setAdding(null);
              setSearch('');
            }
          }}
        >
          <div className="search">
            <Search size={20} />
            <input
              aria-label="작품 검색"
              placeholder="작품 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="muted work-picker-hint">선택한 작품은 이 캐러셀로 이동합니다.</p>
          <fieldset className="work-picker-grid" disabled={savingCollection}>
            {works
              .filter((w) => w.work.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
              .map((w) =>
                card(w, 'picker', {
                  selected: selectedWorks.includes(w.id),
                  onToggle: () =>
                    setSelectedWorks((current) =>
                      current.includes(w.id)
                        ? current.filter((id) => id !== w.id)
                        : [...current, w.id],
                    ),
                }),
              )}
            {!works.some((w) =>
              w.work.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            ) && <Empty>검색 결과가 없습니다.</Empty>}
          </fieldset>
          <Button
            className="primary full"
            disabled={
              savingCollection || JSON.stringify(selectedWorks) === JSON.stringify(adding.workIds)
            }
            onClick={() => {
              setSavingCollection(true);
              run(
                setCarouselWorks(adding.id, selectedWorks)
                  .then(() => {
                    setAdding(null);
                    setSearch('');
                  })
                  .finally(() => setSavingCollection(false)),
              );
            }}
          >
            {savingCollection ? '저장 중…' : '완료'}
          </Button>
        </Modal>
      )}
      {deletingCarousel && (
        <Confirm
          title="캐러셀 삭제"
          label="삭제"
          tone="danger"
          onClose={() => setDeletingCarousel(null)}
          onConfirm={() =>
            run(deleteCarousel(deletingCarousel.id).then(() => setDeletingCarousel(null)))
          }
        >
          <p>‘{deletingCarousel.name}’ 캐러셀을 삭제합니다.</p>
          <p className="muted">
            작품과 대화방은 유지됩니다. 포함된 작품은 기본 작품 목록으로 돌아갑니다.
          </p>
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title="작품 삭제"
          label="삭제"
          tone="danger"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            run(removeWork(deleting.id));
            setDeleting(null);
          }}
        >
          <p>‘{deleting.work.title}’을 작품 목록과 모든 캐러셀에서 삭제합니다.</p>
          <p className="muted">기존 대화방과 제작 작업 공간은 유지됩니다.</p>
        </Confirm>
      )}
      {backupOpen && (
        <Modal title="백업 및 동기화" className="backup-modal" onClose={() => setBackupOpen(false)}>
          <div className="settings-list">
            <div className="backup-download-row">
              <button
                className="backup-download-action"
                onClick={() =>
                  run(
                    exportBackup({ includeApiKey }).then(() =>
                      notify('백업 파일을 내려받았습니다.'),
                    ),
                  )
                }
              >
                <Download size={20} />
                <span>
                  전체 백업 다운로드<small>작품·작업 공간·대화·개인 라이브러리</small>
                </span>
              </button>
              <Toggle label="API 키 포함" value={includeApiKey} onChange={setIncludeApiKey} />
            </div>
            <button
              onClick={() => {
                setBackupOpen(false);
                input.current?.click();
              }}
            >
              <FileInput size={20} />
              <span>
                백업 파일 가져오기<small>기존 자료를 유지하고 복사본으로 가져옵니다</small>
              </span>
            </button>
          </div>
          <p className="muted">API 키 유출에 주의해 주세요.</p>
        </Modal>
      )}
      {importData && (
        <Confirm
          title="파일 가져오기"
          label="가져오기"
          onClose={() => setImportData(null)}
          onConfirm={() => {
            run(
              applyImport(importData).then(() => {
                setImportData(null);
                notify('자료를 가져왔습니다.');
              }),
            );
          }}
        >
          <p>
            {importData.kind === 'work'
              ? importData.work.title
              : importData.kind === 'room'
                ? importData.room.name
                : importData.kind === 'workspace'
                  ? importData.workspace.work.title || '제목 없는 작업 공간'
                  : `작품 ${importData.data.works.length}개 · 작업 공간 ${importData.data.workspaces.length}개 · 대화방 ${importData.data.rooms.length}개`}
          </p>
          <p className="muted">
            현재 자료는 덮어쓰지 않습니다. 외부 미디어는 연결된 주소에서 불러옵니다.
          </p>
          {importData.kind === 'backup' && importData.data.credentials && (
            <p className="muted">백업의 API 키도 복원하며 현재 등록된 API 키를 교체합니다.</p>
          )}
        </Confirm>
      )}
    </div>
  );
}
function Collection({
  mode,
  works,
  renderCard,
}: {
  mode: Carousel['mode'];
  works: PublishedWork[];
  renderCard: (w: PublishedWork) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(works.length / 10));
  const current = Math.min(page, count - 1);
  if (!works.length)
    return (
      <Empty>
        캐러셀에 작품이 추가되지 않았습니다.
        <br />
        작품 추가 버튼으로 채워 보세요.
      </Empty>
    );
  return (
    <>
      <div className={mode === 'slide' ? 'work-slide' : 'work-grid'}>
        {(mode === 'pages' ? works.slice(current * 10, current * 10 + 10) : works).map(renderCard)}
      </div>
      {mode === 'pages' && (
        <div className="pagination">
          <IconButton
            title="이전 페이지"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <span>
            {current + 1} / {count}
          </span>
          <IconButton
            title="다음 페이지"
            disabled={current >= count - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>
      )}
    </>
  );
}

export function RoomManager({ profile }: { profile: Profile }) {
  const rooms = useLive(() => db.rooms.orderBy('updatedAt').reverse().toArray(), [] as Room[]);
  const roomRow = (r: Room) => (
    <RoomListItem
      key={r.id}
      room={r}
      folders={profile.folders}
      onOpen={() => navigate(`/chat/${r.id}`)}
    />
  );
  return (
    <div className="standalone-page room-manager design-ui">
      <PageHeader title="대화방 관리" onBack={() => navigate('/')} />
      <section>
        <RoomFolders profile={profile} rooms={rooms} />
      </section>
      <section>
        <h2>대화 목록</h2>
        {[...rooms]
          .filter((r) => !r.folderId || !profile.folders.some((f) => f.id === r.folderId))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
          .map(roomRow)}
        {!rooms.length && <Empty>아직 대화방이 없습니다.</Empty>}
      </section>
    </div>
  );
}
