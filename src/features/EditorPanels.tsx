import { SYSTEM_PROMPT, effectiveSystemPrompt } from '../domain/systemPrompt';
import { AddButton } from '../components/AddButton';
import { ResetButton } from '../components/ResetButton';
import { DeleteAction } from '../components/DeleteAction';
import { SelectionPill } from '../components/SelectionPill';
import { SnippetArea } from '../components/SnippetArea';
import { insertTextWithUndo } from '../components/textEditing';
import { PlayGuide } from '../components/PlayGuide';
import './CharacterEditor.css';
import './StatusEditor.css';
import {
  nextStatusName,
  statusTemplateExample,
  syncStatusTemplate,
} from '../domain/statusTemplate';
import { CardSection, DisclosureCard } from '../components/DisclosureCard';
import { requiresDeleteConfirmation, hasText } from '../domain/deletion';
import { ShortcutFields } from '../components/ShortcutFields';
import { SortableList } from '../components/SortableList';
import { Select } from '../components/Select';
import './ChatShortcuts.css';
import { useRef, useState } from 'react';
import { Plus, Trash2, Eye, Download, Upload, ChevronRight } from 'lucide-react';
import type {
  Work,
  Profile,
  Quality,
  Lore,
  Character,
  StatusDef,
  Item,
  Chapter,
  Condition,
} from '../domain/types';
import { id, clone, VIEWPOINTS } from '../domain/types';
import { changeProfile } from '../persistence/db';
import {
  Field,
  TextInput,
  Area,
  Segmented,
  Button,
  IconButton,
  ImageUpload,
  NumberInput,
  Modal,
  Markdown,
  Toggle,
  Empty,
  useAction,
  useNotify,
  safeUrl,
} from '../components/UI';
import { RadioOptions, KeywordInput, StatusDisplay } from '../components/DesignControls';
import { ViewpointActors, CharacterGroups, MediaEditor } from './CreatorExtras';
import { initialState } from '../domain/engine';
import { EffectPlayer } from '../components/EffectPlayer';
import { effectExamples } from './effectExamples';
import { RelationGraph, ScenarioGraph, type GraphViewProps } from './Graphs';
export { RelationGraph, ScenarioGraph } from './Graphs';
import { PersonaLibrary } from './Profile';
export const sections = [
  { id: 'overview', name: '작품 개요', required: true },
  { id: 'characters', name: '등장 캐릭터', required: true },
  { id: 'openings', name: '도입부', required: true },
  { id: 'media', name: '미디어' },
  { id: 'relations', name: '관계도' },
  { id: 'statuses', name: '상태창' },
  { id: 'items', name: '아이템' },
  { id: 'scenarios', name: '시나리오' },
  { id: 'shortcuts', name: '단축어' },
  { id: 'effects', name: '연출' },
  { id: 'personas', name: '추천 페르소나' },
  { id: 'guide', name: '플레이가이드' },
];
export function QualityEditor({
  value,
  onChange,
  compact = false,
}: {
  value: Quality;
  onChange: (q: Quality) => void;
  compact?: boolean;
}) {
  const rows: { key: keyof Quality; name: string; values: string[] }[] = [
    ...(!compact
      ? [
          {
            key: 'style' as const,
            name: '문체',
            values: ['라이트노벨', '판타지', '무협', 'TRPG', '설정 안 함'],
          },
        ]
      : []),
    {
      key: 'ratio',
      name: '지문/대사 비율',
      values: ['지문 우선', '균등', '대사 우선', '자연스럽게'],
    },
    ...(!compact
      ? [
          {
            key: 'pacing' as const,
            name: '전개 속도',
            values: ['느림', '보통', '빠름', '자연스럽게'],
          },
        ]
      : []),
    { key: 'length', name: '응답 길이', values: ['짧음', '보통', '많음', '자연스럽게'] },
    { key: 'difficulty', name: '난이도', values: ['쉬움', '보통', '어려움', '억까'] },
    { key: 'events', name: '돌발 이벤트 발생 주기', values: ['적음', '보통', '빈번', '없음'] },
    ...(!compact ? [{ key: 'viewpoint' as const, name: '서술 시점', values: VIEWPOINTS }] : []),
  ];
  return (
    <div className="quality-editor">
      {rows.map((r) => (
        <Field key={r.key} label={r.name}>
          {compact ? (
            <RadioOptions
              value={value[r.key] ?? ''}
              values={r.values}
              onChange={(v) => onChange({ ...value, [r.key]: v })}
            />
          ) : (
            <Segmented
              value={value[r.key] ?? ''}
              values={r.values}
              onChange={(v) => onChange({ ...value, [r.key]: v })}
            />
          )}
        </Field>
      ))}
    </div>
  );
}
function LoreEditor({ entries, onChange }: { entries: Lore[]; onChange: (v: Lore[]) => void }) {
  return (
    <>
      <SortableList
        items={entries}
        itemId={(entry) => entry.id}
        itemName={(entry) => entry.name || '로어북'}
        onChange={onChange}
      >
        {(l, handle, i) => (
          <DisclosureCard
            className="creator-card"
            expanded
            key={l.id}
            title={l.name || `로어북 ${i + 1}`}
            leading={handle}
            actions={
              <DeleteAction
                title="로어북 삭제"
                name={l.name}
                needsConfirmation={requiresDeleteConfirmation('lore', l)}
                onDelete={() => onChange(entries.filter((x) => x.id !== l.id))}
              />
            }
          >
            <Field label="이름">
              <TextInput
                value={l.name}
                onChange={(name) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, name } : x)))
                }
              />
            </Field>
            <Field label="키워드">
              <KeywordInput
                value={l.keywords}
                onChange={(keywords) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, keywords } : x)))
                }
              />
            </Field>
            <Field label="프롬프트">
              <Area
                value={l.prompt}
                onChange={(prompt) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, prompt } : x)))
                }
              />
            </Field>
          </DisclosureCard>
        )}
      </SortableList>
      <AddButton
        onClick={() =>
          onChange([
            ...entries,
            {
              id: id(),
              name: `로어북 ${entries.length + 1}`,
              defaultName: `로어북 ${entries.length + 1}`,
              keywords: [],
              prompt: '',
            },
          ])
        }
      >
        로어북 추가
      </AddButton>
    </>
  );
}
export function EditorPanels({
  section,
  work,
  onChange,
  profile,
  selectedOpeningId,
  onOpeningSelect,
  relationView,
}: {
  section: string;
  work: Work;
  onChange: (w: Work) => void;
  profile: Profile;
  selectedOpeningId: string;
  onOpeningSelect: (id: string) => void;
  relationView?: GraphViewProps;
}) {
  const [tab, setTab] = useState(0);
  const [grouping, setGrouping] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');
  const [saveAs, setSaveAs] = useState<'lore' | 'characters' | null>(null);
  const [saveName, setSaveName] = useState('');
  const [statusPreview, setStatusPreview] = useState<Work | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [guidePreview, setGuidePreview] = useState<string | null>(null);
  const [effectPreview, setEffectPreview] = useState<Work['effects'][number] | null>(null);
  const [library, setLibrary] = useState<'lore' | 'characters' | null>(null);
  const [mediaPreview, setMediaPreview] = useState(false);
  const run = useAction();
  const notify = useNotify();
  const update = (patch: Partial<Work>) => onChange({ ...work, ...patch });
  const changeCharacter = (index: number, patch: Partial<Character>) =>
    update({ characters: work.characters.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const updateStatuses = (statuses: StatusDef[]) =>
    update({
      statuses,
      statusTemplate: syncStatusTemplate(work.statusTemplate, work.statuses, statuses),
    });
  const changeStatus = (index: number, patch: Partial<StatusDef>) =>
    updateStatuses(work.statuses.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const changeItem = (index: number, patch: Partial<Item>) =>
    update({ items: work.items.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const changeChapter = (index: number, patch: Partial<Chapter>) =>
    update({ chapters: work.chapters.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const charIndex = Math.min(tab, work.characters.length - 1);
  const selectedCharacter = work.characters[charIndex];
  const character =
    !groupFilter || selectedCharacter?.group === groupFilter ? selectedCharacter : undefined;
  const characterGroupNames = [
    ...new Set(
      [
        ...(work.characterGroups ?? []).map((g) => g.name),
        ...work.characters.map((c) => c.group),
      ].filter(Boolean),
    ),
  ];
  const deleteCharacter = (target: Character) => {
    if (work.characters.length === 1) return;
    const characters = work.characters.filter((c) => c.id !== target.id);
    update({
      characters,
      quality: {
        ...work.quality,
        viewpointActorId:
          work.quality.viewpointActorId === target.id ? 'user' : work.quality.viewpointActorId,
        viewpointTargetId:
          work.quality.viewpointTargetId === target.id ? 'user' : work.quality.viewpointTargetId,
      },
      relations: work.relations.filter((r) => r.from !== target.id && r.to !== target.id),
      openings: work.openings.map((o) => ({
        ...o,
        presence: o.presence.filter((x) => x !== target.id),
      })),
      media: {
        ...work.media,
        characters: work.media.characters.filter((m) => m.characterId !== target.id),
      },
    });
    const retainedIndex = characters.findIndex((c) => c.id === character?.id);
    const nextIndex =
      retainedIndex >= 0
        ? retainedIndex
        : Math.max(
            0,
            characters.findIndex((c) => !groupFilter || c.group === groupFilter),
          );
    if (groupFilter && !characters.some((c) => c.group === groupFilter)) setGroupFilter('');
    setTab(nextIndex);
  };
  const deleteCharacterGroup = (name: string) => {
    update({
      characterGroups: (work.characterGroups ?? []).filter((g) => g.name !== name),
      characters: work.characters.map((c) => (c.group === name ? { ...c, group: '' } : c)),
    });
    if (groupFilter === name) setGroupFilter('');
  };
  const openingIndex = Math.max(
    0,
    work.openings.findIndex((o) => o.id === selectedOpeningId),
  );
  const opening = work.openings[openingIndex];
  const changeOpening = (patch: Partial<typeof opening>) =>
    update({
      openings: work.openings.map((o, i) => (i === openingIndex ? { ...o, ...patch } : o)),
    });
  const entities = [{ id: 'user', name: '{{user}}' }, ...work.characters];
  return (
    <div className={`editor-form ${section}-form`}>
      {section === 'overview' && (
        <>
          <h2>기본 정보</h2>
          <div className="basic-info">
            <div>
              <span className="field-label">표지</span>
              <ImageUpload
                value={work.cover}
                onChange={(cover) => update({ cover })}
                label="작품 표지"
              />
            </div>
            <div>
              <Field label="제목" required>
                <TextInput
                  value={work.title}
                  onChange={(title) => update({ title })}
                  placeholder="제목을 입력하세요"
                />
              </Field>
              <Field label="작품 설명">
                <Area
                  value={work.description}
                  onChange={(description) => update({ description })}
                  placeholder="작품을 소개해 주세요. Markdown을 사용할 수 있습니다."
                />
              </Field>
            </div>
          </div>
          <Field
            label="시스템 프롬프트"
            required
            labelAction={
              <ResetButton
                onClick={() => update({ systemMode: 'custom', customSystem: SYSTEM_PROMPT })}
              />
            }
          >
            <Area
              rows={10}
              value={effectiveSystemPrompt(work)}
              onChange={(customSystem) => update({ systemMode: 'custom', customSystem })}
            />
          </Field>
          <Field label="프롬프트" required>
            <Area
              value={work.prompt}
              onChange={(prompt) => update({ prompt })}
              rows={10}
              placeholder="세계관과 이야기의 기본 설정을 입력하세요."
            />
          </Field>
          <hr />
          <h2>시스템</h2>
          <QualityEditor value={work.quality} onChange={(quality) => update({ quality })} />
          <ViewpointActors work={work} onChange={onChange} />
          <hr />
          <div className="section-title">
            <h2>로어북</h2>
            <div className="inline-actions">
              <Button className="outline-gold" onClick={() => setLibrary('lore')}>
                로어북 불러오기
              </Button>
              <Button
                className="outline-gold"
                disabled={!work.lore.length}
                onClick={() => {
                  setSaveName(work.title || '로어북 모음');
                  setSaveAs('lore');
                }}
              >
                마이 로어북에 저장
              </Button>
            </div>
          </div>
          <LoreEditor entries={work.lore} onChange={(lore) => update({ lore })} />
        </>
      )}
      {section === 'characters' && (
        <>
          <div className="section-title">
            <h2>캐릭터</h2>
            <div className="inline-actions">
              <Button className="outline-gold" onClick={() => setGrouping(true)}>
                캐릭터 그룹화
              </Button>
              <Button className="outline-gold" onClick={() => setLibrary('characters')}>
                캐릭터 불러오기
              </Button>
              <Button
                className="outline-gold"
                onClick={() => {
                  setSaveName(work.title || '캐릭터 모음');
                  setSaveAs('characters');
                }}
              >
                마이 캐릭터에 저장
              </Button>
            </div>
          </div>
          {!!characterGroupNames.length && (
            <div className="group-filter">
              <SelectionPill
                name="전체"
                shape="round"
                selected={!groupFilter}
                onSelect={() => setGroupFilter('')}
              />
              {characterGroupNames.map((g) => (
                <SelectionPill
                  key={g}
                  name={g}
                  shape="round"
                  selected={g === groupFilter}
                  deletion={{
                    title: '그룹 삭제',
                    ariaLabel: `${g} 그룹 삭제`,
                    name: g,
                    needsConfirmation:
                      requiresDeleteConfirmation(
                        'characterGroup',
                        work.characterGroups?.find((entry) => entry.name === g) ?? { name: g },
                      ) || work.characters.some((c) => c.group === g),
                    description:
                      '그룹 설정을 삭제합니다. 소속 캐릭터는 유지되며 그룹에서 해제됩니다.',
                    onDelete: () => deleteCharacterGroup(g),
                  }}
                  onSelect={() => {
                    setGroupFilter(g);
                    setTab(
                      Math.max(
                        0,
                        work.characters.findIndex((c) => c.group === g),
                      ),
                    );
                  }}
                />
              ))}
            </div>
          )}
          <div className="tab-pills">
            {work.characters.map(
              (c, i) =>
                (!groupFilter || c.group === groupFilter) && (
                  <SelectionPill
                    key={c.id}
                    name={c.name || `캐릭터 ${i + 1}`}
                    selected={i === charIndex}
                    onSelect={() => setTab(i)}
                    deletion={
                      work.characters.length === 1
                        ? undefined
                        : {
                            title: '캐릭터 삭제',
                            ariaLabel: `${c.name || `캐릭터 ${i + 1}`} 삭제`,
                            name: c.name,
                            needsConfirmation:
                              requiresDeleteConfirmation('character', c) ||
                              work.relations.some((r) => r.from === c.id || r.to === c.id),
                            description:
                              '캐릭터와 연결된 관계·도입부 등장 정보·미디어 연결도 함께 제거됩니다.',
                            onDelete: () => deleteCharacter(c),
                          }
                    }
                  />
                ),
            )}
            <Button
              onClick={() => {
                update({
                  characters: [
                    ...work.characters,
                    {
                      id: id(),
                      name: '',
                      role: 'supporting',
                      image: '',
                      trigger: '',
                      prompt: '',
                      lore: [],
                      group: '',
                    },
                  ],
                });
                setGroupFilter('');
                setTab(work.characters.length);
              }}
            >
              <Plus size={16} />
              추가
            </Button>
          </div>
          {character && (
            <>
              <div className="character-identity">
                <div className="character-portrait">
                  <span className="field-label">프로필 이미지</span>
                  <ImageUpload
                    value={character.image}
                    onChange={(image) => changeCharacter(charIndex, { image })}
                    label="캐릭터 이미지"
                  />
                </div>
                <div className="character-identity-fields">
                  <Field label="이름" required>
                    <TextInput
                      value={character.name}
                      placeholder="이름을 입력하세요"
                      onChange={(name) => changeCharacter(charIndex, { name })}
                    />
                  </Field>
                  <Field label="역할">
                    <RadioOptions
                      value={
                        { main: '주연', supporting: '조연', extra: '엑스트라' }[character.role]
                      }
                      values={['주연', '조연', '엑스트라']}
                      onChange={(v) =>
                        changeCharacter(charIndex, {
                          role: v === '주연' ? 'main' : v === '조연' ? 'supporting' : 'extra',
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
              {character.role !== 'main' && (
                <Field
                  label="트리거 프롬프트"
                  required
                  hint="항상 전달됩니다. 이 인물이 어떤 상황에 등장하는지 적어 주세요."
                >
                  <Area
                    value={character.trigger}
                    onChange={(trigger) => changeCharacter(charIndex, { trigger })}
                  />
                </Field>
              )}
              <div className="character-prompt">
                <Field
                  label={character.role === 'main' ? '캐릭터 프롬프트' : '전체 프롬프트'}
                  required={character.role === 'main'}
                >
                  <Area
                    value={character.prompt}
                    onChange={(prompt) => changeCharacter(charIndex, { prompt })}
                    rows={9}
                  />
                </Field>
              </div>
              <hr className="character-lore-divider" />
              <h2 className="character-lore-title">캐릭터별 설정집</h2>
              <LoreEditor
                entries={character.lore}
                onChange={(lore) => changeCharacter(charIndex, { lore })}
              />
            </>
          )}
        </>
      )}
      {section === 'openings' && (
        <>
          <h2>도입부</h2>
          <div className="tab-pills">
            {work.openings.map((o, i) => (
              <SelectionPill
                key={o.id}
                name={o.name}
                selected={i === openingIndex}
                onSelect={() => onOpeningSelect(o.id)}
                deletion={
                  work.openings.length === 1
                    ? undefined
                    : {
                        title: '도입부 삭제',
                        ariaLabel: `${o.name} 삭제`,
                        name: o.name,
                        needsConfirmation: requiresDeleteConfirmation('opening', o),
                        disabled: work.chapters.some((c) => c.from === o.id),
                        onDelete: () => {
                          if (
                            work.openings.length === 1 ||
                            work.chapters.some((c) => c.from === o.id)
                          )
                            return;
                          const openings = work.openings.filter((entry) => entry.id !== o.id);
                          update({ openings });
                          if (o.id === selectedOpeningId) onOpeningSelect(openings[0].id);
                        },
                      }
                }
              />
            ))}
            <Button
              onClick={() => {
                const openingId = id();
                update({
                  openings: [
                    ...work.openings,
                    {
                      id: openingId,
                      name: `도입부 ${work.openings.length + 1}`,
                      defaultName: `도입부 ${work.openings.length + 1}`,
                      body: '',
                      suggestions: ['', '', ''],
                      bgm: '',
                      presence: work.characters.filter((c) => c.role === 'main').map((c) => c.id),
                    },
                  ],
                });
                onOpeningSelect(openingId);
              }}
            >
              <Plus size={16} />
              추가
            </Button>
          </div>
          <Field label="제목" required>
            <TextInput value={opening.name} onChange={(name) => changeOpening({ name })} />
          </Field>
          <Field label="내용" required>
            <SnippetArea
              value={opening.body}
              onChange={(body) => changeOpening({ body })}
              rows={14}
              snippets={[
                { label: '지문', text: '**', cursorOffset: 1 },
                { label: '{{user}}', text: '{{user}}' },
                ...work.characters.map((c) => ({
                  key: c.id,
                  label: `@${c.name || '캐릭터'}`,
                  text: `@${c.name || '캐릭터'}: `,
                })),
              ]}
            />
          </Field>
          <h3>추천 답변</h3>
          {opening.suggestions.map((s, i) => (
            <input
              key={i}
              aria-label={`추천 답변 ${i + 1}`}
              value={s}
              placeholder="추천 답변을 작성해 주세요"
              onChange={(e) =>
                changeOpening({
                  suggestions: opening.suggestions.map((v, j) => (i === j ? e.target.value : v)),
                })
              }
            />
          ))}
          <Field label="BGM" hint="재생 가능한 HTTPS 오디오 주소를 입력해 주세요.">
            <TextInput value={opening.bgm} onChange={(bgm) => changeOpening({ bgm })} />
          </Field>
        </>
      )}
      {section === 'media' && <MediaEditor work={work} onChange={onChange} />}
      {section === 'relations' && (
        <RelationGraph {...relationView} work={work} onChange={onChange} />
      )}
      {section === 'statuses' && (
        <>
          <h2>상태값 정의</h2>
          <p className="muted">상태값은 대화와 시나리오 조건에 사용됩니다.</p>
          {work.statuses.map((s, i) => (
            <DisclosureCard
              className="creator-card"
              expanded
              key={s.id}
              title={s.name || `상태값 ${i + 1}`}
              actions={
                <DeleteAction
                  title="상태값 삭제"
                  name={s.name}
                  needsConfirmation={requiresDeleteConfirmation('status', s)}
                  onDelete={() => {
                    const refs =
                      work.items.some(
                        (it) =>
                          it.enhancement?.currency === s.id || it.enhancement?.target === s.id,
                      ) || work.chapters.some((c) => c.conditions.some((k) => k.ref === s.id));
                    if (refs) {
                      notify(
                        '아이템 강화나 챕터 조건에서 참조 중입니다. 연결을 먼저 해제해 주세요.',
                      );
                      return;
                    }
                    updateStatuses(work.statuses.filter((x) => x.id !== s.id));
                  }}
                />
              }
            >
              <Field label="이름">
                <TextInput value={s.name} onChange={(name) => changeStatus(i, { name })} />
              </Field>
              <Field label="유형">
                <Segmented
                  value={{ number: '숫자', text: '문자(주관식)', choice: '문자(객관식)' }[s.type]}
                  values={['숫자', '문자(주관식)', '문자(객관식)']}
                  onChange={(v) =>
                    changeStatus(i, {
                      type: v === '숫자' ? 'number' : v === '문자(주관식)' ? 'text' : 'choice',
                      initial: v === '숫자' ? 0 : '',
                    })
                  }
                />
              </Field>
              {s.type === 'number' ? (
                <>
                  <div className="form-row">
                    <Field label="최솟값">
                      <NumberInput value={s.min} onChange={(min) => changeStatus(i, { min })} />
                    </Field>
                    <Field label="최댓값">
                      <NumberInput value={s.max} onChange={(max) => changeStatus(i, { max })} />
                    </Field>
                  </div>
                  <Field label="표기 방식">
                    <RadioOptions
                      value={s.displayMax ? '현재값 / 최댓값' : '현재값'}
                      values={['현재값', '현재값 / 최댓값']}
                      onChange={(v) => changeStatus(i, { displayMax: v === '현재값 / 최댓값' })}
                    />
                  </Field>
                  <Field label="초기값">
                    <NumberInput
                      value={Number(s.initial)}
                      onChange={(initial) => changeStatus(i, { initial })}
                    />
                  </Field>
                  <Field label="단위">
                    <TextInput value={s.unit} onChange={(unit) => changeStatus(i, { unit })} />
                  </Field>
                </>
              ) : s.type === 'choice' ? (
                <>
                  <Field label="선택지">
                    <KeywordInput
                      label="선택지"
                      value={s.options}
                      onChange={(options) => changeStatus(i, { options })}
                    />
                  </Field>
                  <Field label="초기값">
                    <Select
                      label="초기값"
                      value={String(s.initial)}
                      onChange={(initial) => changeStatus(i, { initial })}
                      options={[
                        { value: '', label: '선택하세요' },
                        ...s.options.map((option) => ({ value: option, label: option })),
                      ]}
                    />
                  </Field>
                </>
              ) : (
                <Field label="초기값">
                  <TextInput
                    value={String(s.initial)}
                    onChange={(initial) => changeStatus(i, { initial })}
                  />
                </Field>
              )}
              <Field label="프롬프트">
                <Area
                  value={s.prompt}
                  onChange={(prompt) => changeStatus(i, { prompt })}
                  placeholder="상태 설명과 증감 조건을 입력하세요."
                />
              </Field>
              {s.type === 'number' && (
                <div className="status-levels">
                  <h4>레벨 구간</h4>
                  {(s.levels ?? []).map((level, n) => (
                    <div className="status-level" key={n}>
                      <div className="form-row">
                        <Field label="구간 최솟값">
                          <NumberInput
                            value={level.min}
                            onChange={(min) =>
                              changeStatus(i, {
                                levels: s.levels!.map((l, j) => (j === n ? { ...l, min } : l)),
                              })
                            }
                          />
                        </Field>
                        <Field label="구간 최댓값">
                          <NumberInput
                            value={level.max}
                            onChange={(max) =>
                              changeStatus(i, {
                                levels: s.levels!.map((l, j) => (j === n ? { ...l, max } : l)),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Area
                        value={level.prompt}
                        onChange={(prompt) =>
                          changeStatus(i, {
                            levels: s.levels!.map((l, j) => (j === n ? { ...l, prompt } : l)),
                          })
                        }
                        placeholder="설정한 구간의 특징을 정의해 주세요."
                      />
                      <DeleteAction
                        title="구간 삭제"
                        label="구간 삭제"
                        className="button--danger"
                        needsConfirmation={
                          hasText(level.prompt) || level.min !== s.min || level.max !== s.max
                        }
                        onDelete={() =>
                          changeStatus(i, { levels: s.levels!.filter((_, j) => j !== n) })
                        }
                      />
                    </div>
                  ))}
                  <AddButton
                    onClick={() =>
                      changeStatus(i, {
                        levels: [...(s.levels ?? []), { min: s.min, max: s.max, prompt: '' }],
                      })
                    }
                  >
                    레벨 추가
                  </AddButton>
                </div>
              )}
            </DisclosureCard>
          ))}
          <AddButton
            onClick={() => {
              const name = nextStatusName(work.statuses);
              updateStatuses([
                ...work.statuses,
                {
                  id: id(),
                  name,
                  defaultName: name,
                  type: 'number',
                  initial: 0,
                  min: 0,
                  max: 100,
                  unit: '',
                  options: [],
                  prompt: '',
                },
              ]);
            }}
          >
            상태값 추가
          </AddButton>
          <hr />
          <h2>상태창 UI</h2>
          <div className="form-row" role="group" aria-label="상태창 예시">
            <Button
              disabled={!work.statuses.length}
              onClick={() =>
                update({ statusTemplate: statusTemplateExample(work.statuses, 'markdown') })
              }
            >
              예시 마크다운
            </Button>
            <Button
              disabled={!work.statuses.length}
              onClick={() =>
                update({ statusTemplate: statusTemplateExample(work.statuses, 'html') })
              }
            >
              예시 html
            </Button>
          </div>
          <Field
            label="문법 입력"
            hint="Markdown 또는 HTML. {{상태값 이름}}으로 현재 값을 표시합니다."
          >
            <Area
              value={work.statusTemplate}
              onChange={(statusTemplate) => update({ statusTemplate })}
              rows={7}
            />
          </Field>
          <Button
            disabled={!work.statusTemplate.trim()}
            onClick={() => setStatusPreview(clone(work))}
          >
            <Eye size={15} />
            미리보기
          </Button>
          {statusPreview && (
            <StatusDisplay
              work={statusPreview}
              runtime={initialState(statusPreview, statusPreview.openings[0].id)}
              collapsible={false}
            />
          )}
        </>
      )}
      {section === 'items' && (
        <>
          <h2>아이템 설정</h2>
          {work.items.map((item, i) => (
            <DisclosureCard
              className="creator-card"
              expanded
              key={item.id}
              title={item.name || `아이템 ${i + 1}`}
              actions={
                <DeleteAction
                  title="아이템 삭제"
                  name={item.name}
                  needsConfirmation={requiresDeleteConfirmation('item', item)}
                  onDelete={() => {
                    if (work.chapters.some((c) => c.conditions.some((k) => k.ref === item.id))) {
                      notify('챕터 조건의 참조를 먼저 해제해 주세요.');
                      return;
                    }
                    update({ items: work.items.filter((x) => x.id !== item.id) });
                  }}
                />
              }
            >
              <div className="basic-info">
                <Field label="이미지" size="small">
                  <ImageUpload value={item.image} onChange={(image) => changeItem(i, { image })} />
                </Field>
                <div>
                  <Field label="이름">
                    <TextInput value={item.name} onChange={(name) => changeItem(i, { name })} />
                  </Field>
                  <Field label="초기 상태">
                    <RadioOptions
                      value={item.owned ? '소지' : '미소지'}
                      values={['소지', '미소지']}
                      onChange={(v) => changeItem(i, { owned: v === '소지' })}
                    />
                  </Field>
                  <Field label="유형">
                    <RadioOptions
                      value={item.enhancement ? '강화 가능' : '일반'}
                      values={['일반', '강화 가능']}
                      onChange={(v) =>
                        changeItem(i, {
                          enhancement:
                            v === '일반'
                              ? null
                              : {
                                  currency: '',
                                  target: '',
                                  costBase: 10,
                                  costStep: 10,
                                  gainBase: 10,
                                  gainStep: 10,
                                  probabilities: [
                                    1, 1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15,
                                    0.1, 0.08, 0.05, 0.03, 0.02, 0.01, 0.005,
                                  ],
                                  keepWeight: 7,
                                  resetWeight: 3,
                                },
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
              <Field label="프롬프트">
                <Area
                  value={item.prompt}
                  onChange={(prompt) => changeItem(i, { prompt })}
                  placeholder="아이템 설명과 획득·유실 조건을 입력하세요."
                />
              </Field>
              {item.enhancement && (
                <EnhancementEditor
                  value={item.enhancement}
                  statuses={work.statuses}
                  onChange={(enhancement) => changeItem(i, { enhancement })}
                />
              )}
            </DisclosureCard>
          ))}
          <AddButton
            onClick={() =>
              update({
                items: [
                  ...work.items,
                  { id: id(), name: '', image: '', owned: false, prompt: '', enhancement: null },
                ],
              })
            }
          >
            아이템 추가
          </AddButton>
        </>
      )}
      {section === 'scenarios' && (
        <>
          <h2>시나리오</h2>
          <ScenarioGraph
            work={work}
            onSelect={setChapterId}
            onAdd={(parent) => {
              if (work.chapters.some((c) => c.id === parent && c.type === 'ending')) return;
              const next: Chapter = {
                id: id(),
                name: `챕터 ${work.chapters.length + 1}`,
                defaultName: `챕터 ${work.chapters.length + 1}`,
                type: 'chapter',
                from: parent,
                mode: 'all',
                conditions: [],
                prologue: '',
                prompt: '',
                afterstory: true,
              };
              update({ chapters: [...work.chapters, next] });
              setChapterId(next.id);
            }}
          />
          {work.chapters.map(
            (c, i) =>
              c.id === chapterId && (
                <Modal
                  title="챕터 설정"
                  key={c.id}
                  closeOnBackdrop={false}
                  onClose={() => setChapterId(null)}
                >
                  <Field label="제목">
                    <TextInput value={c.name} onChange={(name) => changeChapter(i, { name })} />
                  </Field>
                  <Field label="이전 노드">
                    <Select
                      value={c.from}
                      onChange={(from) => changeChapter(i, { from })}
                      options={[
                        ...work.openings.map((o) => ({ id: o.id, name: o.name })),
                        ...work.chapters.filter((x) => x.id !== c.id && x.type !== 'ending'),
                      ].map((n) => ({ value: n.id, label: n.name || '이름 없음' }))}
                    />
                  </Field>
                  <Segmented
                    value={c.type === 'ending' ? '엔딩' : '챕터'}
                    values={['챕터', '엔딩']}
                    onChange={(v) => {
                      if (v === '엔딩' && work.chapters.some((x) => x.from === c.id)) {
                        notify(
                          '연결된 다음 챕터를 삭제하거나 이전 노드를 변경한 뒤 엔딩으로 바꿔 주세요.',
                        );
                        return;
                      }
                      changeChapter(i, { type: v === '엔딩' ? 'ending' : 'chapter' });
                    }}
                  />
                  <Field label="이동 조건">
                    <Segmented
                      value={c.mode === 'all' ? 'AND · 모두 충족' : 'OR · 하나라도 충족'}
                      values={['AND · 모두 충족', 'OR · 하나라도 충족']}
                      onChange={(v) =>
                        changeChapter(i, { mode: v.startsWith('AND') ? 'all' : 'any' })
                      }
                    />
                  </Field>
                  {!c.conditions.length && (
                    <p className="muted">조건 없음 · 연결된 챕터에서 자유롭게 이동 가능</p>
                  )}
                  {c.conditions.map((cond, j) => (
                    <ConditionEditor
                      key={cond.id}
                      value={cond}
                      work={work}
                      onChange={(v) =>
                        changeChapter(i, {
                          conditions: c.conditions.map((x, k) => (k === j ? v : x)),
                        })
                      }
                      onDelete={() =>
                        changeChapter(i, {
                          conditions: c.conditions.filter((x) => x.id !== cond.id),
                        })
                      }
                    />
                  ))}
                  <Button
                    onClick={() =>
                      changeChapter(i, {
                        conditions: [
                          ...c.conditions,
                          {
                            id: id(),
                            kind: 'number',
                            ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                            op: 'gte',
                            value: 0,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    조건 추가
                  </Button>
                  <Field label={c.type === 'ending' ? '엔딩 장면' : '프롤로그'}>
                    <Area
                      value={c.prologue}
                      onChange={(prologue) => changeChapter(i, { prologue })}
                    />
                  </Field>
                  <Field label="추가 프롬프트">
                    <Area value={c.prompt} onChange={(prompt) => changeChapter(i, { prompt })} />
                  </Field>
                  {c.type === 'ending' && (
                    <Toggle
                      label="후일담 허용"
                      value={c.afterstory}
                      onChange={(afterstory) => changeChapter(i, { afterstory })}
                    />
                  )}
                  <DeleteAction
                    title="챕터 삭제"
                    label="챕터 삭제"
                    className="button--danger"
                    name={c.name}
                    needsConfirmation={
                      work.chapters.some((x) => x.from === c.id) ||
                      requiresDeleteConfirmation('chapter', c)
                    }
                    description={
                      work.chapters.some((x) => x.from === c.id)
                        ? `다음 챕터 ${work.chapters.filter((x) => x.from === c.id).length}개가 이전 노드에 자동 연결됩니다. 삭제할 챕터의 조건과 내용은 제거되며, 다른 챕터의 조건과 내용은 그대로 유지됩니다.`
                        : '이 챕터의 조건과 내용이 삭제됩니다. 다른 챕터의 조건과 내용은 그대로 유지됩니다.'
                    }
                    onDelete={() => {
                      update({
                        chapters: work.chapters
                          .filter((x) => x.id !== c.id)
                          .map((x) => (x.from === c.id ? { ...x, from: c.from } : x)),
                      });
                      setChapterId(null);
                    }}
                  />
                  <Button className="primary full" onClick={() => setChapterId(null)}>
                    완료
                  </Button>
                </Modal>
              ),
          )}
        </>
      )}
      {section === 'shortcuts' && (
        <>
          <h2>단축어 설정</h2>
          <p className="muted">
            /roll은 기본 제공 주사위입니다. 별도의 단축어를 추가할 수 있습니다.
          </p>
          {work.shortcuts.map((s, i) => (
            <DisclosureCard
              className="creator-card"
              expanded
              key={s.id}
              title={`/${s.name || `단축어 ${i + 1}`}`}
              actions={
                <DeleteAction
                  title="단축어 삭제"
                  name={s.name}
                  needsConfirmation={requiresDeleteConfirmation('shortcut', s)}
                  onDelete={() =>
                    update({ shortcuts: work.shortcuts.filter((x) => x.id !== s.id) })
                  }
                />
              }
            >
              <ShortcutFields
                value={s}
                onChange={(value) =>
                  update({
                    shortcuts: work.shortcuts.map((x, j) => (j === i ? value : x)),
                  })
                }
              />
            </DisclosureCard>
          ))}
          <AddButton
            onClick={() =>
              update({
                shortcuts: [...work.shortcuts, { id: id(), name: '', description: '', prompt: '' }],
              })
            }
          >
            단축어 추가
          </AddButton>
        </>
      )}
      {section === 'effects' && (
        <>
          <h2>연출 설정</h2>
          <p className="muted">
            AI가 {'{{이름}}'}을 출력하면 보기 버튼이 나타납니다. 사용자가 누르면 화면 전체에서
            연출을 실행합니다.
          </p>
          {work.effects.map((s, i) => (
            <DisclosureCard
              className="creator-card"
              expanded
              key={s.id}
              title={s.name || `연출 ${i + 1}`}
              actions={
                <DeleteAction
                  title="연출 삭제"
                  name={s.name}
                  needsConfirmation={requiresDeleteConfirmation('effect', s)}
                  onDelete={() => update({ effects: work.effects.filter((x) => x.id !== s.id) })}
                />
              }
            >
              <Field label="이름">
                <TextInput
                  value={s.name}
                  onChange={(name) =>
                    update({ effects: work.effects.map((x, j) => (j === i ? { ...x, name } : x)) })
                  }
                />
              </Field>
              <Field label="발동 상황 프롬프트">
                <Area
                  value={s.prompt}
                  onChange={(prompt) =>
                    update({
                      effects: work.effects.map((x, j) => (j === i ? { ...x, prompt } : x)),
                    })
                  }
                />
              </Field>
              <EffectCodeEditor
                value={s}
                onChange={(patch) =>
                  update({
                    effects: work.effects.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                  })
                }
              />
              <div className="form-row">
                <Button onClick={() => setEffectPreview(s)}>
                  <Eye size={15} />
                  미리보기
                </Button>
              </div>
            </DisclosureCard>
          ))}
          <AddButton
            onClick={() =>
              update({
                effects: [...work.effects, { id: id(), name: '', prompt: '', content: '' }],
              })
            }
          >
            연출 추가
          </AddButton>
        </>
      )}
      {section === 'personas' && (
        <>
          <h2>추천 페르소나</h2>
          <PersonaLibrary
            tabs
            values={work.personas}
            onChange={(personas) => update({ personas })}
          />
        </>
      )}
      {section === 'guide' && (
        <>
          <h2>플레이가이드</h2>
          <Field label="내용">
            <Area
              value={work.guide}
              onChange={(guide) => update({ guide })}
              rows={16}
              placeholder="플레이 방법을 안내해 주세요. Markdown을 사용할 수 있습니다."
            />
          </Field>
          <Button onClick={() => setGuidePreview(work.guide)}>
            <Eye size={15} />
            미리보기
          </Button>
          {guidePreview !== null && (
            <PlayGuide
              className="guide-preview"
              label="플레이가이드 미리보기"
              content={guidePreview || '아직 내용이 없습니다.'}
            />
          )}
        </>
      )}
      {grouping && (
        <CharacterGroups work={work} onChange={onChange} onClose={() => setGrouping(false)} />
      )}
      {saveAs && (
        <Modal
          title={saveAs === 'lore' ? '로어북 저장' : '캐릭터 저장'}
          onClose={() => setSaveAs(null)}
        >
          <Field label="제목">
            <TextInput value={saveName} onChange={setSaveName} />
          </Field>
          <Button
            className="primary full"
            disabled={!saveName.trim()}
            onClick={() => {
              run(
                changeProfile((p) => {
                  if (saveAs === 'lore')
                    p.savedLore.push({
                      id: id(),
                      name: saveName.trim(),
                      entries: clone(work.lore),
                    });
                  else
                    p.savedCharacters.push({
                      id: id(),
                      name: saveName.trim(),
                      characters: clone(work.characters),
                    });
                }),
              );
              setSaveAs(null);
            }}
          >
            완료
          </Button>
        </Modal>
      )}
      {effectPreview && (
        <EffectPlayer
          effect={effectPreview}
          preview
          context={{
            personaName: '{{user}}',
            status: initialState(work, work.openings[0].id).status,
            inventory: initialState(work, work.openings[0].id).inventory,
            nodeId: work.openings[0].id,
          }}
          onClose={() => setEffectPreview(null)}
        />
      )}
      {library && (
        <Modal
          title={library === 'lore' ? '로어북 불러오기' : '캐릭터 불러오기'}
          onClose={() => setLibrary(null)}
        >
          {(library === 'lore' ? profile.savedLore : profile.savedCharacters).length === 0 && (
            <Empty>저장한 자료가 없습니다.</Empty>
          )}
          {library === 'lore'
            ? profile.savedLore.map((l) => (
                <Button
                  className="full"
                  key={l.id}
                  onClick={() => {
                    update({
                      lore: [...work.lore, ...clone(l.entries).map((e) => ({ ...e, id: id() }))],
                    });
                    setLibrary(null);
                  }}
                >
                  {l.name}
                </Button>
              ))
            : profile.savedCharacters.map((l) => (
                <Button
                  className="full"
                  key={l.id}
                  onClick={() => {
                    update({
                      characters: [
                        ...work.characters,
                        ...clone(l.characters).map((c) => ({
                          ...c,
                          id: id(),
                          lore: c.lore.map((x) => ({ ...x, id: id() })),
                        })),
                      ],
                    });
                    setLibrary(null);
                  }}
                >
                  {l.name}
                </Button>
              ))}
        </Modal>
      )}
    </div>
  );
}
function EnhancementEditor({
  value,
  statuses,
  onChange,
}: {
  value: NonNullable<Item['enhancement']>;
  statuses: StatusDef[];
  onChange: (v: NonNullable<Item['enhancement']>) => void;
}) {
  return (
    <div className="enhancement-editor">
      <CardSection title="강화 설정">
        <div className="form-row">
          {(['currency', 'target'] as const).map((key, i) => (
            <Field key={key} label={i === 0 ? '소모할 상태값' : '강화할 상태값'}>
              <Select
                label={i === 0 ? '소모할 상태값' : '강화할 상태값'}
                value={value[key]}
                onChange={(next) => onChange({ ...value, [key]: next })}
                options={[
                  { value: '', label: '선택하세요' },
                  ...statuses
                    .filter((s) => s.type === 'number')
                    .map((s) => ({ value: s.id, label: s.name || '이름 없음' })),
                ]}
              />
            </Field>
          ))}
        </div>
        <div className="form-row">
          {(['costBase', 'costStep', 'gainBase', 'gainStep'] as const).map((key, i) => (
            <Field
              key={key}
              label={['최초 비용', '비용 상승폭', '최초 상승값', '상승값 증가폭'][i]}
            >
              <NumberInput
                value={value[key]}
                min={0}
                onChange={(n) => onChange({ ...value, [key]: n })}
              />
            </Field>
          ))}
        </div>
      </CardSection>
      <CardSection title="강화 성공 확률">
        <div className="probabilities">
          {value.probabilities.map((p, i) => (
            <label key={i}>
              <span className="enhancement-level">+{i + 1}</span>
              <input
                aria-label={`강화 ${i + 1}단계 확률`}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Number((p * 100).toFixed(2))}
                onChange={(e) =>
                  onChange({
                    ...value,
                    probabilities: value.probabilities.map((v, j) =>
                      j === i ? Math.max(0, Math.min(100, Number(e.target.value))) / 100 : v,
                    ),
                  })
                }
              />
              <span className="enhancement-percent">%</span>
            </label>
          ))}
        </div>
      </CardSection>
      <CardSection title="강화 실패 확률">
        <div className="form-row">
          <Field label="유지 비율">
            <NumberInput
              value={value.keepWeight}
              min={0}
              onChange={(keepWeight) => onChange({ ...value, keepWeight })}
            />
          </Field>
          <Field label="초기화 비율">
            <NumberInput
              value={value.resetWeight}
              min={0}
              onChange={(resetWeight) => onChange({ ...value, resetWeight })}
            />
          </Field>
        </div>
        <p className="enhancement-failure-hint">
          실패 확률은 100% − 성공 확률입니다. 이 확률을 위 유지 : 초기화 비율로 나눕니다.
          <br />
          예: 성공 80%, 유지 7 : 초기화 3 → 유지 14%, 초기화 6%
        </p>
      </CardSection>
    </div>
  );
}
function EffectCodeEditor({
  value,
  onChange,
}: {
  value: Work['effects'][number];
  onChange: (patch: Partial<Work['effects'][number]>) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const exampleName = useRef<string | null>(null);
  const changeContent = (content: string) =>
    onChange({
      content,
      ...(exampleName.current && !value.name ? { name: exampleName.current } : {}),
    });
  return (
    <>
      {!value.content && (
        <div className="form-row" role="group" aria-label="연출 예시">
          {effectExamples.map((example) => (
            <Button
              key={example.name}
              onClick={() => {
                if (!input.current) return;
                exampleName.current = example.name;
                input.current.setSelectionRange(0, input.current.value.length);
                insertTextWithUndo(input.current, example.content, changeContent);
                exampleName.current = null;
              }}
            >
              {example.name} 예시
            </Button>
          ))}
        </div>
      )}
      <Field label="코드 입력">
        <Area inputRef={input} value={value.content} onChange={changeContent} />
      </Field>
    </>
  );
}

function ConditionEditor({
  value: c,
  work,
  onChange,
  onDelete,
}: {
  value: Condition;
  work: Work;
  onChange: (v: Condition) => void;
  onDelete: () => void;
}) {
  const refs =
    c.kind === 'number'
      ? work.statuses.filter((s) => s.type === 'number')
      : c.kind === 'choice'
        ? work.statuses.filter((s) => s.type === 'choice')
        : work.items.filter((i) => c.kind !== 'level' || i.enhancement);
  return (
    <div className="condition-row">
      <Select
        label="조건 유형"
        value={c.kind}
        onChange={(kind) =>
          onChange({
            ...c,
            kind: kind as Condition['kind'],
            ref: '',
            value: kind === 'item' ? true : kind === 'choice' ? '' : 0,
            op: ['choice', 'item'].includes(kind) ? 'eq' : 'gte',
          })
        }
        options={[
          { value: 'number', label: '숫자 상태' },
          { value: 'choice', label: '객관식 상태' },
          { value: 'item', label: '아이템 보유' },
          { value: 'level', label: '강화 단계' },
        ]}
      />
      <Select
        label="조건 대상"
        value={c.ref}
        onChange={(ref) => onChange({ ...c, ref })}
        options={[
          { value: '', label: '선택하세요' },
          ...refs.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      {c.kind === 'item' ? (
        <Select
          label="보유 조건"
          value={String(c.value)}
          onChange={(value) => onChange({ ...c, value: value === 'true' })}
          options={[
            { value: 'true', label: '보유' },
            { value: 'false', label: '미보유' },
          ]}
        />
      ) : c.kind === 'choice' ? (
        <Select
          label="조건 선택지"
          value={String(c.value)}
          onChange={(value) => onChange({ ...c, value })}
          options={[
            { value: '', label: '선택하세요' },
            ...(work.statuses
              .find((s) => s.id === c.ref)
              ?.options.map((value) => ({ value, label: value })) ?? []),
          ]}
        />
      ) : (
        <NumberInput value={Number(c.value)} onChange={(value) => onChange({ ...c, value })} />
      )}
      <Select
        label="조건 비교"
        value={c.op}
        onChange={(op) => onChange({ ...c, op: op as Condition['op'] })}
        options={[
          ...(['number', 'level'].includes(c.kind)
            ? [
                { value: 'gte', label: '이상' },
                { value: 'lte', label: '이하' },
              ]
            : []),
          { value: 'eq', label: '같음' },
          { value: 'ne', label: '다름' },
        ]}
      />
      <DeleteAction
        title="조건 삭제"
        needsConfirmation={hasText(c.ref) || c.value !== 0}
        onDelete={onDelete}
      />
    </div>
  );
}
