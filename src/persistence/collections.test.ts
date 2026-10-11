import 'fake-indexeddb/auto';
import { beforeEach, afterAll, expect, it } from 'vitest';
import { db, commitRoom, removeFolder } from './db';
import { defaultProfile } from '../domain/defaults';
import { exampleWork } from '../test/exampleWork';
import { createRoom } from '../domain/engine';
import { deleteCarousel, moveCarouselWork, saveRoomFolder, setCarouselWorks } from './collections';
beforeEach(async () => {
  await Promise.all([db.profiles.clear(), db.works.clear(), db.rooms.clear()]);
  const profile = defaultProfile();
  profile.carousels = [
    { id: 'a', name: 'A', mode: 'slide', workIds: ['one'] },
    { id: 'b', name: 'B', mode: 'pages', workIds: ['one', 'two'] },
    { id: 'c', name: 'C', mode: 'widget', workIds: [] },
  ];
  profile.carouselOrder = ['a', 'b', 'c', 'library-examples'];
  await db.profiles.add(profile);
  await db.works.bulkAdd(
    ['one', 'two'].map((id) => ({
      id,
      work: { ...exampleWork(), id },
      owned: true,
      hidden: false,
      createdAt: 1,
    })),
  );
});
afterAll(() => db.close());
it('moves a work once, removes old duplicated placements, and preserves the work', async () => {
  const original = await db.works.toArray();
  await moveCarouselWork('c', 'one');
  await moveCarouselWork('c', 'one');
  expect((await db.profiles.get('profile'))?.carousels.map((c) => c.workIds)).toEqual([
    [],
    ['two'],
    ['one'],
  ]);
  expect(await db.works.toArray()).toEqual(original);
});
it('applies a picker selection in order, ignores deleted works, and atomically moves memberships', async () => {
  await setCarouselWorks('c', ['two', 'missing', 'one', 'two']);
  expect((await db.profiles.get('profile'))?.carousels.map((c) => c.workIds)).toEqual([
    [],
    [],
    ['two', 'one'],
  ]);
  await setCarouselWorks('c', []);
  expect(await db.works.count()).toBe(2);
  expect((await db.profiles.get('profile'))?.carousels.every((c) => !c.workIds.length)).toBe(true);
});
it('rejects missing destinations without losing source placements', async () => {
  const original = await db.profiles.get('profile');
  await expect(moveCarouselWork('missing', 'one')).rejects.toThrow();
  await expect(setCarouselWorks('missing', ['one'])).rejects.toThrow();
  expect(await db.profiles.get('profile')).toEqual(original);
});
it('deleting a carousel removes only its grouping and order entry', async () => {
  const room = createRoom(exampleWork());
  await db.rooms.add(room);
  await deleteCarousel('b');
  expect((await db.profiles.get('profile'))?.carouselOrder).toEqual(['a', 'c', 'library-examples']);
  expect(await db.works.count()).toBe(2);
  expect(await db.rooms.get(room.id)).toEqual(room);
});
it('folder membership preserves latest room content and guards against stale chat writes', async () => {
  const room = createRoom(exampleWork());
  await db.rooms.add(room);
  const folderId = await saveRoomFolder(null, ' 첫 폴더 ', [room.id]);
  const moved = (await db.rooms.get(room.id))!;
  expect(moved.folderId).toBe(folderId);
  expect(moved.timeline).toEqual(room.timeline);
  await expect(commitRoom(room, room.revision)).rejects.toThrow();
  const second = await saveRoomFolder(null, '다른 폴더', [room.id]);
  expect((await db.rooms.get(room.id))?.folderId).toBe(second);
  await removeFolder(second);
  expect((await db.rooms.get(room.id))?.folderId).toBeNull();
  expect((await db.rooms.get(room.id))?.revision).toBe(3);
  expect((await db.rooms.get(room.id))?.timeline).toEqual(room.timeline);
  expect((await db.profiles.get('profile'))?.folders[0].name).toBe('첫 폴더');
});
it('a deleted folder cannot be recreated by an old membership dialog', async () => {
  const room = createRoom(exampleWork());
  await db.rooms.add(room);
  await expect(saveRoomFolder('missing', '폴더', [room.id])).rejects.toThrow();
  expect(await db.rooms.get(room.id)).toEqual(room);
  expect((await db.profiles.get('profile'))?.folders).toEqual([]);
});
