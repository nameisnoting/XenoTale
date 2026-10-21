import { type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, Info } from 'lucide-react';
import type { Room } from '../domain/types';
import { roomUsage } from '../domain/usage';
import { after, selected } from '../domain/types';
import { availableChapters } from '../domain/engine';
import { PanelHeader } from '../components/Headers';
import { IconRail } from '../components/IconRail';
import { IconButton } from '../components/UI';

// Desktop destinations mirror the original design. The mobile sheet has its own menu layout.
const destinations = [
  { id: 'info', label: '작품정보', icon: '' },
  { id: 'notes', label: '유저노트', icon: 'book-open' },
  { id: 'persona', label: '페르소나', icon: 'venetian-mask' },
  { id: 'gallery', label: '미디어', icon: 'image' },
  { id: 'inventory', label: '아이템', icon: 'circum_bag-1' },
  { id: 'chapters', label: '시나리오', icon: 'network' },
  { id: 'relations', label: '관계도', icon: 'mdi_relation-one-or-many-to-zero-or-one' },
  { id: 'memory', label: '기억관리', icon: 'ic_outline-sd-storage' },
  { id: 'quality', label: '대화설정', icon: 'settings' },
  { id: 'settings', label: '환경설정', icon: 'settings-2' },
];

export function ChatWorkspace({
  panel,
  collapsed,
  onSelect,
  onToggle,
  onBackup,
  onNew,
  children,
  showRelations = true,
}: {
  panel: string;
  collapsed: boolean;
  onSelect: (panel: string) => void;
  onToggle: () => void;
  onBackup: () => void;
  onNew: () => void;
  children: ReactNode;
  showRelations?: boolean;
}) {
  return (
    <aside className={`chat-workspace ${collapsed ? 'is-collapsed' : ''}`} aria-label="대화 기능">
      <header className="chat-workspace-header">
        {!collapsed && <h2>대화 기능</h2>}
        <IconButton
          title={collapsed ? '대화 기능 펼치기' : '대화 기능 접기'}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="chat-workspace-panel"
        >
          {collapsed ? <PanelLeftOpen size={21} /> : <PanelLeftClose size={21} />}
        </IconButton>
      </header>
      <div className="chat-workspace-body">
        <IconRail
          label="대화 기능 메뉴"
          className="chat-feature-rail"
          items={[
            ...destinations
              .filter((item) => showRelations || item.id !== 'relations')
              .map((item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon || <Info size={28} strokeWidth={1.75} />,
                active: panel === item.id && !collapsed,
                onClick: () => onSelect(item.id),
              })),
            { id: 'backup', label: '전체백업', icon: 'file-signature', onClick: onBackup },
            { id: 'new', label: '새로열기', icon: 'plus-circle', onClick: onNew },
          ]}
        />
        {!collapsed && (
          <section
            id="chat-workspace-panel"
            className="chat-workspace-panel"
            aria-label={destinations.find((d) => d.id === panel)?.label ?? '사용량'}
          >
            {panel !== 'info' && (
              <h3 className="workspace-panel-title">
                {destinations.find((d) => d.id === panel)?.label ?? '사용량'}
              </h3>
            )}
            {children}
          </section>
        )}
      </div>
    </aside>
  );
}

export function reportedCost(room: Room) {
  const uses = roomUsage(room);
  const reported = uses
    .map((usage) => usage.cost)
    .filter((c): c is number => typeof c === 'number');
  const total = reported.reduce((sum, cost) => sum + cost, 0);
  if (!uses.length) return '0';
  if (!reported.length) return '미보고';
  return total === 0 ? '0' : `$${total.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function ChatLogHeader({
  children,
  onCollapse,
}: {
  children: ReactNode;
  showRelations?: boolean;
  onCollapse: () => void;
}) {
  return (
    <PanelHeader
      className="chat-log-header"
      title="대화 로그"
      leading={
        <IconButton title="대화 로그 접기" aria-expanded={true} onClick={onCollapse}>
          <PanelRightClose size={21} />
        </IconButton>
      }
    >
      {children}
    </PanelHeader>
  );
}

export function ConversationLog({
  room,
  onJump,
  onChapter,
}: {
  room: Room;
  onJump: (id: string) => void;
  onChapter: () => void;
}) {
  return (
    <div className="conversation-log">
      <div className="log-events">
        <div className="log-event log-start">• 대화 시작</div>
        {room.timeline.map((event) => {
          const candidate = event.kind === 'turn' ? selected(event) : null;
          const checkpoint = after(event);
          const previousChapters = new Set(
            availableChapters(room.work, event.before.runtime).map((c) => c.id),
          );
          const unlocked = availableChapters(room.work, checkpoint.runtime).filter(
            (c) => !previousChapters.has(c.id),
          );
          const changes = candidate
            ? candidate.changes
            : event.kind !== 'turn'
              ? event.changes
              : [];
          return (
            <section className="log-event" key={event.id}>
              {event.kind === 'turn' && event.dice && (
                <p className="log-dice">• /roll → {event.dice}</p>
              )}
              <button
                className="log-event-link"
                onClick={() =>
                  onJump(
                    event.kind === 'effect'
                      ? (event.effectResult?.source.eventId ?? event.id)
                      : event.id,
                  )
                }
              >
                {candidate ? (
                  <>
                    <strong>
                      •{' '}
                      {event.kind === 'turn' && event.chapterId
                        ? `챕터 이동 · ${room.work.chapters.find((chapter) => chapter.id === event.chapterId)?.name ?? '챕터'}`
                        : `${checkpoint.runtime.turnCount}턴 종료`}
                    </strong>
                    <span className="log-turn-cost">
                      {' '}
                      (비용:{' '}
                      {candidate.usage.cost === undefined
                        ? '미보고'
                        : `$${candidate.usage.cost.toFixed(3)}`}
                      )
                    </span>
                  </>
                ) : (
                  <strong>
                    •{' '}
                    {event.kind === 'chapter'
                      ? '챕터 이동'
                      : event.kind === 'effect'
                        ? '연출 결과'
                        : event.kind === 'action'
                          ? '행동·설정 변경'
                          : '아이템 강화'}
                  </strong>
                )}
              </button>
              {event.kind === 'turn' && !event.chapterId && (
                <p className="log-player-input">
                  {event.input === '[이어서 내용 전개]' ? '이어서 내용 전개' : event.input}
                </p>
              )}
              {!!changes.length && (
                <ul className="log-changes">
                  {changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              )}
              {!!unlocked.length && (
                <div className="log-unlocked">
                  챕터 해금
                  <ul>
                    {unlocked.map((chapter) => (
                      <li key={chapter.id}>
                        <button onClick={onChapter}>{chapter.name}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
