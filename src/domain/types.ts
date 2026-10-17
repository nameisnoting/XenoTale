import type { CreatorMessage } from './creatorAssistant';
export type ChatUiType = 'novel' | 'visual-novel';
export type CodeValidation = { fingerprint: string; policy: number };
export type Presentation = {
  background?: string;
  music?: string | null;
  uiType?: ChatUiType;
  theme?: { textbox?: string; text?: string };
};

export type Viewpoint = '1인칭 주인공' | '1인칭 관찰자' | '3인칭 관찰자' | '전지적 작가';
export const VIEWPOINTS: Viewpoint[] = [
  '1인칭 주인공',
  '1인칭 관찰자',
  '3인칭 관찰자',
  '전지적 작가',
];
export const CREATIVITY = ['매우 낮음', '낮음', '보통', '높음', '매우 높음'] as const;
export type Character = {
  id: string;
  name: string;
  role: 'main' | 'supporting' | 'extra';
  image: string;
  trigger: string;
  prompt: string;
  lore: Lore[];
  group: string;
};
export type Lore = {
  defaultName?: string;
  id: string;
  name: string;
  keywords: string[];
  prompt: string;
};
export type Persona = {
  defaultName?: string;
  id: string;
  name: string;
  image: string;
  prompt: string;
  gender?: string;
};
export type Note = {
  defaultName?: string;
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  group: string;
};
export type StatusDef = {
  defaultName?: string;
  id: string;
  name: string;
  type: 'number' | 'text' | 'choice';
  initial: string | number;
  min: number;
  max: number;
  unit: string;
  options: string[];
  displayMax?: boolean;
  levels?: { min: number; max: number; prompt: string }[];
  prompt: string;
};
export type Relation = { id: string; from: string; to: string; label: string; innerLabel?: string };
export type Item = {
  id: string;
  name: string;
  image: string;
  owned: boolean;
  prompt: string;
  enhancement: null | {
    currency: string;
    target: string;
    costBase: number;
    costStep: number;
    gainBase: number;
    gainStep: number;
    probabilities: number[];
    keepWeight: number;
    resetWeight: number;
  };
};
export type Condition = {
  id: string;
  kind: 'number' | 'choice' | 'item' | 'level';
  ref: string;
  op: 'gte' | 'lte' | 'eq' | 'ne';
  value: string | number | boolean;
};
export type Chapter = {
  defaultName?: string;
  id: string;
  name: string;
  type: 'chapter' | 'ending';
  from: string;
  mode: 'all' | 'any';
  conditions: Condition[];
  prologue: string;
  prompt: string;
  afterstory: boolean;
  bgm?: string;
};
export type Opening = {
  defaultName?: string;
  id: string;
  name: string;
  body: string;
  suggestions: string[];
  bgm: string;
  presence: string[];
};
export type Quality = {
  style: string;
  ratio: string;
  pacing: string;
  length: string;
  difficulty: string;
  events: string;
  viewpoint: Viewpoint;
  viewpointActorId?: string;
  viewpointTargetId?: string;
};
export type Shortcut = { id: string; name: string; description: string; prompt: string };
export type Work = {
  id: string;
  version: number;
  title: string;
  description: string;
  cover: string;
  author: string;
  authorImage: string;
  prompt: string;
  systemMode: 'default' | 'custom';
  customSystem: string;
  quality: Quality;
  defaultUi?: ChatUiType;
  characters: Character[];
  lore: Lore[];
  openings: Opening[];
  statuses: StatusDef[];
  items: Item[];
  relations: Relation[];
  chapters: Chapter[];
  personas: Persona[];
  guide?: string;
  shortcuts: Shortcut[];
  effects: {
    id: string;
    name: string;
    prompt: string;
    content: string;
    resources?: string[];
    validation?: CodeValidation;
    mode?: 'manual' | 'auto';
  }[];
  displayRules?: {
    id: string;
    name: string;
    pattern: string;
    flags: string;
    replacement: string;
    enabled: boolean;
  }[];
  media: {
    assets?: { id: string; name: string; url: string; size: number; type: string }[];
    template: string;
    rangeMin?: number;
    rangeMax?: number;
    situationNames?: string;
    registered?: boolean;
    characters: { code: string; characterId: string }[];
    situations: { code: string; name: string }[];
  };
  statusTemplate: string;
  chatUi?: { enabled?: boolean; code: string; resources?: string[]; validation?: CodeValidation };
  characterGroups?: { defaultName?: string; id: string; name: string; prompt: string }[];
  relationPositions?: Record<string, { x: number; y: number }>;
  relationSplit?: boolean;
  relationsEnabled?: boolean;
  innerUnlock?: { mode: 'all' | 'any'; conditions: Condition[] };
  relationNodeIds?: string[];
};
export type Workspace = {
  id: string;
  work: Work;
  updatedAt: number;
  revision: number;
  publishedVersion: number;
  createdAt: number;
  supporterSettings?: {
    agentModelId: string;
    testModelId: string;
    testCreativity: number;
  };
  assistantHistory?: CreatorMessage[];
  testRoom?: Room | null;
  selectedPersonaId?: string;
  selectedOpeningId?: string;
  testCreativity?: number;
};
export type PublishedWork = {
  id: string;
  work: Work;
  owned: boolean;
  hidden: boolean;
  createdAt: number;
};
export type Runtime = {
  presentation?: Presentation;
  effectResults?: EffectRecord[];
  status: Record<string, string | number>;
  inventory: Record<string, { owned: boolean; level: number; bonus: number }>;
  presence: string[];
  relationships: Record<string, string>;
  innerRelationships?: Record<string, string>;
  // Room-local edges belong to each checkpoint, never to the creator's Work.
  generatedRelations?: Relation[];
  nodeId: string;
  visited: string[];
  turnCount: number;
  ending: null | { id: string; allowAfterstory: boolean };
};
export type Memory = {
  id: string;
  title?: string;
  body: string;
  kind: 'short' | 'long';
  sources: string[];
  createdAt: number;
  manual: boolean;
  active?: boolean;
  consolidatedInto?: string;
  eventSources?: string[];
};
export type RoomSettings = {
  uiType?: ChatUiType;
  uiSource?: 'creator' | 'default';
  modelId: string;
  creativity: number;
  choices: boolean;
  quality: Quality;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  profiles: boolean;
  statusExpanded: boolean;
  rerollPrompt: boolean;
  autoSummary: boolean;
  summaryEvery: number;
  longEvery: number;
  summaryModelId: string;
  shortSummaryPrompt?: string;
  longSummaryPrompt?: string;
};
export type Context = {
  noteGroups?: string[];
  noteGroupIds?: Record<string, string>;
  shortcuts?: Shortcut[];
  persona: Persona;
  personas?: Persona[];
  notes: Note[];
  memories: Memory[];
  settings: RoomSettings;
};
export type Checkpoint = { runtime: Runtime; context: Context };
export type Usage = {
  input?: number;
  output?: number;
  cost?: number;
  cacheRead?: number;
  reasoning?: number;
  model: string;
};
export type Candidate = {
  id: string;
  body: string;
  choices: string[];
  checkpoint: Checkpoint;
  changes: string[];
  usage: Usage;
  createdAt: number;
};
export type Turn = {
  id: string;
  kind: 'turn';
  input: string;
  before: Checkpoint;
  candidates: Candidate[];
  selectedId: string;
  createdAt: number;
  dice?: number;
};
export type LocalEvent = {
  id: string;
  kind: 'chapter' | 'enhance' | 'effect';
  effectResult?: EffectRecord;
  body: string;
  before: Checkpoint;
  after: Checkpoint;
  changes: string[];
  createdAt: number;
};
export type EffectSource = { eventId: string; candidateId?: string; occurrence: number };
export type EffectResult = {
  summary: string;
  outcome?: string;
  score?: number;
  data?: Record<string, string | number | boolean | null>;
};
export type EffectRecord = {
  id: string;
  effectId: string;
  effectName: string;
  source: EffectSource;
  result: EffectResult;
  presentation?: Presentation;
  createdAt: number;
};
export type TimelineEvent = Turn | LocalEvent;
export type Room = {
  id: string;
  name: string;
  work: Work;
  openingId: string;
  initial: Checkpoint;
  current: Checkpoint;
  timeline: TimelineEvent[];
  revision: number;
  createdAt: number;
  updatedAt: number;
  pendingInput: string;
  folderId: string | null;
  pinned: boolean;
  branchFrom?: { roomId: string; eventId: string; candidateId?: string };
};
export type Carousel = {
  id: string;
  name: string;
  mode: 'slide' | 'pages' | 'widget';
  workIds: string[];
};
export type Folder = { id: string; name: string; pinned: boolean };
export type Profile = {
  defaultNicknameMigrated?: boolean;
  id: 'profile';
  lastWorkspaceId?: string;
  sharedPersonasMigrated?: boolean;
  noteGroups?: string[];
  noteGroupIds?: Record<string, string>;
  nickname: string;
  image: string;
  onboarded: boolean;
  defaultModel: string;
  summaryModel: string;
  creatorTestModel?: string;
  creatorAgentModel?: string;
  carousels: Carousel[];
  carouselOrder?: string[];
  folders: Folder[];
  personas: Persona[];
  notes: Note[];
  savedLore: { id: string; name: string; entries: Lore[] }[];
  savedCharacters: { id: string; name: string; characters: Character[] }[];
  hideExamples: boolean;
};
export type Model = {
  id: string;
  name: string;
  context_length: number;
  supported_parameters: string[];
  top_provider?: { max_completion_tokens?: number };
  reasoning?: {
    supported_efforts?: string[] | null;
    supports_max_tokens?: boolean;
    mandatory?: boolean;
  };
  pricing?: { prompt: string; completion: string };
};
export const id = () => crypto.randomUUID();
export const clone = <T>(v: T): T => structuredClone(v);
export const selected = (t: Turn): Candidate => t.candidates.find((c) => c.id === t.selectedId)!;
export const after = (event: TimelineEvent) =>
  event.kind === 'turn' ? selected(event).checkpoint : event.after;
export const fingerprint = (t: Turn) => `${t.id}:${t.selectedId}`;
