import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { migrateDefaultNickname, XenoDatabase } from './db';
import { DEFAULT_NICKNAMES, defaultProfile } from '../domain/defaults';
const database = new XenoDatabase('nickname-migration-tests');
beforeEach(() => database.profiles.clear());
afterAll(() => database.close());
it.each([false, true])(
  'migrates an existing default nickname once (onboarded=%s)',
  async (onboarded) => {
    await database.profiles.put({
      ...defaultProfile(),
      defaultNicknameMigrated: undefined,
      nickname: '이야기꾼',
      onboarded,
    });
    await migrateDefaultNickname(database);
    const migrated = (await database.profiles.get('profile'))!;
    expect(DEFAULT_NICKNAMES).toContain(migrated.nickname);
    expect(migrated.defaultNicknameMigrated).toBe(true);
    await migrateDefaultNickname(database);
    expect((await database.profiles.get('profile'))!.nickname).toBe(migrated.nickname);
    await database.profiles.update('profile', { nickname: '이야기꾼' });
    await migrateDefaultNickname(database);
    expect((await database.profiles.get('profile'))!.nickname).toBe('이야기꾼');
  },
);
it('keeps a custom existing nickname and marks migration complete', async () => {
  await database.profiles.put({
    ...defaultProfile(),
    defaultNicknameMigrated: undefined,
    nickname: '내 닉네임',
  });
  await migrateDefaultNickname(database);
  expect((await database.profiles.get('profile'))!.nickname).toBe('내 닉네임');
  expect((await database.profiles.get('profile'))!.defaultNicknameMigrated).toBe(true);
});
