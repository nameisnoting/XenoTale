import { SYSTEM_PROMPT } from './systemPrompt';
import { SUMMARY_POLICY, SUMMARY_PROMPTS } from './memory';
import type { Work, Profile, Persona, Quality, RoomSettings, Workspace } from './types';
import { id } from './types';
export const quality: Quality = {
  style: '설정 안 함',
  ratio: '자연스럽게',
  pacing: '자연스럽게',
  length: '자연스럽게',
  difficulty: '보통',
  events: '없음',
  viewpoint: '전지적 작가',
};
export const defaultPersona = (): Persona => ({ id: id(), name: '여행자', image: '', prompt: '' });
export const settings = (modelId = 'demo'): RoomSettings => ({
  modelId,
  creativity: 2,
  choices: true,
  quality: { ...quality },
  fontSize: 14,
  lineHeight: 28,
  letterSpacing: 0,
  profiles: true,
  statusExpanded: true,
  rerollPrompt: true,
  autoSummary: true,
  summaryEvery: SUMMARY_POLICY.short.default,
  longEvery: SUMMARY_POLICY.long.default,
  summaryModelId: modelId,
  shortSummaryPrompt: SUMMARY_PROMPTS.short,
  longSummaryPrompt: SUMMARY_PROMPTS.long,
});
export const DEFAULT_NICKNAMES = [
  'Rex',
  'Shulk',
  'Noah',
  'Ushia',
  'Peneuma',
  'Logos',
  'Homura',
  'Hikari',
] as const;
export const defaultProfile = (): Profile => ({
  id: 'profile',
  defaultNicknameMigrated: true,
  nickname: DEFAULT_NICKNAMES[Math.floor(Math.random() * DEFAULT_NICKNAMES.length)],
  image: '',
  onboarded: false,
  defaultModel: 'demo',
  summaryModel: 'demo',
  creatorTestModel: 'demo',
  creatorAgentModel: 'demo',
  carousels: [],
  folders: [],
  personas: [],
  notes: [],
  savedLore: [],
  savedCharacters: [],
  hideExamples: false,
});
export function emptyWork(author = '이야기꾼'): Work {
  const cid = id();
  return {
    id: id(),
    version: 0,
    title: '',
    description: '',
    cover: '',
    author,
    authorImage: '',
    prompt: '',
    systemMode: 'custom',
    customSystem: SYSTEM_PROMPT,
    quality: { ...quality },
    characters: [
      { id: cid, name: '', role: 'main', image: '', trigger: '', prompt: '', lore: [], group: '' },
    ],
    lore: [],
    openings: [
      {
        id: id(),
        name: '도입부 1',
        defaultName: '도입부 1',
        body: '',
        suggestions: ['', '', ''],
        bgm: '',
        presence: [cid],
      },
    ],
    statuses: [],
    items: [],
    relations: [],
    chapters: [],
    personas: [{ id: id(), name: '', image: '', prompt: '' }],
    shortcuts: [],
    effects: [],
    defaultUi: 'novel',
    relationsEnabled: false,
    media: { template: '', characters: [], situations: [] },
    statusTemplate: '',
  };
}
export function workspace(author: string): Workspace {
  const now = Date.now();
  return {
    id: id(),
    work: emptyWork(author),
    updatedAt: now,
    revision: 0,
    publishedVersion: 0,
    createdAt: now,
  };
}
