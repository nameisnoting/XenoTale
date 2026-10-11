import { ResetButton } from '../components/ResetButton';
import { AddButton } from '../components/AddButton';
import { ChevronRight, Trash2 } from 'lucide-react';
import type { Room, RoomSettings, Memory } from '../domain/types';
import { id } from '../domain/types';
import {
  SUMMARY_POLICY,
  SUMMARY_PROMPTS,
  summaryCountdown,
  longSummaryCountdown,
  summarySources,
  activeShortMemories,
  memoryTitle,
  repairMemoryActivity,
} from '../domain/memory';
import { DisclosureCard } from '../components/DisclosureCard';
import {
  ActionButton,
  Area,
  Button,
  Field,
  IconButton,
  TextInput,
  Toggle,
  useAction,
} from '../components/UI';
import { Stepper } from '../components/DesignControls';
import './RoomMemory.css';

export type MemoryTab = 'short' | 'long' | 'settings';

export function RoomMemory({
  room,
  mutate,
  summarize,
  chooseSummaryModel,
  summaryModelName,
  tab,
  onTabChange: setTab,
}: {
  room: Room;
  mutate: (fn: (r: Room) => Room) => Promise<unknown>;
  summarize: (long?: boolean) => void;
  chooseSummaryModel: () => void;
  summaryModelName?: string;
  tab: MemoryTab;
  onTabChange: (tab: MemoryTab) => void;
}) {
  const run = useAction();
  const context = room.current.context,
    settings = context.settings;
  const set = (patch: Partial<RoomSettings>) =>
    run(
      mutate((r) => {
        Object.assign(r.current.context.settings, patch);
        return r;
      }),
    );
  const edit = (memory: Memory, patch: Partial<Memory>) =>
    run(
      mutate((r) => {
        const target = r.current.context.memories.find((m) => m.id === memory.id);
        if (target) Object.assign(target, patch);
        return r;
      }),
    );
  return (
    <div className="room-memory">
      <div className="work-info-tabs" role="tablist" aria-label="기억관리 탭">
        {(
          [
            ['short', '단기요약'],
            ['long', '장기요약'],
            ['settings', '요약 설정'],
          ] as const
        ).map(([key, name]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'settings' ? (
        <div className="memory-settings">
          <Field label="요약용 LLM">
            <ActionButton className="memory-model" onClick={chooseSummaryModel}>
              <span>
                {summaryModelName ??
                  (settings.summaryModelId === 'demo' ? '예시 요약' : settings.summaryModelId)}
              </span>
              <ChevronRight size={16} />
            </ActionButton>
          </Field>
          <hr />
          <section className="setting-card memory-auto">
            <Toggle
              label="자동 요약"
              value={settings.autoSummary}
              onChange={(autoSummary) => set({ autoSummary })}
            />
          </section>
          <section className="setting-card">
            <h4>단기요약 주기 = 순수 기억 턴 수</h4>
            <Stepper
              label="요약 간격"
              value={settings.summaryEvery}
              {...SUMMARY_POLICY.short}
              unit=" 턴"
              onChange={(summaryEvery) => set({ summaryEvery })}
            />
          </section>
          <section className="setting-card">
            <h4>장기요약 트리거</h4>
            <Stepper
              label="단기요약"
              value={settings.longEvery}
              {...SUMMARY_POLICY.long}
              unit=" 개"
              onChange={(longEvery) => set({ longEvery })}
            />
          </section>
          {(['short', 'long'] as const).map((kind) => {
            const key = kind === 'short' ? 'shortSummaryPrompt' : 'longSummaryPrompt';
            const label = kind === 'short' ? '단기요약 프롬프트' : '장기요약 프롬프트';
            return (
              <DisclosureCard title={label} key={kind} expanded className="memory-prompt-card">
                <Area
                  size="small"
                  ariaLabel={label}
                  rows={12}
                  value={settings[key] ?? SUMMARY_PROMPTS[kind]}
                  onChange={(value) => set({ [key]: value })}
                />
                <ResetButton
                  className="memory-prompt-reset"
                  onClick={() => set({ [key]: SUMMARY_PROMPTS[kind] })}
                />
              </DisclosureCard>
            );
          })}
        </div>
      ) : (
        <>
          <div className={`memory-countdown ${tab === 'long' ? 'memory-countdown--long' : ''}`}>
            다음 요약까지{' '}
            <em>{tab === 'short' ? summaryCountdown(room) : longSummaryCountdown(room)}</em>턴
          </div>
          <Button
            className="full memory-summarize"
            disabled={
              tab === 'short' ? !summarySources(room).length : activeShortMemories(room).length < 2
            }
            onClick={() => summarize(tab === 'long')}
          >
            {tab === 'short' ? '지금 요약' : '지금 단기기억 전체 요약'}
          </Button>
          <div className="memory-list">
            {context.memories
              .filter((m) => m.kind === tab)
              .slice()
              .reverse()
              .map((memory) => (
                <DisclosureCard
                  key={memory.id}
                  title={memoryTitle(room, memory)}
                  className="memory-card"
                  actions={
                    <>
                      {memory.active === false && <span className="memory-inactive">비활성</span>}
                      <IconButton
                        title="기억 삭제"
                        onClick={(e) => {
                          e.preventDefault();
                          run(
                            mutate((r) => {
                              r.current.context.memories = repairMemoryActivity(
                                r.current.context.memories.filter((m) => m.id !== memory.id),
                              );
                              return r;
                            }),
                          );
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </>
                  }
                >
                  <Field label="제목">
                    <TextInput
                      size="small"
                      maxLength={300}
                      value={memory.title ?? ''}
                      placeholder={memoryTitle(room, { ...memory, title: undefined })}
                      onChange={(title) => edit(memory, { title })}
                    />
                  </Field>
                  <Field label="요약내용">
                    <Area
                      size="small"
                      rows={12}
                      value={memory.body}
                      onChange={(body) => edit(memory, { body })}
                    />
                  </Field>
                </DisclosureCard>
              ))}
          </div>
          <div hidden>
            <AddButton
              onClick={() =>
                run(
                  mutate((r) => {
                    r.current.context.memories.push({
                      id: id(),
                      body: '',
                      kind: tab === 'long' ? 'long' : 'short',
                      sources: [],
                      createdAt: Date.now(),
                      manual: true,
                    });
                    return r;
                  }),
                )
              }
            >
              직접 기억 추가
            </AddButton>
          </div>
        </>
      )}
    </div>
  );
}
