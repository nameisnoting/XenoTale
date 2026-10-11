import Dexie, { liveQuery, type Table } from 'dexie';
import { useEffect, useState } from 'react';
import type { Workspace, PublishedWork, Room, Profile } from '../domain/types';
import { clone } from '../domain/types';
import { defaultProfile } from '../domain/defaults';
import { validateWork } from '../domain/engine';
import { upgradeProvidedSystemPrompt } from '../domain/systemPrompt';
import { migrateSharedPersonas } from './personas';
import type { StoredCredential } from './credentials';

export class XenoDatabase extends Dexie {
  workspaces!: Table<Workspace, string>;
  works!: Table<PublishedWork, string>;
  rooms!: Table<Room, string>;
  profiles!: Table<Profile, string>;
  credentials!: Table<StoredCredential, string>;
  constructor(name = 'xenotale-v1') {
    super(name);
    this.version(1).stores({
      workspaces: 'id, updatedAt',
      works: 'id, createdAt',
      rooms: 'id, updatedAt, folderId',
      profiles: 'id',
    });
    this.version(2).stores({ credentials: 'id' });
  }
}
export const db = new XenoDatabase();
let initializePromise: Promise<void> | undefined;
export function initialize() {
  return (initializePromise ??= db.transaction(
    'rw',
    [db.profiles, db.works, db.rooms, db.workspaces],
    async () => {
      if (!(await db.profiles.get('profile'))) {
        await db.profiles.add(defaultProfile());
      }
      await migrateDefaultNickname(db);
      await migrateSharedPersonas(db);
      await migrateProvidedSystemPrompts(db);
    },
  ));
}
export async function migrateProvidedSystemPrompts(database = db) {
  await database.transaction('rw', database.workspaces, database.works, async () => {
    for (const entry of await database.workspaces.toArray()) {
      const work = upgradeProvidedSystemPrompt(entry.work);
      if (work !== entry.work)
        await database.workspaces.put({ ...entry, work, revision: entry.revision + 1 });
    }
    for (const entry of await database.works.toArray()) {
      const work = upgradeProvidedSystemPrompt(entry.work);
      if (work !== entry.work) await database.works.put({ ...entry, work });
    }
  });
}
export async function migrateDefaultNickname(database = db) {
  const profile = await database.profiles.get('profile');
  if (!profile || profile.defaultNicknameMigrated) return;
  if (profile.nickname === '이야기꾼') profile.nickname = defaultProfile().nickname;
  profile.defaultNicknameMigrated = true;
  await database.profiles.put(profile);
}
export function useLive<T>(query: () => Promise<T>, fallback: T, deps: unknown[] = []): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    const s = liveQuery(query).subscribe({
      next: setData,
      error: (e) => console.error('로컬 자료 읽기 실패', e.name),
    });
    return () => s.unsubscribe();
  }, deps);
  return data;
}
export async function changeProfile(update: (profile: Profile) => void) {
  await db.transaction('rw', db.profiles, async () => {
    const p = await db.profiles.get('profile');
    if (!p) throw new Error('프로필을 찾을 수 없습니다.');
    update(p);
    await db.profiles.put(p);
  });
}
export async function saveWorkspace(entry: Workspace, expectedRevision: number) {
  return db.transaction('rw', db.workspaces, async () => {
    const old = await db.workspaces.get(entry.id);
    if (!old || old.revision !== expectedRevision)
      throw new Error(
        '다른 창에서 작업이 변경되었습니다. 현재 내용을 파일로 저장한 뒤 다시 열어 주세요.',
      );
    const saved = { ...clone(entry), revision: old.revision + 1, updatedAt: Date.now() };
    await db.workspaces.put(saved);
    return saved;
  });
}
export async function publishWorkspace(workspaceId: string) {
  return db.transaction('rw', db.workspaces, db.works, async () => {
    const entry = await db.workspaces.get(workspaceId);
    if (!entry) throw new Error('작업 공간이 없습니다.');
    validateWork(entry.work, true);
    const work = clone(entry.work);
    work.version = entry.publishedVersion + 1;
    await db.works.put({ id: work.id, work, owned: true, hidden: false, createdAt: Date.now() });
    entry.publishedVersion = work.version;
    entry.work.version = work.version;
    entry.revision += 1;
    entry.updatedAt = Date.now();
    await db.workspaces.put(entry);
    return entry;
  });
}
export async function commitRoom(next: Room, expectedRevision: number) {
  return db.transaction('rw', db.rooms, async () => {
    const current = await db.rooms.get(next.id);
    if (!current || current.revision !== expectedRevision)
      throw new Error(
        '다른 작업으로 대화가 변경되었습니다. 새 상태를 확인한 뒤 다시 시도해 주세요.',
      );
    const saved = { ...clone(next), revision: current.revision + 1, updatedAt: Date.now() };
    await db.rooms.put(saved);
    return saved;
  });
}
export async function removeWork(workId: string) {
  await db.transaction('rw', db.works, db.profiles, async () => {
    await db.works.delete(workId);
    const p = await db.profiles.get('profile');
    if (p) {
      p.carousels.forEach((c) => (c.workIds = c.workIds.filter((x) => x !== workId)));
      await db.profiles.put(p);
    }
  });
}
export async function removeWorkspaces(workspaceIds: string[]) {
  // Delete the confirmed snapshot only; new workspaces opened in other tabs survive.
  await db.transaction('rw', db.workspaces, db.profiles, async () => {
    await db.workspaces.bulkDelete([...new Set(workspaceIds)]);
    const profile = await db.profiles.get('profile');
    if (profile?.lastWorkspaceId && workspaceIds.includes(profile.lastWorkspaceId)) {
      delete profile.lastWorkspaceId;
      await db.profiles.put(profile);
    }
  });
}
export async function rememberWorkspace(workspaceId: string) {
  await db.transaction('rw', db.workspaces, db.profiles, async () => {
    if (await db.workspaces.get(workspaceId))
      await db.profiles.update('profile', { lastWorkspaceId: workspaceId });
  });
}
export async function lastWorkspace() {
  const profile = await db.profiles.get('profile');
  const remembered = profile?.lastWorkspaceId
    ? await db.workspaces.get(profile.lastWorkspaceId)
    : undefined;
  return remembered ?? (await db.workspaces.orderBy('updatedAt').last());
}
export async function removeFolder(folderId: string) {
  await db.transaction('rw', db.profiles, db.rooms, async () => {
    const p = await db.profiles.get('profile');
    if (!p) return;
    p.folders = p.folders.filter((f) => f.id !== folderId);
    await db.profiles.put(p);
    await db.rooms
      .where('folderId')
      .equals(folderId)
      .modify((room) => {
        room.folderId = null;
        room.revision += 1;
      });
  });
}
