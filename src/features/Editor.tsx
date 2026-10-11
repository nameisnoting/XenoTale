import { useMediaQuery } from '../components/useMediaQuery';
import { CreditBalanceButton } from '../components/CreditBalanceButton';
import { useCreditBalance } from '../components/useCreditBalance';
import { validateWork } from '../domain/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  LayoutPanelLeft,
  Plus,
  Undo2,
  Redo2,
  Download,
  Sparkles,
  MoreHorizontal,
  Pencil,
  PanelLeftClose,
  PanelRightClose,
  Trash2,
} from 'lucide-react';
import type { Profile, Workspace, Work } from '../domain/types';
import { clone } from '../domain/types';
import {
  db,
  saveWorkspace,
  publishWorkspace,
  removeWorkspaces,
  rememberWorkspace,
  useLive,
} from '../persistence/db';
import { exportWorkspace, exportBackup } from '../persistence/files';
import { navigate } from '../app/navigation';
import { EditorPanels } from './EditorPanels';
import { sections } from './creator/sections';
import { newWorkspace } from './Library';
import type { ApiProps, ModelProps } from './Profile';
import { CollapsedPanel, PanelHeader } from '../components/Headers';
import { IconRail } from '../components/IconRail';
import { PanelResizeHandles, useResizablePanels } from '../components/ResizablePanels';
import { useGraphView } from '../components/useGraphView';
import { Tabs } from '../components/Tabs';
import { CreatorTest } from './CreatorTest';
import { Assistant } from './Assistant';
import {
  Button,
  IconButton,
  Saved,
  Spinner,
  Modal,
  useNotify,
  useAction,
  safeUrl,
} from '../components/UI';
export function Editor({
  workspaceId,
  ...props
}: { workspaceId: string; profile: Profile } & ApiProps & ModelProps) {
  const entry = useLive(
    () => db.workspaces.get(workspaceId),
    null as Workspace | null | undefined,
    [workspaceId],
  );
  return entry ? (
    <EditorContent key={workspaceId} initial={entry} {...props} />
  ) : entry === undefined ? (
    <div className="fatal">
      작업 공간을 찾을 수 없습니다.<Button onClick={() => navigate('/')}>메인으로</Button>
    </div>
  ) : (
    <Spinner />
  );
}
function EditorContent({
  initial,
  profile,
  ...props
}: { initial: Workspace; profile: Profile } & ApiProps & ModelProps) {
  const balance = useCreditBalance(props.apiKey);
  const balanceButton = (
    <CreditBalanceButton
      balance={balance}
      actionLabel="잔액 새로고침"
      onClick={() => balance.refresh(true)}
    />
  );
  const [work, setWork] = useState(initial.work);
  const [relationView, setRelationView] = useGraphView(
    `xenotale.relation-view.editor.${initial.id}`,
  );
  const [openingSelection, setOpeningSelection] = useState(initial.work.openings[0].id);
  const selectedOpeningId = work.openings.some((o) => o.id === openingSelection)
    ? openingSelection
    : work.openings[0].id;
  const latest = useRef(initial);
  const queue = useRef(Promise.resolve());
  const failed = useRef(false);
  const pending = useRef(0);
  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const sectionStorageKey = `xenotale.editor-section.${initial.id}`;
  const [section, setSection] = useState(() => {
    try {
      const saved = localStorage.getItem(sectionStorageKey);
      return sections.some((item) => item.id === saved) ? saved! : 'overview';
    } catch {
      return 'overview';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(sectionStorageKey, section);
    } catch {
      // Navigation still works when browser preference storage is unavailable.
    }
  }, [sectionStorageKey, section]);
  const [sidebarView, setSidebarView] = useState<
    'workspace' | 'history' | 'references' | 'support'
  >('workspace');
  const [supportTab, setSupportTab] = useState('agent');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const panels = useResizablePanels({ layout: 'editor', leftCollapsed, rightCollapsed });
  const [rename, setRename] = useState(false);
  const [mobile, setMobile] = useState(false);
  const wide = useMediaQuery('(min-width: 1200px)');
  const sidebarSupport = useRef<HTMLDivElement>(null);
  const desktopSupport = useRef<HTMLDivElement>(null);
  const [supportRoot] = useState(() => {
    const element = document.createElement('div');
    element.className = 'editor-support-content';
    return element;
  });
  const [locked, setLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const removing = useRef(false);
  const opening = useRef(false);
  const undo = useRef<Work[]>([]);
  const redo = useRef<Work[]>([]);
  const notify = useNotify();
  useEffect(() => {
    const remember = () => {
      if (document.visibilityState === 'visible')
        void rememberWorkspace(initial.id).catch(() => {});
    };
    remember();
    window.addEventListener('focus', remember);
    return () => window.removeEventListener('focus', remember);
  }, [initial.id]);
  const run = useAction();
  const lastEdit = useRef({ time: 0, section: '' });
  const workspaces = useLive(
    () => db.workspaces.orderBy('updatedAt').reverse().toArray(),
    [] as Workspace[],
  );
  const selectedWorkspaces = workspaces.filter((w) => selectedIds.includes(w.id));
  const toggleSelection = (workspaceId: string) =>
    setSelectedIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId],
    );
  const cancelSelection = () => {
    setSelecting(false);
    setSelectedIds([]);
  };
  const changeSidebarView = (view: typeof sidebarView) => {
    if (view !== 'history') cancelSelection();
    setSidebarView(view);
  };

  useLayoutEffect(() => {
    const target = wide ? desktopSupport.current : sidebarSupport.current;
    // A stable portal root moves the same panel without remounting its inputs/history.
    target?.appendChild(supportRoot);
    return () => supportRoot.remove();
  }, [wide, supportRoot]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (pending.current || failed.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, []);
  const save = (value: Work) => {
    setWork(value);
    latest.current = { ...latest.current, work: clone(value) };
    pending.current++;
    setStatus('saving');
    const snapshot = clone(value);
    queue.current = queue.current
      .then(async () => {
        if (failed.current)
          throw new Error('먼저 현재 작업을 파일로 내보내 주세요. 자동저장이 중단되어 있습니다.');
        const saved = await saveWorkspace(
          { ...latest.current, work: snapshot },
          latest.current.revision,
        );
        latest.current = { ...saved, work: latest.current.work };
      })
      .catch((e) => {
        failed.current = true;
        notify(e.message);
      })
      .finally(() => {
        pending.current--;
        setStatus(failed.current ? 'error' : pending.current ? 'saving' : 'saved');
      });
  };
  const change = (value: Work) => {
    if (Date.now() - lastEdit.current.time > 700 || lastEdit.current.section !== section) {
      undo.current.push(clone(work));
      if (undo.current.length > 50) undo.current.shift();
    }
    lastEdit.current = { time: Date.now(), section };
    redo.current = [];
    save(value);
  };
  const flush = async () => {
    await queue.current;
    if (failed.current)
      throw new Error('자동저장에 실패했습니다. 파일 내보내기로 작업을 보관해 주세요.');
  };
  const leave = (path: string) => run(flush().then(() => navigate(path)));
  const createInTab = async () => {
    if (opening.current || locked) return;
    opening.current = true;
    setCreating(true);
    try {
      await newWorkspace(profile, { newTab: true, beforeCreate: flush });
    } finally {
      opening.current = false;
      setCreating(false);
    }
  };
  const deleteRecent = async () => {
    if (!deleteIds || removing.current) return;
    removing.current = true;
    setDeleting(true);
    setLocked(true);
    try {
      await flush();
      await removeWorkspaces(deleteIds);
      setDeleteIds(null);
      cancelSelection();
      if (!deleteIds.includes(initial.id)) await rememberWorkspace(initial.id);
      notify(`작업 공간 ${deleteIds.length}개를 삭제했습니다.`);
      if (deleteIds.includes(initial.id)) navigate('/');
    } finally {
      removing.current = false;
      setDeleting(false);
      setLocked(false);
    }
  };
  let readyToPublish = true;
  try {
    validateWork(work, true);
  } catch {
    readyToPublish = false;
  }
  const publish = async () => {
    setLocked(true);
    try {
      await flush();
      const saved = await publishWorkspace(initial.id);
      latest.current = saved;
      setWork(saved.work);
      notify(`작품 v${saved.publishedVersion}을 내 라이브러리에 반영했습니다.`);
    } finally {
      setLocked(false);
    }
  };
  return (
    <div
      ref={panels.root}
      style={panels.style}
      className={`editor-shell design-ui resizable-panel-layout ${leftCollapsed ? 'editor-left-collapsed' : ''} ${rightCollapsed ? 'editor-right-collapsed' : ''}`}
    >
      <PanelResizeHandles panels={panels} />
      <aside className={`editor-workspace ${mobile ? 'mobile-open' : ''}`}>
        <header>
          {rename ? (
            <input
              aria-label="작업 제목"
              value={work.title}
              autoFocus
              onChange={(e) => change({ ...work, title: e.target.value })}
              onBlur={() => setRename(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setRename(false);
              }}
            />
          ) : (
            <strong>{work.title || '작업 제목'}</strong>
          )}
          <IconButton title="작업 제목 수정" onClick={() => setRename(true)}>
            <Pencil size={18} />
          </IconButton>
          <IconButton
            title="제작 메뉴 닫기"
            onClick={() => {
              if (!window.matchMedia('(max-width: 800px)').matches)
                setLeftCollapsed(!leftCollapsed);
              setMobile(false);
            }}
          >
            <PanelLeftClose size={20} />
          </IconButton>
        </header>
        <div className="editor-workspace-body">
          <IconRail
            label="제작 기능 메뉴"
            className="editor-rail"
            items={[
              {
                id: 'workspace',
                label: '작업공간',
                icon: 'wrench',
                active: sidebarView === 'workspace',
                onClick: () => {
                  changeSidebarView('workspace');
                  setLeftCollapsed(false);
                },
              },
              {
                id: 'history',
                label: '작업내역',
                icon: 'list',
                active: sidebarView === 'history',
                onClick: () => {
                  changeSidebarView('history');
                  setLeftCollapsed(false);
                },
              },
              {
                id: 'references',
                label: '작품참고',
                icon: 'graduation-cap',
                active: sidebarView === 'references',
                onClick: () => {
                  changeSidebarView('references');
                  setLeftCollapsed(false);
                },
              },
              {
                id: 'backup',
                label: '전체백업',
                icon: 'file-signature',
                onClick: () => run(exportBackup()),
              },
              {
                id: 'support',
                label: '제작 서포터',
                icon: <Sparkles />,
                className: 'support-mobile',
                active: sidebarView === 'support',
                onClick: () => {
                  changeSidebarView('support');
                  setLeftCollapsed(false);
                },
              },
            ]}
          />
          <aside
            className={`editor-nav ${mobile ? 'mobile-open' : ''} ${!wide && sidebarView === 'support' ? 'show-support' : ''}`}
          >
            <div className="editor-sidebar-support" hidden={wide || sidebarView !== 'support'}>
              <div className="nav-heading">
                <strong>제작 서포터</strong>
                {balanceButton}
              </div>
              <div ref={sidebarSupport} className="editor-support-slot" />
            </div>
            <>
              <div className="nav-heading">
                <strong>
                  {sidebarView === 'history'
                    ? '최근 작업'
                    : sidebarView === 'references'
                      ? '작품참고'
                      : '작업공간'}
                </strong>
                <div className="workspace-actions">
                  {sidebarView === 'history' && (
                    <IconButton
                      title={selecting ? '선택한 작업 공간 삭제' : '작업 공간 선택 삭제'}
                      aria-pressed={selecting}
                      disabled={
                        locked ||
                        creating ||
                        (selecting ? !selectedWorkspaces.length : !workspaces.length)
                      }
                      onClick={() =>
                        selecting
                          ? setDeleteIds(selectedWorkspaces.map((w) => w.id))
                          : setSelecting(true)
                      }
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  )}
                  <IconButton
                    title="새 작업 공간"
                    disabled={locked || creating}
                    onClick={() => run(createInTab())}
                  >
                    <Plus size={18} />
                  </IconButton>
                </div>
              </div>
              {sidebarView === 'references' ? (
                <div className="reference-panel">
                  <p className="muted">저장한 설정 자료를 현재 작품에 추가할 수 있습니다.</p>
                  {profile.savedLore.map((l) => (
                    <Button
                      className="full"
                      key={l.id}
                      onClick={() => {
                        change({
                          ...work,
                          lore: [
                            ...work.lore,
                            ...clone(l.entries).map((e) => ({ ...e, id: crypto.randomUUID() })),
                          ],
                        });
                        notify('로어북을 추가했습니다.');
                      }}
                    >
                      {l.name} · 로어북
                    </Button>
                  ))}
                  {profile.savedCharacters.map((g) => (
                    <Button
                      className="full"
                      key={g.id}
                      onClick={() => {
                        change({
                          ...work,
                          characters: [
                            ...work.characters,
                            ...clone(g.characters).map((c) => ({
                              ...c,
                              id: crypto.randomUUID(),
                              lore: c.lore.map((l) => ({ ...l, id: crypto.randomUUID() })),
                            })),
                          ],
                        });
                        notify('캐릭터를 추가했습니다.');
                      }}
                    >
                      {g.name} · 캐릭터
                    </Button>
                  ))}
                </div>
              ) : sidebarView === 'history' ? (
                <>
                  {selecting && (
                    <div className="workspace-selection-tools">
                      <label>
                        <input
                          type="checkbox"
                          aria-label="작업 공간 전체 선택"
                          checked={
                            workspaces.length > 0 && selectedWorkspaces.length === workspaces.length
                          }
                          ref={(input) => {
                            if (input)
                              input.indeterminate =
                                selectedWorkspaces.length > 0 &&
                                selectedWorkspaces.length < workspaces.length;
                          }}
                          onChange={(event) =>
                            setSelectedIds(event.target.checked ? workspaces.map((w) => w.id) : [])
                          }
                        />
                        전체 선택
                      </label>
                      <button className="text-button" onClick={cancelSelection}>
                        취소
                      </button>
                      <small>{selectedWorkspaces.length}개 선택</small>
                    </div>
                  )}
                  <div className="recent-workspaces">
                    {workspaces.map((w) => {
                      const contents = (
                        <>
                          <span className="workspace-thumb">
                            {w.work.cover ? (
                              <img src={safeUrl(w.work.cover)} alt="" />
                            ) : (
                              <LayoutPanelLeft />
                            )}
                          </span>
                          <span>
                            {w.work.title || '제목 없음'}
                            <small>{new Date(w.updatedAt).toLocaleString('ko-KR')}</small>
                          </span>
                        </>
                      );
                      return selecting ? (
                        <label
                          key={w.id}
                          className={`workspace-row ${selectedIds.includes(w.id) ? 'active' : ''}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${w.work.title || '제목 없음'} 선택`}
                            checked={selectedIds.includes(w.id)}
                            onChange={() => toggleSelection(w.id)}
                          />
                          {contents}
                        </label>
                      ) : (
                        <button
                          className={`workspace-row ${w.id === initial.id ? 'active' : ''}`}
                          key={w.id}
                          onClick={() => leave(`/create/${w.id}`)}
                        >
                          {contents}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                sections.map((s) => (
                  <button
                    key={s.id}
                    className={section === s.id ? 'active' : ''}
                    onClick={() => {
                      setSection(s.id);
                      setMobile(false);
                    }}
                  >
                    {s.name}
                    {s.required && <i> *</i>}
                  </button>
                ))
              )}
            </>
          </aside>
        </div>
      </aside>
      <main className="editor-main">
        <header className="editor-header">
          <IconButton title="메인으로" onClick={() => leave('/')}>
            <ArrowLeft size={20} />
          </IconButton>
          <div className="editor-title">
            <strong>작품 만들기</strong>
            <Saved status={status} />
          </div>
          <div className="inline-actions">
            {rightCollapsed && (
              <IconButton
                className="supporter-reopen"
                title="제작 서포터 펼치기"
                onClick={() => setRightCollapsed(false)}
              >
                <Sparkles size={18} />
              </IconButton>
            )}
            <IconButton
              title="실행 취소"
              disabled={!undo.current.length || locked}
              onClick={() => {
                const v = undo.current.pop()!;
                redo.current.push(clone(work));
                save(v);
              }}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              title="다시 실행"
              disabled={!redo.current.length || locked}
              onClick={() => {
                const v = redo.current.pop()!;
                undo.current.push(clone(work));
                save(v);
              }}
            >
              <Redo2 size={18} />
            </IconButton>
            <IconButton
              className="editor-export"
              title="작품 파일 내보내기"
              onClick={() => exportWorkspace({ ...latest.current, work })}
            >
              <Download size={20} />
            </IconButton>
            <Button
              className="primary"
              disabled={locked || status === 'error' || !readyToPublish}
              onClick={() => run(publish())}
            >
              제작완료
            </Button>
          </div>
        </header>
        <nav className="editor-mobile-stages" aria-label="모바일 제작 단계">
          <Tabs
            label="제작 단계"
            scrollable
            items={sections.map((item) => ({
              id: item.id,
              label: (
                <>
                  {item.name}
                  {item.required && <span className="required"> *</span>}
                </>
              ),
            }))}
            value={section}
            onChange={setSection}
          />
          <IconButton title="제작 도구" onClick={() => setMobile(!mobile)}>
            <MoreHorizontal size={20} />
          </IconButton>
        </nav>
        <fieldset disabled={locked} className="editor-fieldset">
          <EditorPanels
            key={section}
            section={section}
            work={work}
            onChange={change}
            profile={profile}
            selectedOpeningId={selectedOpeningId}
            onOpeningSelect={setOpeningSelection}
            relationView={{ view: relationView, onViewChange: setRelationView }}
          />
        </fieldset>
      </main>
      {rightCollapsed && (
        <CollapsedPanel title="제작 서포터" onExpand={() => setRightCollapsed(false)} />
      )}
      <aside className="assistant-desktop">
        <PanelHeader
          className="assistant-top"
          title="제작 서포터"
          leading={
            <IconButton
              title="제작 서포터 접기"
              aria-expanded={true}
              onClick={() => setRightCollapsed(true)}
            >
              <PanelRightClose size={20} />
            </IconButton>
          }
        >
          {balanceButton}
        </PanelHeader>
        <div ref={desktopSupport} className="editor-support-slot" />
      </aside>
      {createPortal(
        <>
          <Tabs
            label="제작 서포터 탭"
            items={[
              { id: 'agent', label: 'AI 에이전트' },
              { id: 'test', label: '대화 테스트' },
            ]}
            value={supportTab}
            onChange={setSupportTab}
          />
          <div className="editor-support-pane" hidden={supportTab !== 'agent'}>
            <Assistant
              work={work}
              onRequestComplete={balance.refresh}
              onChange={(next) => {
                // A multi-section AI application is one separate undo transaction.
                lastEdit.current.time = 0;
                change(next);
                lastEdit.current.time = 0;
              }}
              profile={profile}
              {...props}
            />
          </div>
          <div className="editor-support-pane" hidden={supportTab !== 'test'}>
            <CreatorTest
              work={work}
              onRequestComplete={balance.refresh}
              profile={profile}
              openingId={selectedOpeningId}
              onOpeningChange={setOpeningSelection}
              {...props}
            />
          </div>
        </>,
        supportRoot,
      )}
      {deleteIds && (
        <Modal
          title="선택한 작업 공간 삭제"
          onClose={() => {
            if (!removing.current) setDeleteIds(null);
          }}
        >
          <p>선택한 작업 공간 {deleteIds.length}개를 삭제합니다.</p>
          <ul className="workspace-delete-list">
            {deleteIds.map((workspaceId) => (
              <li key={workspaceId}>
                {workspaces.find((w) => w.id === workspaceId)?.work.title || '제목 없음'}
              </li>
            ))}
          </ul>
          {deleteIds.includes(initial.id) && <p>현재 열려 있는 작업도 삭제됩니다.</p>}
          <p>삭제한 작업 공간은 복구할 수 없습니다.</p>
          <p className="muted">제작 완료한 작품과 대화방은 유지됩니다.</p>
          <div className="modal-actions">
            <Button disabled={deleting} onClick={() => setDeleteIds(null)}>
              취소
            </Button>
            <Button className="primary" disabled={deleting} onClick={() => run(deleteRecent())}>
              {deleting ? '삭제 중…' : '선택 삭제'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
