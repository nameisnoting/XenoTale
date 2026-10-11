import { useChatSession, CONTINUE } from './chat/useChatSession';
import { useMediaQuery } from '../components/useMediaQuery';
import { MessageInput } from '../components/MessageInput';
import { SendButton } from '../components/SendButton';
import { BackgroundMusic } from '../components/BackgroundMusic';
import { ResizableComposer } from '../components/ResizableComposer';
import { PanelResizeHandles, useResizablePanels } from '../components/ResizablePanels';
import { StoryIntro } from '../components/StoryIntro';
import { WorkInfoPrompt } from '../components/WorkInfoPrompt';
import { CandidatePager } from '../components/CandidatePager';
import { useScrollHeader } from '../components/useScrollHeader';

import { CreditBalanceButton } from '../components/CreditBalanceButton';
import { BottomSheet, SideDrawer, MobilePage } from '../components/MobileSurfaces';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  ListPlus,
  PanelRightOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  GitBranch,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import type { Profile, Room, Turn } from '../domain/types';
import { clone, selected } from '../domain/types';
import {
  editTurnText,
  createRoom,
  deleteLast,
  effectiveStatus,
  availableChapters,
  switchCandidate,
} from '../domain/engine';
import { db, useLive } from '../persistence/db';
import { demoModel } from '../engine/openrouter';

import { navigate, navigateBack } from '../app/navigation';
import {
  ActionButton,
  Button,
  IconButton,
  Spinner,
  Modal,
  Confirm,
  Field,
  Area,
  Markdown,
  Avatar,
  safeUrl,
  useAction,
} from '../components/UI';
import { ModelPicker } from '../components/ModelPicker';
import type { ApiProps, ModelProps } from './Profile';
import { ChatPanel, chatMenus, chatMenuGroups, initialPanelSelection } from './ChatPanels';
import { useGraphView } from '../components/useGraphView';
import { ChatWorkspace, ConversationLog, ChatLogHeader } from './ChatWorkspace';
import { CollapsedPanel, PanelHeader } from '../components/Headers';
import { ChatShortcuts } from './ChatShortcuts';
import { ChatUsage } from './ChatUsage';
import { exportBackup } from '../persistence/files';
import { StatusDisplay } from '../components/DesignControls';
import { StoryBody, type EffectRequest } from './StoryBody';
import { EffectPlayer } from '../components/EffectPlayer';
import { canCompleteEffect, completeEffect } from '../domain/effects';

export function Chat({
  roomId,
  ...props
}: { roomId: string; pagePanel?: string; profile: Profile } & ApiProps & ModelProps) {
  const room = useLive(() => db.rooms.get(roomId), undefined as Room | undefined, [roomId]);
  return room ? (
    <ChatContent key={room.id} room={room} {...props} />
  ) : (
    <div className="fatal">
      <Spinner text="대화방 불러오는 중…" />
      <Button onClick={() => navigate('/')}>메인으로</Button>
    </div>
  );
}
function ChatContent({
  room: persistedRoom,
  profile,
  models,
  loadingModels,
  refreshModels,
  resolveModel,
  apiKey,
  pagePanel,
}: { room: Room; pagePanel?: string; profile: Profile } & ApiProps & ModelProps) {
  const {
    room,
    input,
    setInput,
    busy,
    phase,
    balance,
    mutate,
    send,
    summarize,
    makeBranch,
    cancel,
  } = useChatSession({ persistedRoom, resolveModel, apiKey });

  const [panel, setPanel] = useState('info');
  const [panelSelection, setPanelSelection] = useState(() => {
    const selection = initialPanelSelection(room.work);
    if (pagePanel === 'guide') selection.infoTab = 'guide';
    return selection;
  });
  const [relationView, setRelationView] = useGraphView(
    `xenotale.relation-view.chat.${persistedRoom.id}`,
  );
  const mobile = useMediaQuery('(max-width: 800px)');
  const wide = useMediaQuery('(min-width: 1200px)');
  const [collapsed, setCollapsed] = useState(false);
  const pageMenu = chatMenus.find(
    (menu) => menu.id === (pagePanel === 'guide' ? 'info' : pagePanel),
  );
  const activePanel = pageMenu?.id ?? panel;
  const [logHidden, setLogHidden] = useState(false);
  const panels = useResizablePanels({
    layout: 'chat',
    leftCollapsed: collapsed,
    rightCollapsed: !wide || logHidden,
  });
  const [rightView, setRightView] = useState<'log' | 'usage'>('log');
  const [renaming, setRenaming] = useState(false);
  const [roomName, setRoomName] = useState(room.name);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [sheet, setSheet] = useState(false);
  const [log, setLog] = useState(false);
  const [picker, setPicker] = useState<'chat' | 'summary' | null>(null);
  const [reroll, setReroll] = useState(false);
  const [directive, setDirective] = useState('');
  const [del, setDel] = useState(false);
  const [branch, setBranch] = useState<{ eventId: string; candidateId?: string } | null>(null);
  const [viewedCandidate, setViewedCandidate] = useState<{
    turnId: string;
    candidateId: string;
  } | null>(null);
  const [editing, setEditing] = useState<{
    turn: Turn;
    kind: 'user' | 'assistant';
    body: string;
    candidateId?: string;
  } | null>(null);
  const [effect, setEffect] = useState<EffectRequest | null>(null);
  const [opening, setOpening] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const headerHidden = useScrollHeader(scroll) && !renaming;

  const run = useAction();

  useEffect(() => {
    if (pagePanel !== 'guide') return;
    setPanelSelection((previous) => ({ ...previous, infoTab: 'guide' }));
    navigate(`/chat/${room.id}/panel/info`, true);
  }, [pagePanel, room.id]);

  const cfg = room.current.context.settings;
  const active = cfg.modelId === 'demo' ? demoModel : models.find((m) => m.id === cfg.modelId);
  const op = room.work.openings.find((o) => o.id === room.openingId)!;
  const bgm = safeUrl(op.bgm.trim());

  useEffect(() => {
    // Open at the latest conversation once; new responses never move the reader.
    if (mobile && !room.timeline.length) scroll.current?.scrollTo({ top: 0 });
    else end.current?.scrollIntoView({ block: 'end' });
  }, []);

  const findModel = (modelId: string) =>
    modelId === 'demo' ? demoModel : models.find((m) => m.id === modelId);

  const choose = (turn: Turn, index: number) => {
    const candidate = turn.candidates[index];
    if (!candidate || !canBrowseLatest || latestTurn?.id !== turn.id) return;
    if (room.timeline.at(-1)?.id === turn.id) {
      setViewedCandidate(null);
      run(mutate((r) => switchCandidate(r, turn.id, candidate.id)));
    } else {
      // Reading an alternative must not discard subsequent enhancement/chapter progress.
      setViewedCandidate({ turnId: turn.id, candidateId: candidate.id });
    }
  };
  const latestTurn = [...room.timeline]
    .reverse()
    .find((event): event is Turn => event.kind === 'turn');
  const canBrowseLatest =
    !!latestTurn &&
    !room.timeline
      .slice(room.timeline.findIndex((event) => event.id === latestTurn.id) + 1)
      .some((event) => event.kind === 'chapter' || event.kind === 'effect');
  const displayed = (turn: Turn) =>
    canBrowseLatest &&
    latestTurn?.id === turn.id &&
    room.timeline.at(-1)?.id !== turn.id &&
    viewedCandidate?.turnId === turn.id
      ? (turn.candidates.find((candidate) => candidate.id === viewedCandidate.candidateId) ??
        selected(turn))
      : selected(turn);
  const edit = async () => {
    if (!editing || !editing.body.trim()) return;
    await mutate((r) =>
      editTurnText(r, editing.turn.id, editing.kind, editing.body, editing.candidateId),
    );
    setEditing(null);
  };
  const showMenu = (value: string, asPage = false) => {
    setSheet(false);
    const target = value === 'guide' ? 'info' : value;
    if (value === 'guide') setPanelSelection((previous) => ({ ...previous, infoTab: 'guide' }));
    else if (mobile && value === 'info')
      setPanelSelection((previous) => ({ ...previous, infoTab: 'work' }));
    if (mobile && asPage) {
      setPanel(target);
      navigate(`/chat/${room.id}/panel/${target}`);
      return;
    }
    if (target === 'usage') {
      setRightView('usage');
      setLogHidden(false);
      if (!wide) setLog(true);
      return;
    }
    setPanel(target);
    setCollapsed(false);
    if (mobile || pageMenu) navigate(`/chat/${room.id}/panel/${target}`, !mobile);
  };
  const balanceButton = <CreditBalanceButton balance={balance} onClick={() => showMenu('usage')} />;
  const newRoom = () =>
    run(
      (async () => {
        const next = createRoom(room.work, profile.defaultModel);
        next.current.context.settings.summaryModelId = profile.summaryModel;
        next.initial.context.settings.summaryModelId = profile.summaryModel;
        await db.rooms.add(next);
        navigate(`/chat/${next.id}`);
      })(),
    );
  const logContent = (
    <ConversationLog
      room={room}
      onJump={(eventId) => {
        if (eventId.startsWith('opening:'))
          scroll.current?.scrollTo({ top: 0, behavior: 'smooth' });
        document
          .getElementById(`event-${eventId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setLog(false);
      }}
      onChapter={() => {
        setLog(false);
        showMenu('chapters');
      }}
    />
  );
  const panelContent = (
    <fieldset disabled={busy} className="panel-fieldset">
      {activePanel === 'usage' ? (
        <ChatUsage room={room} balance={balance} />
      ) : (
        <ChatPanel
          key={activePanel}
          panel={activePanel}
          selection={panelSelection}
          onSelectionChange={(patch) =>
            setPanelSelection((selection) => ({ ...selection, ...patch }))
          }
          relationView={{ view: relationView, onViewChange: setRelationView }}
          summaryModelName={findModel(cfg.summaryModelId)?.name}
          room={room}
          profile={profile}
          mutate={mutate}
          summarize={(long) => void summarize(long)}
          chooseSummaryModel={() => {
            refreshModels();
            setPicker('summary');
          }}
        />
      )}
    </fieldset>
  );
  const insertNarration = () => {
    const field = composerRef.current;
    const start = field?.selectionStart ?? input.length;
    const stop = field?.selectionEnd ?? start;
    setInput(input.slice(0, start) + '*' + input.slice(start, stop) + '*' + input.slice(stop));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + 1, stop + 1);
    });
  };
  const last = room.timeline.at(-1);
  const endingLocked =
    !!room.current.runtime.ending && !room.current.runtime.ending.allowAfterstory;
  const inputDisabled = busy || endingLocked;
  const suggestions = last?.kind === 'turn' ? selected(last).choices : !last ? op.suggestions : [];
  return (
    <div
      ref={panels.root}
      style={panels.style}
      className={`chat-shell design-ui resizable-panel-layout ${collapsed ? 'left-collapsed' : ''} ${!wide || logHidden ? 'right-collapsed' : ''}`}
    >
      <PanelResizeHandles panels={panels} />
      {!mobile && (
        <ChatWorkspace
          panel={activePanel}
          collapsed={collapsed}
          onSelect={showMenu}
          onToggle={() => setCollapsed(!collapsed)}
          onBackup={() => run(exportBackup())}
          onNew={newRoom}
        >
          {panelContent}
        </ChatWorkspace>
      )}
      <main className={`chat-main ${mobile && pageMenu ? 'is-page-covered' : ''}`}>
        <header
          className={`chat-header ${headerHidden ? 'is-scroll-hidden' : ''}`}
          inert={headerHidden}
          aria-hidden={headerHidden}
        >
          <IconButton title="메인으로" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </IconButton>
          <div className="chat-room-name">
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    mutate((r) => {
                      r.name = roomName.trim() || r.work.title;
                      return r;
                    }),
                  );
                  setRenaming(false);
                }}
              >
                <input
                  aria-label="대화방 이름"
                  autoFocus
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
                <IconButton title="이름 저장" type="submit">
                  <Check size={18} />
                </IconButton>
                <IconButton title="이름 수정 취소" onClick={() => setRenaming(false)}>
                  <X size={18} />
                </IconButton>
              </form>
            ) : (
              <>
                <strong>{room.name}</strong>
                <IconButton
                  title="대화방 이름 수정"
                  onClick={() => {
                    setRoomName(room.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil size={18} />
                </IconButton>
              </>
            )}
          </div>
          {bgm && <BackgroundMusic key={bgm} src={bgm} />}
          {(mobile || !wide) && (
            <IconButton
              title="대화 로그"
              onClick={() => {
                setRightView('log');
                setLog(true);
              }}
            >
              {mobile ? <MoreVertical size={21} /> : <PanelRightOpen size={21} />}
            </IconButton>
          )}
        </header>
        {availableChapters(room.work, room.current.runtime).length > 0 && (
          <button className="chapter-unlock" onClick={() => showMenu('chapters')}>
            챕터 해금 ·{' '}
            {availableChapters(room.work, room.current.runtime)
              .map((c) => c.name)
              .join(', ')}
            <ChevronRight size={16} />
          </button>
        )}
        <div className="chat-scroll" ref={scroll}>
          <div
            className="chat-column"
            style={
              {
                fontSize: cfg.fontSize,
                lineHeight: `${cfg.lineHeight}px`,
                letterSpacing: `${cfg.letterSpacing}px`,
              } as CSSProperties
            }
          >
            <section className="chat-message-section opening-scene">
              {mobile && !room.timeline.length && (
                <WorkInfoPrompt onOpen={() => showMenu('info', true)} />
              )}
              <StoryIntro title={op.name}>
                <StoryBody
                  body={op.body}
                  room={room}
                  disabled={busy}
                  source={{ eventId: `opening:${room.openingId}` }}
                  onEffect={setEffect}
                />
              </StoryIntro>
            </section>
            {room.timeline.map((event, index) =>
              event.kind === 'turn' ? (
                <article className="conversation-turn" id={`event-${event.id}`} key={event.id}>
                  <section className="chat-message-section user-section">
                    <div className="user-message">
                      {cfg.profiles && (
                        <Avatar src={event.before.context.persona.image} size={56} />
                      )}
                      <div>
                        <strong>{event.before.context.persona.name}</strong>
                        <Markdown>
                          {event.input === CONTINUE ? '이어서 내용 전개' : event.input}
                        </Markdown>
                      </div>
                      <IconButton
                        title="입력 수정"
                        disabled={busy}
                        onClick={() => setEditing({ turn: event, kind: 'user', body: event.input })}
                      >
                        <Pencil size={13} />
                      </IconButton>
                    </div>
                  </section>
                  <section className="chat-message-section assistant-section">
                    {event.dice && <div className="local-event">주사위 d20 · {event.dice}</div>}
                    <StoryBody
                      body={displayed(event).body}
                      room={room}
                      checkpoint={displayed(event).checkpoint}
                      disabled={busy}
                      source={{ eventId: event.id, candidateId: displayed(event).id }}
                      onEffect={setEffect}
                    />
                    <StatusDisplay
                      work={room.work}
                      runtime={displayed(event).checkpoint.runtime}
                      expanded={cfg.statusExpanded}
                      demo={displayed(event).usage.model === 'demo'}
                    />
                    <div className="response-tools">
                      {canBrowseLatest && event.id === latestTurn?.id && (
                        <CandidatePager
                          turn={event}
                          candidateId={displayed(event).id}
                          disabled={busy}
                          onChoose={(index) => choose(event, index)}
                        />
                      )}
                      <IconButton
                        title="대사 수정"
                        disabled={busy}
                        onClick={() =>
                          setEditing({
                            turn: event,
                            kind: 'assistant',
                            body: displayed(event).body,
                            candidateId: displayed(event).id,
                          })
                        }
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        title="이 지점에서 분기"
                        disabled={busy}
                        onClick={() =>
                          setBranch({ eventId: event.id, candidateId: displayed(event).id })
                        }
                      >
                        <GitBranch size={15} />
                      </IconButton>
                      {index === room.timeline.length - 1 && (
                        <>
                          <IconButton
                            title="리롤"
                            disabled={busy}
                            onClick={() => (cfg.rerollPrompt ? setReroll(true) : void send(true))}
                          >
                            <RefreshCw size={15} />
                          </IconButton>
                          <IconButton
                            title="마지막 대화 삭제"
                            disabled={busy}
                            onClick={() => setDel(true)}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </section>
                </article>
              ) : event.kind === 'chapter' ? (
                <article
                  className="chapter-scene chat-message-section"
                  id={`event-${event.id}`}
                  key={event.id}
                >
                  <StoryIntro
                    title={
                      room.work.chapters.find((c) => c.id === event.after.runtime.nodeId)?.name ??
                      '챕터'
                    }
                  >
                    <StoryBody
                      body={event.body}
                      room={room}
                      checkpoint={event.after}
                      disabled={busy}
                      source={{ eventId: event.id }}
                      onEffect={setEffect}
                    />
                  </StoryIntro>
                  <div className="response-tools">
                    <IconButton
                      title="이 지점에서 분기"
                      disabled={busy}
                      onClick={() => setBranch({ eventId: event.id })}
                    >
                      <GitBranch size={15} />
                    </IconButton>
                  </div>
                </article>
              ) : null,
            )}
            {busy && (
              <div className="generation-status" role="status">
                <span className="pulse" />
                {phase}
              </div>
            )}
            <div ref={end} />
          </div>
        </div>
        <footer className="chat-footer">
          <div className="chat-column">
            <div className="status-strip" hidden>
              {room.work.statuses.map((s) => (
                <span key={s.id}>
                  {s.name}
                  <strong data-testid={`status-${s.id}`}>
                    {effectiveStatus(room.work, room.current.runtime, s.id)}
                    {s.unit}
                  </strong>
                </span>
              ))}
            </div>
            {!inputDisabled && cfg.choices && suggestions.filter(Boolean).length > 0 && (
              <div className="suggestions">
                {suggestions.filter(Boolean).map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {!room.timeline.length && (
              <div className="opening-actions">
                <Button onClick={() => showMenu('persona')}>페르소나 변경</Button>
                <Button onClick={() => setOpening(true)}>도입부 변경</Button>
              </div>
            )}
            <ResizableComposer>
              <MessageInput
                ref={composerRef}
                aria-label="메시지"
                placeholder={
                  endingLocked
                    ? '이 이야기는 끝났습니다. 이전 대화에서 분기할 수 있습니다.'
                    : '메시지를 입력하세요. 비워 두고 전송하면 이야기가 이어집니다.'
                }
                rows={2}
                value={endingLocked ? '' : input}
                disabled={inputDisabled}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (!inputDisabled) void send();
                  }
                }}
              />
              <div className="composer-controls">
                <IconButton
                  className="mobile-only"
                  title="대화 메뉴"
                  onClick={() => setSheet(true)}
                >
                  <Plus size={23} />
                </IconButton>
                <div className="composer-shortcuts">
                  <button
                    title="지문 삽입"
                    aria-label="지문 삽입"
                    disabled={inputDisabled}
                    onClick={insertNarration}
                  >
                    *
                  </button>
                  <ChatShortcuts
                    creator={room.work.shortcuts}
                    user={room.current.context.shortcuts ?? []}
                    disabled={inputDisabled}
                    onSelect={(name) => {
                      const text =
                        `/${name} ` +
                        (input.startsWith('/') ? input.replace(/^\/\S*\s?/, '') : input);
                      setInput(text);
                      requestAnimationFrame(() => {
                        composerRef.current?.focus();
                        composerRef.current?.setSelectionRange(text.length, text.length);
                      });
                    }}
                    onAdd={(shortcut) =>
                      mutate((r) => {
                        r.current.context.shortcuts = [
                          ...(r.current.context.shortcuts ?? []),
                          shortcut,
                        ];
                        return r;
                      })
                    }
                  />
                  <button
                    aria-label="추천 선택지 표시"
                    aria-pressed={cfg.choices}
                    onClick={() =>
                      run(
                        mutate((r) => {
                          r.current.context.settings.choices = !r.current.context.settings.choices;
                          return r;
                        }),
                      )
                    }
                  >
                    <ListPlus size={21} />
                  </button>
                </div>
                <div className="grow" />
                <ActionButton
                  className="model-trigger"
                  disabled={busy}
                  onClick={() => {
                    refreshModels();
                    setPicker('chat');
                  }}
                >
                  {cfg.modelId === 'demo' ? '예시 대화' : (active?.name ?? cfg.modelId)}
                  <ChevronDown size={13} />
                </ActionButton>
                <SendButton
                  busy={busy}
                  disabled={endingLocked}
                  title={input.trim() ? '전송' : '이어서 내용 전개'}
                  onSend={() => void send()}
                  onStop={cancel}
                />
              </div>
            </ResizableComposer>
          </div>
        </footer>
      </main>
      {wide && logHidden && (
        <CollapsedPanel title="대화 로그" onExpand={() => setLogHidden(false)}>
          {balanceButton}
        </CollapsedPanel>
      )}
      {wide && !logHidden && (
        <aside className="chat-log-desktop">
          {rightView === 'usage' ? (
            <>
              <PanelHeader
                className="chat-log-header"
                title="사용량"
                leading={
                  <IconButton title="대화 로그로 돌아가기" onClick={() => setRightView('log')}>
                    <ArrowLeft size={21} />
                  </IconButton>
                }
              />
              <ChatUsage room={room} balance={balance} />
            </>
          ) : (
            <>
              <ChatLogHeader onCollapse={() => setLogHidden(true)}>{balanceButton}</ChatLogHeader>
              {logContent}
            </>
          )}
        </aside>
      )}
      {sheet && (
        <BottomSheet title="대화 메뉴" onClose={() => setSheet(false)}>
          <div className="sheet-menu">
            {chatMenuGroups.map((menus) => (
              <div
                className="sheet-menu-group"
                key={menus[0].id}
                role="group"
                aria-label={`${menus[0].name} 메뉴 묶음`}
              >
                {menus.map((m) => (
                  <button key={m.id} onClick={() => showMenu(m.id, true)}>
                    <m.icon size={20} />
                    <span>{m.name}</span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            ))}
            <div className="sheet-menu-group">
              <button
                onClick={() => {
                  setSheet(false);
                  newRoom();
                }}
              >
                <Plus size={20} />
                <span>새 대화방 열기</span>
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
      {log && (
        <SideDrawer
          title={rightView === 'usage' ? '사용량' : '대화 로그'}
          onClose={() => setLog(false)}
          headerActions={rightView === 'log' ? balanceButton : undefined}
        >
          {rightView === 'usage' ? (
            <>
              <Button onClick={() => setRightView('log')}>
                <ArrowLeft size={16} />
                대화 로그로 돌아가기
              </Button>
              <ChatUsage room={room} balance={balance} />
            </>
          ) : (
            logContent
          )}
        </SideDrawer>
      )}
      {mobile && pageMenu && (
        <MobilePage title={pageMenu.name} onBack={() => navigateBack(`/chat/${room.id}`)}>
          {panelContent}
        </MobilePage>
      )}
      {picker && (
        <ModelPicker
          models={models}
          modelId={picker === 'chat' ? cfg.modelId : cfg.summaryModelId}
          creativity={cfg.creativity}
          loading={loadingModels}
          onRefresh={refreshModels}
          onClose={() => setPicker(null)}
          onSelect={(modelId, creativity) =>
            run(
              mutate((r) => {
                r.current.context.settings = {
                  ...r.current.context.settings,
                  ...(picker === 'chat' ? { modelId, creativity } : { summaryModelId: modelId }),
                };
                return r;
              }),
            )
          }
        />
      )}
      {branch && (
        <Confirm
          title="이 지점에서 새 대화 시작"
          label="분기 만들기"
          onClose={() => setBranch(null)}
          onConfirm={() => run(makeBranch(branch.eventId, branch.candidateId))}
        >
          <p>
            선택한 응답 직후의 대화, 상태값, 소지품, 관계, 챕터와 기억을 복원한 새 대화방을
            만듭니다.
          </p>
          <p className="muted">현재 대화방은 그대로 유지됩니다.</p>
        </Confirm>
      )}
      {reroll && (
        <Modal title="리롤 요청" onClose={() => setReroll(false)}>
          <Field label="추가 요청 (선택)">
            <Area
              value={directive}
              onChange={setDirective}
              placeholder="이번 응답에서 달라졌으면 하는 내용을 입력하세요."
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={!cfg.rerollPrompt}
              onChange={(e) => {
                const skip = e.target.checked;
                run(
                  mutate((r) => {
                    r.current.context.settings.rerollPrompt = !skip;
                    return r;
                  }),
                );
              }}
            />
            다음부터 추가 프롬프트를 묻지 않기
          </label>
          <Button
            className="primary full"
            onClick={() => {
              setReroll(false);
              void send(true, directive);
              setDirective('');
            }}
          >
            다른 응답 생성
          </Button>
        </Modal>
      )}
      {del && (
        <Modal title="마지막 대화 삭제" onClose={() => setDel(false)}>
          <p>마지막 응답 이전의 진행 상태로 돌아갑니다.</p>
          <Button
            className="full"
            onClick={() => {
              run(mutate((r) => deleteLast(r, true)).then(() => setInput((last as Turn).input)));
              setDel(false);
            }}
          >
            AI 응답 삭제 · 내 입력 유지
          </Button>
          <Button
            className="full danger-text"
            onClick={() => {
              run(mutate((r) => deleteLast(r, false)).then(() => setInput('')));
              setDel(false);
            }}
          >
            입력과 응답 모두 삭제
          </Button>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing.kind === 'user' ? '입력 수정' : '대사 수정'}
          onClose={() => setEditing(null)}
        >
          <p className="muted">
            이 대화방의 텍스트만 수정합니다. 진행 상태와 이후 대화는 유지됩니다.
          </p>
          <Area
            value={editing.body}
            onChange={(body) => setEditing({ ...editing, body })}
            rows={14}
          />
          <Button
            className="primary full"
            disabled={!editing.body.trim()}
            onClick={() => run(edit())}
          >
            수정 저장
          </Button>
        </Modal>
      )}
      {effect && room.work.effects.find((e) => e.id === effect.id) && (
        <EffectPlayer
          effect={room.work.effects.find((e) => e.id === effect.id)!}
          context={{
            personaName: room.current.context.persona.name,
            status: room.current.runtime.status,
            inventory: room.current.runtime.inventory,
            nodeId: room.current.runtime.nodeId,
          }}
          readOnly={!canCompleteEffect(room, effect.id, effect.source)}
          onResult={(result) => mutate((r) => completeEffect(r, effect.id, effect.source, result))}
          onClose={() => setEffect(null)}
        />
      )}
      {opening && (
        <Modal title="도입부 선택" onClose={() => setOpening(false)}>
          {room.work.openings.map((o) => (
            <Button
              className="full"
              key={o.id}
              onClick={() => {
                run(
                  mutate((r) => {
                    if (r.timeline.length)
                      throw new Error('대화 시작 후에는 도입부를 바꿀 수 없습니다.');
                    const next = createRoom(
                      r.work,
                      r.current.context.settings.modelId,
                      r.current.context.persona,
                      o.id,
                    );
                    next.initial.context = clone(r.current.context);
                    next.current.context = clone(r.current.context);
                    return {
                      ...next,
                      id: r.id,
                      name: r.name,
                      revision: r.revision,
                      createdAt: r.createdAt,
                      folderId: r.folderId,
                    };
                  }),
                );
                setOpening(false);
              }}
            >
              {o.name}
            </Button>
          ))}
        </Modal>
      )}
    </div>
  );
}
