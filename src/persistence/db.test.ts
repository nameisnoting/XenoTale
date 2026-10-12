import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  db,
  saveWorkspace,
  commitRoom,
  publishWorkspace,
  removeWorkspaces,
  rememberWorkspace,
  lastWorkspace,
  migrateProvidedSystemPrompts,
  migrateSharedModels,
  changeProfile,
} from './db';
import { workspace, defaultProfile } from '../domain/defaults';
import { exampleWork } from '../test/exampleWork';
import { DEFAULT_CHAT_UI, codeApproval } from '../domain/chatUi';
import { createRoom } from '../domain/engine';
import { SYSTEM_PROMPT } from '../domain/systemPrompt';
import legacyPrompt from '../engine/prompts/narrator_legacy_v2.txt?raw';
import plainPrompt from '../engine/prompts/narrator_plain_v2.txt?raw';
beforeEach(async () => {
  await Promise.all([
    db.workspaces.clear(),
    db.rooms.clear(),
    db.works.clear(),
    db.profiles.clear(),
  ]);
});
afterAll(() => db.close());
describe('revision transactions', () => {
  it('migrates the most recent legacy choices once, keeping room and workspace history unchanged', async () => {
    const profile = defaultProfile();
    delete profile.creatorTestModel;
    delete profile.creatorAgentModel;
    const first = createRoom(exampleWork(), 'old/chat');
    first.updatedAt = 100;
    const latest = createRoom(exampleWork(), 'recent/chat');
    latest.current.context.settings.summaryModelId = 'recent/summary';
    latest.updatedAt = 200;
    const firstWorkspace = workspace('작가');
    firstWorkspace.updatedAt = 100;
    firstWorkspace.supporterSettings = {
      agentModelId: 'old/agent',
      testModelId: 'old/test',
      testCreativity: 2,
    };
    const latestWorkspace = workspace('작가');
    latestWorkspace.updatedAt = 200;
    latestWorkspace.supporterSettings = {
      agentModelId: 'recent/agent',
      testModelId: 'recent/test',
      testCreativity: 3,
    };
    await db.profiles.add(profile);
    await db.rooms.bulkAdd([first, latest]);
    await db.workspaces.bulkAdd([firstWorkspace, latestWorkspace]);
    await migrateSharedModels();
    expect(await db.profiles.get('profile')).toMatchObject({
      defaultModel: 'recent/chat',
      summaryModel: 'recent/summary',
      creatorAgentModel: 'recent/agent',
      creatorTestModel: 'recent/test',
    });
    await changeProfile((p) => {
      p.defaultModel = 'chosen/chat';
      p.summaryModel = 'chosen/summary';
      p.creatorAgentModel = 'chosen/agent';
      p.creatorTestModel = 'chosen/test';
    });
    await migrateSharedModels();
    expect(await db.profiles.get('profile')).toMatchObject({
      defaultModel: 'chosen/chat',
      summaryModel: 'chosen/summary',
      creatorAgentModel: 'chosen/agent',
      creatorTestModel: 'chosen/test',
    });
    expect(await db.rooms.get(first.id)).toEqual(first);
    expect(await db.rooms.get(latest.id)).toEqual(latest);
    expect(await db.workspaces.get(firstWorkspace.id)).toEqual(firstWorkspace);
    expect(await db.workspaces.get(latestWorkspace.id)).toEqual(latestWorkspace);
  });
  it('seeds missing creator selections from chat without replacing existing global choices', async () => {
    const profile = {
      ...defaultProfile(),
      defaultModel: 'selected/chat',
      creatorAgentModel: 'selected/agent',
    };
    delete profile.creatorTestModel;
    await db.profiles.add(profile);
    await db.rooms.add(createRoom(exampleWork(), 'stale/chat'));
    await migrateSharedModels();
    expect(await db.profiles.get('profile')).toMatchObject({
      defaultModel: 'selected/chat',
      creatorAgentModel: 'selected/agent',
      creatorTestModel: 'selected/chat',
    });
  });
  it.each([legacyPrompt, plainPrompt])(
    'refreshes unchanged default prompts in drafts/library while preserving edited prompts and room snapshots',
    async (previousPrompt) => {
      const unchanged = workspace('작가');
      unchanged.work = { ...exampleWork(), customSystem: previousPrompt };
      const edited = workspace('작가');
      edited.work.customSystem = previousPrompt + '\n내 서사 규칙';
      await db.workspaces.bulkAdd([unchanged, edited]);
      await db.works.add({
        id: unchanged.work.id,
        work: unchanged.work,
        owned: true,
        hidden: false,
        createdAt: Date.now(),
      });
      const room = createRoom(unchanged.work);
      await db.rooms.add(room);
      await migrateProvidedSystemPrompts();
      const upgraded = (await db.workspaces.get(unchanged.id))!;
      expect(upgraded.work.customSystem).toBe(SYSTEM_PROMPT);
      expect(upgraded.revision).toBe(unchanged.revision + 1);
      expect(upgraded.updatedAt).toBe(unchanged.updatedAt);
      expect((await db.works.get(unchanged.work.id))?.work.customSystem).toBe(SYSTEM_PROMPT);
      expect(await db.workspaces.get(edited.id)).toEqual(edited);
      expect(await db.rooms.get(room.id)).toEqual(room);
      await expect(saveWorkspace(unchanged, unchanged.revision)).rejects.toThrow();
      await migrateProvidedSystemPrompts();
      expect(await db.workspaces.get(unchanged.id)).toEqual(upgraded);
    },
  );
  it('resumes the last opened draft and falls back safely after it is deleted', async () => {
    await db.profiles.add(defaultProfile());
    const older = workspace('작가');
    const newer = { ...workspace('작가'), updatedAt: older.updatedAt + 1000 };
    await db.workspaces.bulkAdd([older, newer]);
    expect((await lastWorkspace())?.id).toBe(newer.id);
    await rememberWorkspace(older.id);
    expect((await lastWorkspace())?.id).toBe(older.id);
    expect((await db.workspaces.get(older.id))?.revision).toBe(0);
    await removeWorkspaces([older.id]);
    expect((await db.profiles.get('profile'))?.lastWorkspaceId).toBeUndefined();
    expect((await lastWorkspace())?.id).toBe(newer.id);
    await removeWorkspaces([newer.id]);
    await rememberWorkspace(older.id);
    expect(await lastWorkspace()).toBeUndefined();
    expect((await db.profiles.get('profile'))?.lastWorkspaceId).toBeUndefined();
  });
  it('deletes only confirmed drafts, preserves published works/rooms, and rejects stale autosave', async () => {
    const first = workspace('작가');
    const second = workspace('작가');
    const newer = workspace('작가');
    await db.workspaces.bulkAdd([first, second, newer]);
    const room = createRoom(exampleWork());
    await db.rooms.add(room);
    await db.works.add({
      id: 'published',
      work: exampleWork(),
      owned: true,
      hidden: false,
      createdAt: Date.now(),
    });
    await removeWorkspaces([first.id, second.id]);
    expect((await db.workspaces.toArray()).map((w) => w.id)).toEqual([newer.id]);
    expect(await db.rooms.get(room.id)).toEqual(room);
    expect(await db.works.count()).toBe(1);
    await expect(saveWorkspace(first, 0)).rejects.toThrow();
    expect(await db.workspaces.get(first.id)).toBeUndefined();
  });
  it('rejects a stale autosave rather than replacing newer data', async () => {
    const w = workspace('작가');
    await db.workspaces.add(w);
    const first = await saveWorkspace({ ...w, work: { ...w.work, title: '최신' } }, 0);
    await expect(
      saveWorkspace({ ...w, work: { ...w.work, title: '오래된 값' } }, 0),
    ).rejects.toThrow();
    expect((await db.workspaces.get(w.id))?.work.title).toBe('최신');
    expect(first.revision).toBe(1);
  });
  it('only commits one of two competing conversation writes', async () => {
    const r = createRoom(exampleWork());
    await db.rooms.add(r);
    const results = await Promise.allSettled([
      commitRoom({ ...r, name: 'A' }, 0),
      commitRoom({ ...r, name: 'B' }, 0),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.rooms.get(r.id))?.revision).toBe(1);
  });
  it('publishing creates a version and leaves existing room definitions immutable', async () => {
    const w = workspace('작가');
    w.work = exampleWork();
    w.work.chatUi = { code: DEFAULT_CHAT_UI, validation: codeApproval(DEFAULT_CHAT_UI) };
    await db.workspaces.add(w);
    const r = createRoom(w.work);
    await db.rooms.add(r);
    await saveWorkspace({ ...w, work: { ...w.work, title: '새 제목' } }, 0);
    const published = await publishWorkspace(w.id);
    expect(published.publishedVersion).toBe(1);
    expect((await db.works.get(w.work.id))?.work.title).toBe('새 제목');
    expect((await db.rooms.get(r.id))?.work.title).toBe('정원 앞에서');
  });
});
