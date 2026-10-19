import { downloadPackage, readPackage } from './package';
import { exposeAsset, type StoredAsset } from './assets';
import { cleanWork, repairLegacyRisuLore } from '../domain/workContent';
import { z } from 'zod';
import { gameBlockSchema } from '../domain/gamePanels';
import { actionSchema } from '../domain/actions';
import { risuSchema } from '../engine/risu/schema';
import { db } from './db';
import type { Work, Room, Runtime, Workspace } from '../domain/types';
import { clone, id } from '../domain/types';
import { validateWork } from '../domain/engine';
import { effectRecordSchema, effectSourceSchema, canCompleteEffect } from '../domain/effects';
import { presentationSchema } from '../domain/presentation';
import { mergeNotes } from '../domain/notes';
import { prepareCredential, readApiKey } from './credentials';

const imageString = z.string().max(15_000_000);
const str = z.string().max(2_000_000);
const short = z.string().max(1000);
const validation = z.object({ fingerprint: short, policy: z.number().int() });
const resources = z.array(short).max(100);
const identifier = short.refine((s) => !['__proto__', 'prototype', 'constructor'].includes(s));
const arr = <T extends z.ZodType>(s: T) => z.array(s).max(10000);
const relation = z.object({
  id: identifier,
  from: identifier,
  to: identifier,
  label: short,
  innerLabel: short.optional(),
});
const qualitySchema = z.object({
  style: short,
  ratio: short,
  pacing: short,
  length: short,
  difficulty: short,
  events: short,
  viewpoint: z.enum(['1인칭 주인공', '1인칭 관찰자', '3인칭 관찰자', '전지적 작가']),
  viewpointActorId: identifier.optional(),
  viewpointTargetId: identifier.optional(),
});
const lore = z.object({
  defaultName: short.optional(),
  id: identifier,
  name: short,
  keywords: arr(short),
  prompt: str,
  activation: z.enum(['keyword', 'always', 'reference']).optional(),
  group: short.optional(),
});
const persona = z.object({
  defaultName: short.optional(),
  id: identifier,
  name: short,
  image: imageString,
  prompt: str,
  gender: short.optional(),
});
const note = z.object({
  defaultName: short.optional(),
  id: identifier,
  name: short,
  body: str,
  enabled: z.boolean(),
  group: short,
});
const character = z.object({
  id: identifier,
  name: short,
  role: z.enum(['main', 'supporting', 'extra']),
  image: imageString,
  trigger: str,
  prompt: str,
  lore: arr(lore),
  group: short,
});
export const workSchema = z.object({
  actions: z.array(actionSchema).max(1000).optional(),
  risu: risuSchema.optional(),
  id: identifier,
  version: z.number().int().nonnegative(),
  title: short,
  description: str,
  cover: imageString,
  author: short,
  authorImage: imageString,
  prompt: str,
  systemMode: z.enum(['default', 'custom']),
  customSystem: str,
  quality: qualitySchema,
  characters: arr(character).default([]),
  lore: arr(lore),
  openings: arr(
    z.object({
      defaultName: short.optional(),
      id: identifier,
      name: short,
      body: str,
      suggestions: arr(str),
      bgm: str,
      presence: arr(identifier),
    }),
  ),
  statuses: arr(
    z.object({
      defaultName: short.optional(),
      id: identifier,
      name: short,
      type: z.enum(['number', 'text', 'choice']),
      initial: z.union([str, z.number().finite()]),
      min: z.number().finite(),
      max: z.number().finite(),
      unit: short,
      options: arr(short),
      displayMax: z.boolean().optional(),
      levels: arr(
        z.object({ min: z.number().finite(), max: z.number().finite(), prompt: str }),
      ).optional(),
      prompt: str,
    }),
  ),
  items: arr(
    z.object({
      id: identifier,
      name: short,
      image: imageString,
      owned: z.boolean(),
      quantity: z.number().int().min(0).max(1e6).optional(),
      prompt: str,
      enhancement: z
        .object({
          currency: identifier,
          target: identifier,
          costBase: z.number().finite(),
          costStep: z.number().finite(),
          gainBase: z.number().finite(),
          gainStep: z.number().finite(),
          probabilities: arr(z.number().min(0).max(1)),
          keepWeight: z.number().finite(),
          resetWeight: z.number().finite(),
        })
        .nullable(),
    }),
  ),
  relations: arr(relation),
  chapters: arr(
    z.object({
      defaultName: short.optional(),
      id: identifier,
      name: short,
      type: z.enum(['chapter', 'ending']),
      from: identifier,
      mode: z.enum(['all', 'any']),
      conditions: arr(
        z.object({
          id: identifier,
          kind: z.enum(['number', 'choice', 'item', 'level', 'quantity']),
          ref: identifier,
          op: z.enum(['gte', 'lte', 'eq', 'ne']),
          value: z.union([str, z.number().finite(), z.boolean()]),
        }),
      ),
      prologue: str,
      prompt: str,
      afterstory: z.boolean(),
      bgm: str.optional(),
    }),
  ),
  personas: arr(persona),
  guide: str.optional(),
  defaultUi: z.enum(['novel', 'visual-novel']).optional(),
  importSource: z.object({ format: z.literal('risu'), fileName: short, url: short }).optional(),
  relationsEnabled: z.boolean().optional(),
  innerUnlock: z
    .object({
      mode: z.enum(['all', 'any']),
      conditions: arr(
        z.object({
          id: identifier,
          kind: z.enum(['number', 'choice', 'item', 'level', 'quantity']),
          ref: identifier,
          op: z.enum(['gte', 'lte', 'eq', 'ne']),
          value: z.union([z.string(), z.number(), z.boolean()]),
        }),
      ),
    })
    .optional(),
  displayRules: arr(
    z.object({
      id: identifier,
      name: short,
      pattern: str,
      flags: short,
      replacement: str,
      enabled: z.boolean(),
    }),
  ).optional(),
  shortcuts: arr(z.object({ id: identifier, name: short, description: str, prompt: str })),
  effects: arr(
    z.object({
      id: identifier,
      name: short,
      prompt: str,
      content: str,
      actionIds: arr(identifier).optional(),
      resources: resources.optional(),
      validation: validation.optional(),
      mode: z.enum(['manual', 'auto']).optional(),
    }),
  ),
  media: z.object({
    assets: arr(
      z.object({
        id: identifier,
        name: short,
        url: short,
        size: z.number().nonnegative(),
        type: short,
      }),
    ).optional(),
    template: str,
    rangeMin: z.number().int().min(0).max(9999).optional(),
    rangeMax: z.number().int().min(0).max(9999).optional(),
    situationNames: str.optional(),
    registered: z.boolean().optional(),
    characters: arr(z.object({ code: short, characterId: identifier })),
    situations: arr(z.object({ code: short, name: short })),
  }),
  statusTemplate: str,
  statusPanels: arr(
    z.object({
      id: identifier,
      name: short,
      statusIds: arr(identifier).optional(),
      template: str,
      blocks: z.array(gameBlockSchema).max(100).optional(),
    }),
  ).optional(),
  characterGroups: arr(
    z.object({ defaultName: short.optional(), id: identifier, name: short, prompt: str }),
  ).optional(),
  relationPositions: z
    .record(identifier, z.object({ x: z.number().finite(), y: z.number().finite() }))
    .optional(),
  relationSplit: z.boolean().optional(),
  relationNodeIds: z.array(identifier).optional(),
});
const runtime = z.object({
  risu: z.record(z.string().max(1000), z.string().max(2_000_000)).optional(),
  presentation: presentationSchema.optional(),
  effectResults: z.array(effectRecordSchema).max(32).optional(),
  status: z.record(identifier, z.union([str, z.number().finite()])),
  inventory: z.record(
    identifier,
    z.object({
      owned: z.boolean(),
      level: z.number().int().nonnegative(),
      bonus: z.number().finite(),
      quantity: z.number().int().min(0).max(1e6).optional(),
    }),
  ),
  presence: arr(identifier),
  relationships: z.record(identifier, short),
  innerRelationships: z.record(identifier, short).optional(),
  generatedRelations: arr(relation).optional(),
  nodeId: identifier,
  visited: arr(identifier),
  turnCount: z.number().int().nonnegative(),
  ending: z.object({ id: identifier, allowAfterstory: z.boolean() }).nullable(),
});
const memory = z.object({
  id: identifier,
  title: short.optional(),
  body: str,
  kind: z.enum(['short', 'long']),
  sources: arr(str),
  createdAt: z.number(),
  manual: z.boolean(),
  active: z.boolean().optional(),
  consolidatedInto: identifier.optional(),
  eventSources: arr(str).optional(),
});
const roomSettings = z.object({
  uiType: z.enum(['novel', 'visual-novel']).optional(),
  uiSource: z.enum(['creator', 'default']).optional(),
  modelId: short,
  creativity: z.number().int().min(0).max(4),
  choices: z.boolean(),
  quality: qualitySchema,
  fontSize: z.number().min(10).max(40),
  lineHeight: z.number().min(14).max(80),
  letterSpacing: z.number().min(-2).max(10),
  profiles: z.boolean(),
  statusExpanded: z.boolean(),
  rerollPrompt: z.boolean(),
  autoSummary: z.boolean(),
  summaryEvery: z.number().int().min(5).max(100),
  longEvery: z.number().int().min(5).max(50),
  summaryModelId: short,
  shortSummaryPrompt: str.optional(),
  longSummaryPrompt: str.optional(),
});
const context = z.object({
  noteGroups: arr(short).optional(),
  noteGroupIds: z.record(short, identifier).optional(),
  shortcuts: arr(
    z.object({ id: identifier, name: short, description: str, prompt: str }),
  ).optional(),
  persona,
  personas: arr(persona).optional(),
  notes: arr(note),
  memories: arr(memory),
  settings: roomSettings,
});
const checkpoint = z.object({ runtime, context });
const candidate = z.object({
  id: identifier,
  body: str,
  choices: arr(str),
  checkpoint,
  changes: arr(str),
  usage: z.object({
    model: short,
    input: z.number().optional(),
    output: z.number().optional(),
    cost: z.number().optional(),
    cacheRead: z.number().optional(),
    reasoning: z.number().optional(),
  }),
  createdAt: z.number(),
});
const event = z.union([
  z.object({
    id: identifier,
    kind: z.literal('turn'),
    input: str,
    before: checkpoint,
    candidates: arr(candidate).min(1),
    selectedId: identifier,
    createdAt: z.number(),
    dice: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    id: identifier,
    kind: z.enum(['chapter', 'enhance', 'effect', 'action']),
    risuEvent: z.boolean().optional(),
    risuChat: z.object({ role: z.string().max(20), data: str }).optional(),
    effectResult: effectRecordSchema.optional(),
    effectOrigin: z.object({ effectId: identifier, source: effectSourceSchema }).optional(),
    body: str,
    before: checkpoint,
    after: checkpoint,
    changes: arr(str),
    createdAt: z.number(),
  }),
]);
export const roomSchema = z.object({
  id: identifier,
  name: short,
  work: workSchema,
  openingId: identifier,
  initial: checkpoint,
  current: checkpoint,
  timeline: arr(event),
  revision: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  pendingInput: str,
  folderId: short.nullable(),
  pinned: z.boolean(),
  branchFrom: z
    .object({ roomId: identifier, eventId: identifier, candidateId: identifier.optional() })
    .optional(),
});
const profileSchema = z.object({
  defaultNicknameMigrated: z.boolean().optional(),
  sharedPersonasMigrated: z.boolean().optional(),
  lastWorkspaceId: identifier.optional(),
  carouselOrder: arr(identifier).optional(),
  noteGroups: arr(short).optional(),
  noteGroupIds: z.record(short, identifier).optional(),
  id: z.literal('profile'),
  nickname: short,
  image: imageString,
  onboarded: z.boolean(),
  defaultModel: short,
  summaryModel: short,
  creatorTestModel: short.optional(),
  creatorAgentModel: short.optional(),
  carousels: arr(
    z.object({
      id: identifier,
      name: short,
      mode: z.enum(['slide', 'pages', 'widget']),
      workIds: arr(identifier),
    }),
  ),
  folders: arr(z.object({ id: identifier, name: short, pinned: z.boolean() })),
  personas: arr(persona),
  notes: arr(note),
  savedLore: arr(z.object({ id: identifier, name: short, entries: arr(lore) })),
  savedCharacters: arr(z.object({ id: identifier, name: short, characters: arr(character) })),
  hideExamples: z.boolean(),
});
const published = z.object({
  id: identifier,
  work: workSchema,
  owned: z.boolean(),
  hidden: z.boolean(),
  createdAt: z.number(),
});
const creatorIssueSchema = z.object({
  field: short.optional(),
  index: z.number().int().nonnegative().optional(),
  sectionIndex: z.number().int().nonnegative().optional(),
  message: str,
});
const workspace = z.object({
  id: identifier,
  work: workSchema,
  updatedAt: z.number(),
  revision: z.number(),
  publishedVersion: z.number(),
  createdAt: z.number(),
  testRoom: roomSchema.nullable().optional(),
  selectedPersonaId: identifier.optional(),
  selectedOpeningId: identifier.optional(),
  testCreativity: z.number().int().min(0).max(4).optional(),
  supporterSettings: z
    .object({
      agentModelId: short,
      testModelId: short,
      testCreativity: z.number().int().min(0).max(4),
    })
    .optional(),
  assistantHistory: arr(
    z.object({
      id: identifier,
      role: z.enum(['user', 'assistant']),
      text: str,
      applied: z.boolean().optional(),
      appliedIssues: arr(creatorIssueSchema).optional(),
      proposal: z
        .object({
          sections: arr(
            z.object({
              id: short,
              name: short,
              reason: str,
              replacement: z.record(short, z.unknown()),
            }),
          ),
          changes: arr(
            z
              .object({
                field: workSchema
                  .omit({
                    id: true,
                    version: true,
                    author: true,
                    authorImage: true,
                    importSource: true,
                    risu: true,
                  })
                  .keyof(),
                before: z.unknown(),
                after: z.unknown(),
              })
              .transform((change) => ({
                field: change.field,
                before: change.before,
                after: change.after,
              })),
          ),
          issues: arr(creatorIssueSchema).optional(),
        })
        .optional(),
    }),
  ).optional(),
});
const backup = z.object({
  kind: z.literal('xenotale.backup'),
  schemaVersion: z.literal(2),
  profile: profileSchema,
  works: arr(published),
  workspaces: arr(workspace),
  rooms: arr(roomSchema),
  credentials: z.object({ openrouterApiKey: z.string().trim().min(1).max(1000) }).optional(),
});
export type Backup = z.infer<typeof backup>;
export type ImportData = (
  | { kind: 'work'; work: Work }
  | { kind: 'room'; room: Room }
  | { kind: 'workspace'; workspace: Workspace }
  | { kind: 'backup'; data: Backup }
) & { assets?: StoredAsset[]; warnings?: string[] };
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportWork(work: Work) {
  await downloadPackage(`${work.title || '작품'}.xeno`, {
    kind: 'xenotale.work',
    schemaVersion: 2,
    work,
  });
}
export async function exportRoom(room: Room) {
  await downloadPackage(`${room.name}.room.xeno`, {
    kind: 'xenotale.room',
    schemaVersion: 2,
    room,
  });
}
export async function exportWorkspace(value: Workspace) {
  await downloadPackage(`${value.work.title || '제목 없음'}.xeno`, {
    kind: 'xenotale.workspace',
    schemaVersion: 2,
    workspace: value,
  });
}
export async function exportBackup({ includeApiKey = true }: { includeApiKey?: boolean } = {}) {
  const apiKey = includeApiKey ? await readApiKey() : '';
  const value = await db.transaction(
    'r',
    db.profiles,
    db.works,
    db.workspaces,
    db.rooms,
    async () => ({
      kind: 'xenotale.backup',
      schemaVersion: 2,
      profile: await db.profiles.get('profile'),
      works: await db.works.toArray(),
      workspaces: await db.workspaces.toArray(),
      rooms: await db.rooms.toArray(),
      ...(apiKey ? { credentials: { openrouterApiKey: apiKey } } : {}),
    }),
  );
  await downloadPackage(`XenoTale_${new Date().toISOString().slice(0, 10)}.backup.xeno`, value);
}
function validateRoom(room: Room, publish = true) {
  // Creator tests may start with an unfinished draft when playing an opening effect.
  if (publish) validateWork(room.work, true);
  for (const e of room.timeline)
    if (e.kind === 'turn' && !e.candidates.some((c) => c.id === e.selectedId))
      throw new Error('선택된 응답을 찾을 수 없는 대화방 파일입니다.');
  if (!room.work.openings.some((o) => o.id === room.openingId))
    throw new Error('도입부 참조가 잘못되었습니다.');
  const effectRecords = new Map(
    room.timeline.flatMap((e, index) =>
      e.kind === 'effect' && e.effectResult
        ? [[e.id, { record: e.effectResult, index }] as const]
        : [],
    ),
  );
  const check = (state: Runtime, through = room.timeline.length) => {
    const w = room.work;
    const invalid = () => {
      throw new Error('대화 스냅샷의 상태 또는 참조가 올바르지 않습니다.');
    };
    const relations = [...w.relations, ...(state.generatedRelations ?? [])];
    const relationIds = new Set(w.relations.map((r) => r.id));
    const pairs = new Set(w.relations.map((r) => JSON.stringify([r.from, r.to])));
    const actors = new Set(['user', ...w.characters.map((c) => c.id)]);
    for (const relation of state.generatedRelations ?? []) {
      const pair = JSON.stringify([relation.from, relation.to]);
      if (
        relationIds.has(relation.id) ||
        pairs.has(pair) ||
        relation.from === relation.to ||
        !actors.has(relation.from) ||
        !actors.has(relation.to)
      )
        invalid();
      relationIds.add(relation.id);
      pairs.add(pair);
    }
    if (new Set(state.effectResults?.map((r) => r.id)).size !== (state.effectResults?.length ?? 0))
      invalid();
    for (const record of state.effectResults ?? []) {
      const saved = effectRecords.get(record.id);
      if (
        !saved ||
        saved.index > through ||
        JSON.stringify(saved.record) !== JSON.stringify(record)
      )
        invalid();
    }
    if (
      Object.keys(state.status).length !== w.statuses.length ||
      Object.keys(state.inventory).length !== w.items.length ||
      Object.keys(state.relationships).length !== relations.length
    )
      invalid();
    for (const s of w.statuses) {
      const v = state.status[s.id];
      if (
        s.type === 'number'
          ? typeof v !== 'number' || v < s.min || v > s.max
          : typeof v !== 'string' || (s.type === 'choice' && !s.options.includes(v))
      )
        invalid();
    }
    for (const item of w.items) {
      const v = state.inventory[item.id];
      if (
        !v ||
        v.bonus < 0 ||
        v.level > (item.enhancement?.probabilities.length ?? 0) ||
        (!item.enhancement && v.bonus !== 0)
      )
        invalid();
    }
    if (
      relations.some((r) => typeof state.relationships[r.id] !== 'string') ||
      state.presence.some((p) => !w.characters.some((c) => c.id === p)) ||
      new Set(state.presence).size !== state.presence.length
    )
      invalid();
    if (
      state.innerRelationships &&
      Object.keys(state.innerRelationships).some((key) => !relationIds.has(key))
    )
      invalid();
    const nodes = [...w.openings, ...w.chapters];
    if (
      !nodes.some((n) => n.id === state.nodeId) ||
      state.visited.some((id) => !nodes.some((n) => n.id === id))
    )
      invalid();
    if (state.ending) {
      const ending = w.chapters.find((c) => c.id === state.ending!.id);
      if (
        !ending ||
        ending.type !== 'ending' ||
        ending.id !== state.nodeId ||
        ending.afterstory !== state.ending.allowAfterstory
      )
        invalid();
    }
  };
  check(room.initial.runtime, -1);
  if (room.initial.runtime.effectResults?.length)
    throw new Error('도입부 초기 상태에 연출 결과가 있습니다.');
  check(room.current.runtime);
  if (new Set(room.timeline.map((t) => t.id)).size !== room.timeline.length)
    throw new Error('중복된 대화 ID가 있습니다.');
  let turns = 0;
  for (const [index, event] of room.timeline.entries()) {
    check(event.before.runtime, index - 1);
    if (event.before.runtime.turnCount !== turns) throw new Error('대화 순서가 올바르지 않습니다.');
    if (event.kind === 'turn') {
      turns++;
      if (new Set(event.candidates.map((c) => c.id)).size !== event.candidates.length)
        throw new Error('중복 응답 ID가 있습니다.');
      event.candidates.forEach((c) => {
        check(c.checkpoint.runtime, index);
        if (c.checkpoint.runtime.turnCount !== turns)
          throw new Error('응답 순서가 올바르지 않습니다.');
      });
    } else {
      check(event.after.runtime, index);
      if (event.after.runtime.turnCount !== turns)
        throw new Error('연출·챕터·강화 순서가 올바르지 않습니다.');
      if (event.kind === 'effect') {
        const record = event.effectResult;
        const prefix = { ...room, current: event.before, timeline: room.timeline.slice(0, index) };
        if (
          !record ||
          record.id !== event.id ||
          !canCompleteEffect(prefix, record.effectId, record.source) ||
          JSON.stringify(event.after.runtime.effectResults?.at(-1)) !== JSON.stringify(record)
        )
          throw new Error('연출 결과의 장면 참조가 올바르지 않습니다.');
      } else if (event.effectResult) throw new Error('연출 결과의 종류가 올바르지 않습니다.');
    }
  }
  if (room.current.runtime.turnCount !== turns)
    throw new Error('현재 대화 횟수가 일치하지 않습니다.');
}
export async function readImport(file: File): Promise<ImportData> {
  let value: any;
  let assets: StoredAsset[] = [];
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (header[0] === 0x50 && header[1] === 0x4b && !/\.charx$/i.test(file.name)) {
    ({ value, assets } = await readPackage(file));
  } else if (/\.(?:charx|png|jpe?g)$/i.test(file.name)) {
    return (await import('./risu')).readRisu(file);
  } else {
    if (file.size > 50 * 1024 * 1024) throw new Error('JSON 파일은 50MB 이하로 선택해 주세요.');
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error('작품 파일을 읽을 수 없습니다.');
    }
    if (value.spec === 'chara_card_v2' || value.spec === 'chara_card_v3') {
      const risu = await import('./risu');
      return risu.preserveRisuSource(await risu.convertRisu(value, file.name), file);
    }
  }
  if (value.schemaVersion !== 2)
    throw new Error('지원하지 않는 파일 버전입니다. 현재 앱에서 내보낸 파일을 사용해 주세요.');
  try {
    if (value.kind === 'xenotale.work') {
      const work = cleanWork(workSchema.parse(value.work));
      validateWork(work, true);
      return { kind: 'work', work, ...(assets.length ? { assets } : {}) };
    }
    if (value.kind === 'xenotale.workspace') {
      const entry = workspace.parse(value.workspace);
      if (entry.testRoom) validateRoom(entry.testRoom, false);
      entry.work = cleanWork(entry.work);
      return { kind: 'workspace', workspace: entry, ...(assets.length ? { assets } : {}) };
    }
    if (value.kind === 'xenotale.room') {
      const room = roomSchema.parse(value.room);
      validateRoom(room);
      return { kind: 'room', room, ...(assets.length ? { assets } : {}) };
    }
    if (value.kind === 'xenotale.backup') {
      const data = backup.parse(value);
      for (const entry of [...data.works, ...data.workspaces])
        entry.work = repairLegacyRisuLore(entry.work);
      data.works.forEach((w) => validateWork(w.work, true));
      data.rooms.forEach((room) => validateRoom(room));
      data.workspaces.forEach((workspace) => {
        if (workspace.testRoom) validateRoom(workspace.testRoom, false);
      });
      return { kind: 'backup', data, ...(assets.length ? { assets } : {}) };
    }
  } catch (e) {
    if (e instanceof z.ZodError) throw new Error('파일의 데이터 형식이 올바르지 않습니다.');
    throw e;
  }
  throw new Error('XenoTale 작품·작업 공간·대화방·백업 파일을 선택해 주세요.');
}
export async function applyImport(value: ImportData) {
  // Encrypt before starting the transaction; native crypto promises cannot keep IndexedDB alive.
  const credential =
    value.kind === 'backup' && value.data.credentials
      ? await prepareCredential(value.data.credentials.openrouterApiKey)
      : undefined;
  await db.transaction(
    'rw',
    [db.works, db.workspaces, db.rooms, db.profiles, db.credentials, db.assets],
    async () => {
      if (value.assets?.length) await db.assets.bulkPut(value.assets);
      if (value.kind === 'work') {
        const existing = await db.works.get(value.work.id);
        if (existing) {
          if (JSON.stringify(existing.work) === JSON.stringify(value.work))
            throw new Error('이미 등록된 작품입니다.');
          const work = clone(value.work);
          work.id = id();
          await db.works.add({
            id: work.id,
            work,
            owned: false,
            hidden: false,
            createdAt: Date.now(),
          });
        } else
          await db.works.add({
            id: value.work.id,
            work: value.work,
            owned: false,
            hidden: false,
            createdAt: Date.now(),
          });
      } else if (value.kind === 'room') {
        const room = clone(value.room);
        room.id = id();
        room.folderId = null;
        room.revision = 0;
        room.updatedAt = Date.now();
        await db.rooms.add(room);
      } else if (value.kind === 'workspace') {
        const entry = clone(value.workspace);
        entry.id = id();
        entry.work.id = id();
        entry.revision = 0;
        entry.publishedVersion = 0;
        entry.updatedAt = Date.now();
        await db.workspaces.add(entry);
      } else
        await db.transaction(
          'rw',
          [db.works, db.workspaces, db.rooms, db.profiles, db.credentials],
          async () => {
            const data = clone(value.data);
            const workMap = new Map<string, string>();
            const roomMap = new Map(data.rooms.map((r) => [r.id, id()]));
            const folderMap = new Map(data.profile.folders.map((f) => [f.id, id()]));
            const workId = (old: string) => {
              if (!workMap.has(old)) workMap.set(old, id());
              return workMap.get(old)!;
            };
            for (const w of data.works) {
              w.id = workId(w.work.id);
              w.work.id = w.id;
              await db.works.add(w);
            }
            for (const w of data.workspaces) {
              w.id = id();
              w.work.id = workId(w.work.id);
              w.revision = 0;
              await db.workspaces.add(w);
            }
            for (const r of data.rooms) {
              r.id = roomMap.get(r.id)!;
              r.work.id = workId(r.work.id);
              r.folderId = r.folderId ? (folderMap.get(r.folderId) ?? null) : null;
              if (r.branchFrom)
                r.branchFrom.roomId = roomMap.get(r.branchFrom.roomId) ?? r.branchFrom.roomId;
              r.revision = 0;
              await db.rooms.add(r);
            }
            const p = (await db.profiles.get('profile'))!;
            p.folders.push(
              ...data.profile.folders.map((f) => ({ ...f, id: folderMap.get(f.id)! })),
            );
            p.carousels.push(
              ...data.profile.carousels.map((c) => ({
                ...c,
                id: id(),
                name: `${c.name} · 복원`,
                workIds: c.workIds.map((w) => workMap.get(w)).filter((x): x is string => !!x),
              })),
            );
            p.personas.push(...data.profile.personas.map((p) => ({ ...p, id: id() })));
            Object.assign(p, mergeNotes(p, data.profile));
            p.savedLore.push(...data.profile.savedLore.map((n) => ({ ...n, id: id() })));
            p.savedCharacters.push(
              ...data.profile.savedCharacters.map((n) => ({ ...n, id: id() })),
            );
            await db.profiles.put(p);
            if (credential) await db.credentials.put(credential);
          },
        );
    },
  );
  value.assets?.forEach(exposeAsset);
}
