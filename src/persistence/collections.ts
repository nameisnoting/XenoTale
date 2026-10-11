import { db } from './db';
import { id } from '../domain/types';

// Placement changes are atomic: a work belongs to one user carousel after moving.
export async function setCarouselWorks(carouselId: string, workIds: string[]) {
  await db.transaction('rw', db.profiles, db.works, async () => {
    const profile = await db.profiles.get('profile');
    const target = profile?.carousels.find((c) => c.id === carouselId);
    if (!profile || !target) throw new Error('캐러셀을 찾을 수 없습니다.');
    const existing = new Set((await db.works.toArray()).map((w) => w.id));
    target.workIds = [...new Set(workIds)].filter((workId) => existing.has(workId));
    const moved = new Set(target.workIds);
    for (const carousel of profile.carousels)
      if (carousel.id !== carouselId)
        carousel.workIds = carousel.workIds.filter((w) => !moved.has(w));
    await db.profiles.put(profile);
  });
}

export async function moveCarouselWork(carouselId: string, workId: string) {
  await db.transaction('rw', db.profiles, db.works, async () => {
    const profile = await db.profiles.get('profile');
    const target = profile?.carousels.find((c) => c.id === carouselId);
    if (!profile || !target || !(await db.works.get(workId)))
      throw new Error('작품 또는 캐러셀이 없습니다.');
    for (const carousel of profile.carousels)
      if (carousel.id !== carouselId)
        carousel.workIds = carousel.workIds.filter((w) => w !== workId);
    if (!target.workIds.includes(workId)) target.workIds.push(workId);
    await db.profiles.put(profile);
  });
}

export async function deleteCarousel(carouselId: string) {
  await db.transaction('rw', db.profiles, async () => {
    const profile = await db.profiles.get('profile');
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
    profile.carousels = profile.carousels.filter((c) => c.id !== carouselId);
    profile.carouselOrder = profile.carouselOrder?.filter((id) => id !== carouselId);
    await db.profiles.put(profile);
  });
}

export async function saveRoomFolder(
  folderId: string | null,
  name: string,
  selectedRoomIds: string[],
) {
  if (!name.trim()) throw new Error('폴더 제목을 입력해 주세요.');
  return db.transaction('rw', db.profiles, db.rooms, async () => {
    const profile = await db.profiles.get('profile');
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
    let folder = folderId ? profile.folders.find((f) => f.id === folderId) : undefined;
    if (folderId && !folder) throw new Error('폴더를 찾을 수 없습니다.');
    if (!folder) {
      folder = { id: id(), name: name.trim(), pinned: false };
      profile.folders.push(folder);
    }
    folder.name = name.trim();
    const selected = new Set(selectedRoomIds);
    for (const room of await db.rooms.toArray()) {
      const destination = selected.has(room.id)
        ? folder.id
        : room.folderId === folder.id
          ? null
          : room.folderId;
      if (destination !== room.folderId)
        await db.rooms.update(room.id, { folderId: destination, revision: room.revision + 1 });
    }
    await db.profiles.put(profile);
    return folder.id;
  });
}
