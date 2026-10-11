import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { db, XenoDatabase } from './db';
import Dexie from 'dexie';
import { applyImport, readImport } from './files';
import { defaultProfile } from '../domain/defaults';
import { decryptCredential, prepareCredential, readApiKey, saveApiKey } from './credentials';
beforeEach(() => db.credentials.clear());
afterAll(() => db.close());
it('persists ciphertext with a non-exportable key and restores after database reopen', async () => {
  await saveApiKey('fake-key-for-tests');
  const stored = (await db.credentials.get('openrouter'))!;
  expect(stored.key.extractable).toBe(false);
  expect(new TextDecoder().decode(stored.ciphertext)).not.toContain('fake-key-for-tests');
  await expect(crypto.subtle.exportKey('raw', stored.key)).rejects.toThrow();
  db.close();
  await db.open();
  expect(await readApiKey()).toBe('fake-key-for-tests');
  await saveApiKey('');
  expect(await readApiKey()).toBe('');
  expect(await db.credentials.count()).toBe(0);
});
it('uses a new IV and rejects modified ciphertext without leaking key details', async () => {
  const record = (await prepareCredential('fake-key-for-tests'))!;
  const another = (await prepareCredential('fake-key-for-tests'))!;
  expect(record.iv).not.toEqual(another.iv);
  new Uint8Array(record.ciphertext)[0] ^= 1;
  await expect(decryptCredential(record)).rejects.toThrow('저장된 API 키를 읽지 못했습니다');
});
it('waits for rapid key edits before reading a backup key and serializes deletion', async () => {
  const first = saveApiKey('fake-first');
  const last = saveApiKey('fake-last');
  expect(await readApiKey()).toBe('fake-last');
  await Promise.all([first, last]);
  const remove = saveApiKey('');
  expect(await readApiKey()).toBe('');
  await remove;
});
it('upgrades the existing database without losing profiles or works', async () => {
  const name = 'credential-upgrade-test';
  const old = new Dexie(name);
  old
    .version(1)
    .stores({
      workspaces: 'id, updatedAt',
      works: 'id, createdAt',
      rooms: 'id, updatedAt, folderId',
      profiles: 'id',
    });
  await old.table('profiles').put({ ...defaultProfile(), nickname: '기존 사용자' });
  old.close();
  const upgraded = new XenoDatabase(name);
  try {
    expect((await upgraded.profiles.get('profile'))!.nickname).toBe('기존 사용자');
    expect(await upgraded.credentials.count()).toBe(0);
  } finally {
    await upgraded.delete();
  }
});
it('imports a portable key encrypted locally and leaves existing keys alone for older backups', async () => {
  await db.profiles.put(defaultProfile());
  const data = {
    kind: 'xenotale.backup',
    schemaVersion: 2,
    profile: defaultProfile(),
    works: [],
    workspaces: [],
    rooms: [],
  };
  const portable = await readImport(
    new File(
      [JSON.stringify({ ...data, credentials: { openrouterApiKey: 'fake-imported-key' } })],
      'backup.json',
    ),
  );
  await saveApiKey('fake-existing-key');
  await applyImport(portable);
  expect(await readApiKey()).toBe('fake-imported-key');
  const stored = (await db.credentials.get('openrouter'))!;
  expect(stored.key.extractable).toBe(false);
  expect(JSON.stringify(stored)).not.toContain('fake-imported-key');
  await applyImport(await readImport(new File([JSON.stringify(data)], 'old-backup.json')));
  expect(await readApiKey()).toBe('fake-imported-key');
  await expect(
    readImport(
      new File(
        [JSON.stringify({ ...data, credentials: { openrouterApiKey: '' } })],
        'bad-backup.json',
      ),
    ),
  ).rejects.toThrow('형식');
});
