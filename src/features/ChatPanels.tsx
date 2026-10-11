import { useState } from 'react';
import {
  BookOpen,
  Info,
  VenetianMask,
  Image,
  Package,
  Flag,
  Network,
  Brain,
  SlidersHorizontal,
  Settings,
  Download,
} from 'lucide-react';
import type { Room, Profile, RoomSettings, Work } from '../domain/types';

import { availableChapters, enhance, enterChapter } from '../domain/engine';
import { exportRoom } from '../persistence/files';
import {
  Button,
  Field,
  Toggle,
  Markdown,
  Avatar,
  Empty,
  safeUrl,
  useAction,
} from '../components/UI';
import { QualityEditor } from './creator/QualityEditor';
import { RelationGraph } from './Graphs';
import { relationGraphWork } from '../domain/relations';
import { RoomNotes } from './RoomNotes';
import { RoomMemory, type MemoryTab } from './RoomMemory';

import { ChatPersona } from './ChatPersona';
import type { GraphViewProps } from './Graphs';
import { RadioOptions, Stepper } from '../components/DesignControls';
import { PlayGuide } from '../components/PlayGuide';
export const chatMenuGroups = [
  [
    { id: 'info', name: '작품정보', icon: Info },
    { id: 'guide', name: '플레이 가이드', icon: BookOpen },
    { id: 'usage', name: '사용량', icon: SlidersHorizontal },
  ],
  [
    { id: 'notes', name: '유저노트', icon: BookOpen },
    { id: 'persona', name: '유저 페르소나', icon: VenetianMask },
  ],
  [
    { id: 'gallery', name: '갤러리', icon: Image },
    { id: 'inventory', name: '소지품', icon: Package },
    { id: 'chapters', name: '챕터', icon: Flag },
    { id: 'relations', name: '관계도', icon: Network },
  ],
  [
    { id: 'memory', name: '기억 관리', icon: Brain },
    { id: 'quality', name: '대화 품질 관리', icon: SlidersHorizontal },
    { id: 'settings', name: '기타 설정 관리', icon: Settings },
  ],
];
export const chatMenus = chatMenuGroups.flat();
// Keep navigation selections in the room shell, which outlives individual panels.
export type ChatPanelSelection = {
  infoTab: 'work' | 'guide';
  workTab: 'work' | 'character';
  characterId?: string;
  galleryChar: string;
  memoryTab: MemoryTab;
};
export function initialPanelSelection(work: Work): ChatPanelSelection {
  return {
    infoTab: 'work',
    workTab: 'work',
    characterId: work.characters[0]?.id,
    galleryChar: work.media.characters[0]?.code ?? '0',
    memoryTab: 'short',
  };
}
export function ChatPanel({
  panel,
  room,
  profile,
  mutate,
  summarize,
  chooseSummaryModel,
  relationView,
  summaryModelName,
  selection,
  onSelectionChange,
}: {
  panel: string;
  room: Room;
  profile: Profile;
  mutate: (fn: (r: Room) => Room) => Promise<unknown>;
  summarize: (long?: boolean) => void;
  chooseSummaryModel: () => void;
  relationView?: GraphViewProps;
  summaryModelName?: string;
  selection: ChatPanelSelection;
  onSelectionChange: (patch: Partial<ChatPanelSelection>) => void;
}) {
  const run = useAction();
  const w = room.work;
  const ctx = room.current.context;
  const state = room.current.runtime;
  const settings = ctx.settings;
  const set = (change: Partial<RoomSettings>) =>
    run(
      mutate((r) => {
        r.current.context.settings = { ...r.current.context.settings, ...change };
        return r;
      }),
    );
  const [inventoryId, setInventoryId] = useState<string | null>(null);
  const { galleryChar, infoTab, workTab, characterId, memoryTab } = selection;
  const character = w.characters.find((c) => c.id === characterId) ?? w.characters[0];
  return (
    <div className="chat-panel-content">
      {panel === 'info' && (
        <div className="work-info-panel">
          <div className="work-info-tabs" role="tablist" aria-label="작품 정보 탭">
            <button
              role="tab"
              id="work-info-tab"
              aria-controls="work-info-body"
              aria-selected={infoTab === 'work'}
              onClick={() => onSelectionChange({ infoTab: 'work' })}
            >
              작품
            </button>
            <button
              role="tab"
              id="work-guide-tab"
              aria-controls="work-info-body"
              aria-selected={infoTab === 'guide'}
              onClick={() => onSelectionChange({ infoTab: 'guide' })}
            >
              플레이 가이드
            </button>
          </div>
          <div
            id="work-info-body"
            role="tabpanel"
            aria-labelledby={infoTab === 'work' ? 'work-info-tab' : 'work-guide-tab'}
          >
            {infoTab === 'guide' ? (
              <PlayGuide
                className="work-guide"
                content={w.guide || '등록된 플레이 가이드가 없습니다.'}
              />
            ) : (
              <>
                <div className="work-info-pills" role="group" aria-label="작품 또는 캐릭터">
                  <button
                    aria-pressed={workTab === 'work'}
                    onClick={() => onSelectionChange({ workTab: 'work' })}
                  >
                    작품
                  </button>
                  <button
                    aria-pressed={workTab === 'character'}
                    onClick={() => onSelectionChange({ workTab: 'character' })}
                  >
                    캐릭터
                  </button>
                </div>
                {workTab === 'work' ? (
                  <>
                    <div className="work-info-cover">
                      {w.cover ? (
                        <img src={safeUrl(w.cover)} alt={`${w.title} 표지`} />
                      ) : (
                        <span>{w.title.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="work-info-byline">
                      <h3>{w.title}</h3>
                      <small>{w.author}</small>
                      <small>v{w.version}</small>
                    </div>
                    <div className="work-info-description">
                      <Markdown>{w.description || '등록된 작품 설명이 없습니다.'}</Markdown>
                    </div>
                    {w.lore.map((lore) => (
                      <section className="work-lore" key={lore.id}>
                        <h4>{lore.name}</h4>
                        <p>
                          <span className="keyword-label">키워드:</span>{' '}
                          {lore.keywords.filter(Boolean).join(', ')}
                        </p>
                      </section>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="work-character-list" aria-label="캐릭터 선택">
                      {w.characters.map((c) => (
                        <button
                          key={c.id}
                          aria-label={c.name}
                          aria-pressed={character?.id === c.id}
                          onClick={() => onSelectionChange({ characterId: c.id })}
                        >
                          <Avatar src={c.image} name={c.name} size={44} />
                        </button>
                      ))}
                    </div>
                    {character && (
                      <>
                        <div className="work-info-cover">
                          {character.image ? (
                            <img src={safeUrl(character.image)} alt={character.name} />
                          ) : (
                            <Avatar name={character.name} size={96} />
                          )}
                        </div>
                        <div className="work-info-byline">
                          <h3>{character.name}</h3>
                        </div>
                        {character.lore.map((lore) => (
                          <section className="work-lore" key={lore.id}>
                            <h4>{lore.name}</h4>
                            <p>
                              <span className="keyword-label">키워드:</span>{' '}
                              {lore.keywords.filter(Boolean).join(', ')}
                            </p>
                          </section>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {panel === 'notes' && <RoomNotes room={room} profile={profile} mutate={mutate} />}
      {panel === 'persona' && <ChatPersona room={room} profile={profile} mutate={mutate} />}
      {panel === 'gallery' && (
        <>
          {!w.media.template ? (
            <Empty>이 작품에는 갤러리 이미지가 등록되지 않았습니다.</Empty>
          ) : (
            <>
              <div className="work-character-list">
                <button
                  aria-pressed={galleryChar === '0'}
                  onClick={() => onSelectionChange({ galleryChar: '0' })}
                >
                  공용
                </button>
                {w.media.characters.map((c) => {
                  const person = w.characters.find((x) => x.id === c.characterId);
                  return (
                    <button
                      key={c.code}
                      aria-label={person?.name}
                      aria-pressed={galleryChar === c.code}
                      onClick={() => onSelectionChange({ galleryChar: c.code })}
                    >
                      <Avatar src={person?.image} size={44} />
                    </button>
                  );
                })}
              </div>
              <div className="gallery-character">
                <Avatar
                  src={
                    w.characters.find(
                      (c) =>
                        c.id ===
                        w.media.characters.find((x) => x.code === galleryChar)?.characterId,
                    )?.image
                  }
                  size={196}
                />
                <h3>
                  {w.characters.find(
                    (c) =>
                      c.id === w.media.characters.find((x) => x.code === galleryChar)?.characterId,
                  )?.name ?? (galleryChar === '0' ? '공용' : '')}
                </h3>
              </div>
              <div className="chat-gallery">
                {w.media.situations.map((s) => (
                  <figure key={s.code}>
                    <img
                      src={safeUrl(
                        w.media.template
                          .replaceAll('{{char_code}}', galleryChar)
                          .replaceAll('{{situation_code}}', s.code),
                      )}
                      alt={s.name}
                      loading="lazy"
                    />
                    <figcaption>{s.name}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {panel === 'inventory' && (
        <>
          {inventoryId ? (
            (() => {
              const item = w.items.find((i) => i.id === inventoryId)!;
              const held = state.inventory[item.id] ?? { owned: false, level: 0, bonus: 0 };
              const e = item.enhancement;
              const cost = e ? e.costBase + e.costStep * held.level : 0;
              const max = !!e && held.level >= e.probabilities.length;
              return (
                <div className="inventory-detail">
                  <div className="inventory-image">
                    {item.image ? (
                      <img src={safeUrl(item.image)} alt={item.name} />
                    ) : (
                      <Package size={96} />
                    )}
                  </div>
                  <h3>
                    <em>{e ? `+${held.level} ` : ''}</em>
                    {item.name}
                  </h3>
                  <Markdown>{item.prompt}</Markdown>
                  {e && (
                    <>
                      <h4>능력치</h4>
                      <p>
                        {w.statuses.find((s) => s.id === e.target)?.name} <em>+{held.bonus}</em> (+
                        {e.gainBase + e.gainStep * held.level})
                      </p>
                      <h4>소모 자원</h4>
                      <p>
                        {w.statuses.find((s) => s.id === e.currency)?.name} <strong>{cost}</strong>{' '}
                        / {state.status[e.currency]}
                      </p>
                      <p>
                        {max ? (
                          '최대 강화 단계입니다.'
                        ) : (
                          <>
                            성공 확률은{' '}
                            <strong className="danger-text">
                              {+(e.probabilities[held.level] * 100).toFixed(2)}%
                            </strong>{' '}
                            입니다.
                          </>
                        )}
                      </p>
                    </>
                  )}
                  <div className="form-row">
                    <Button onClick={() => setInventoryId(null)}>돌아가기</Button>
                    {e && (
                      <Button
                        className="primary"
                        disabled={!held.owned || max || Number(state.status[e.currency]) < cost}
                        onClick={() => run(mutate((r) => enhance(r, item.id)))}
                      >
                        강화하기
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="inventory-grid">
              {w.items.map((item) => {
                const held = state.inventory[item.id];
                return (
                  <button
                    key={item.id}
                    className="inventory-tile"
                    onClick={() => setInventoryId(item.id)}
                  >
                    <Avatar src={item.image} size={58} />
                    <span>
                      {item.enhancement ? `+${held?.level ?? 0} ` : ''}
                      {item.name}
                    </span>
                    <small className={held?.owned ? 'owned' : ''}>
                      {held?.owned ? '소지 중' : '미소지'}
                    </small>
                    {item.enhancement && held?.owned && <em>강화</em>}
                  </button>
                );
              })}
            </div>
          )}
          {!w.items.length && <Empty>등록된 아이템이 없습니다.</Empty>}
        </>
      )}
      {panel === 'chapters' && (
        <div className="chapter-list">
          <h3>
            현재 챕터: {[...w.openings, ...w.chapters].find((c) => c.id === state.nodeId)?.name}
          </h3>
          {w.chapters
            .filter((c) => c.from === state.nodeId)
            .map((c) => (
              <section key={c.id}>
                <h3>{c.name}</h3>
                <ul>
                  {c.conditions.map((condition) => (
                    <li key={condition.id}>
                      {w.statuses.find((s) => s.id === condition.ref)?.name ??
                        w.items.find((i) => i.id === condition.ref)?.name}{' '}
                      {{ gte: '이상', lte: '이하', eq: '같음', ne: '다름' }[condition.op]}{' '}
                      {String(condition.value)}
                    </li>
                  ))}
                </ul>
                {!c.conditions.length && <p>추가 조건 없음</p>}
                <Button
                  className="full"
                  disabled={!availableChapters(w, state).some((x) => x.id === c.id)}
                  onClick={() => run(mutate((r) => enterChapter(r, c.id)))}
                >
                  {availableChapters(w, state).some((x) => x.id === c.id)
                    ? '챕터 이동'
                    : '조건 미충족'}
                </Button>
              </section>
            ))}
          {!w.chapters.some((c) => c.from === state.nodeId) && <Empty>다음 챕터가 없습니다.</Empty>}
        </div>
      )}
      {panel === 'relations' && (
        <RelationGraph
          {...relationView}
          work={relationGraphWork(w, state)}
          values={state.relationships}
          innerValues={state.innerRelationships}
        />
      )}
      {panel === 'quality' && (
        <QualityEditor compact value={settings.quality} onChange={(quality) => set({ quality })} />
      )}
      {panel === 'settings' && (
        <>
          <section className="setting-card">
            <h3>편의</h3>
            <Toggle
              label="리롤 시 추가 프롬프트 입력"
              value={settings.rerollPrompt}
              onChange={(rerollPrompt) => set({ rerollPrompt })}
            />
            <Field label="상태창">
              <RadioOptions
                value={settings.statusExpanded ? '펼침' : '접음'}
                values={['펼침', '접음']}
                onChange={(v) => set({ statusExpanded: v === '펼침' })}
              />
            </Field>
            <Field label="프로필 이미지">
              <RadioOptions
                value={settings.profiles ? 'ON' : 'OFF'}
                values={['ON', 'OFF']}
                onChange={(v) => set({ profiles: v === 'ON' })}
              />
            </Field>
            <Toggle
              label="추천 선택지"
              value={settings.choices}
              onChange={(choices) => set({ choices })}
            />
          </section>
          <section className="setting-card">
            <h3>텍스트</h3>
            <Stepper
              label="크기"
              value={settings.fontSize}
              min={10}
              max={40}
              unit="pt"
              onChange={(fontSize) => set({ fontSize })}
            />
            <Stepper
              label="자간"
              value={settings.letterSpacing}
              min={-2}
              max={10}
              step={0.1}
              unit="px"
              onChange={(letterSpacing) => set({ letterSpacing })}
            />
            <Stepper
              label="행간"
              value={settings.lineHeight}
              min={14}
              max={80}
              unit="pt"
              onChange={(lineHeight) => set({ lineHeight })}
            />
          </section>
          <Button className="full" onClick={() => exportRoom(room)}>
            <Download size={16} />
            대화 파일 내보내기
          </Button>
        </>
      )}
      {panel === 'memory' && (
        <RoomMemory
          tab={memoryTab}
          onTabChange={(memoryTab) => onSelectionChange({ memoryTab })}
          room={room}
          mutate={mutate}
          summarize={summarize}
          chooseSummaryModel={chooseSummaryModel}
          summaryModelName={summaryModelName}
        />
      )}
    </div>
  );
}
