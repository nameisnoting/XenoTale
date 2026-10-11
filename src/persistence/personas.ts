import type { XenoDatabase } from './db';
import type { Persona } from '../domain/types';
import { clone, id } from '../domain/types';
import { defaultPersona } from '../domain/defaults';

async function syncRooms(database: XenoDatabase, personas: Persona[], skipRoomId?: string) {
  for (const room of await database.rooms.toArray()) {
    if (room.id === skipRoomId) continue;
    const context = room.current.context;
    const shared = personas.find((p) => p.id === context.persona.id);
    // Only current settings change. Completed messages and historical checkpoints stay intact.
    if (shared && JSON.stringify(shared) !== JSON.stringify(context.persona)) {
      context.persona = clone(shared);
      room.revision++;
      room.updatedAt = Date.now();
      await database.rooms.put(room);
    }
  }
}
export async function createSharedPersona(database: XenoDatabase, source?: Persona) {
  return database.transaction('rw', database.profiles, async () => {
    const profile = await database.profiles.get('profile');
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
    const persona: Persona = source
      ? { ...clone(source), id: id(), defaultName: '' }
      : {
          id: id(),
          name: `페르소나 ${profile.personas.length + 1}`,
          defaultName: `페르소나 ${profile.personas.length + 1}`,
          image: '',
          prompt: '',
          gender: '',
        };
    // New entries follow the bottom add button; authored copies stay at the top.
    if (source) profile.personas.unshift(persona);
    else profile.personas.push(persona);
    await database.profiles.put(profile);
    return persona;
  });
}
export async function updateSharedPersona(
  database: XenoDatabase,
  personaId: string,
  patch: Partial<Persona>,
  skipRoomId?: string,
) {
  await database.transaction('rw', database.profiles, database.rooms, async () => {
    const profile = await database.profiles.get('profile');
    const persona = profile?.personas.find((p) => p.id === personaId);
    if (!profile || !persona) throw new Error('페르소나를 찾을 수 없습니다.');
    Object.assign(persona, patch, { id: personaId });
    await database.profiles.put(profile);
    await syncRooms(database, profile.personas, skipRoomId);
  });
}
export async function deleteSharedPersona(
  database: XenoDatabase,
  personaId: string,
  skipRoomId?: string,
) {
  await database.transaction('rw', database.profiles, database.rooms, async () => {
    const profile = await database.profiles.get('profile');
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.');
    profile.personas = profile.personas.filter((p) => p.id !== personaId);
    await database.profiles.put(profile);
    for (const room of await database.rooms.toArray()) {
      if (room.id === skipRoomId || room.current.context.persona.id !== personaId) continue;
      room.current.context.persona = clone(
        room.work.personas[0] ?? profile.personas[0] ?? defaultPersona(),
      );
      room.revision++;
      room.updatedAt = Date.now();
      await database.rooms.put(room);
    }
  });
}
// Upgrade old room-local libraries into the shared library without discarding existing edits.
export async function migrateSharedPersonas(database: XenoDatabase) {
  await database.transaction('rw', database.profiles, database.rooms, async () => {
    const profile = await database.profiles.get('profile');
    if (!profile || profile.sharedPersonasMigrated) return;
    const values = new Map(profile.personas.map((p) => [p.id, p]));
    const rooms = (await database.rooms.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
    let changed = false;
    for (const room of rooms) {
      const context = room.current.context;
      const local = [...(context.personas ?? [])];
      if (!room.work.personas.some((p) => p.id === context.persona.id)) local.push(context.persona);
      for (const persona of local)
        if (!values.has(persona.id)) {
          values.set(persona.id, clone(persona));
          changed = true;
        }
      if (context.personas !== undefined) {
        delete context.personas;
        room.revision++;
        await database.rooms.put(room);
      }
    }
    if (changed) profile.personas = [...values.values()];
    profile.sharedPersonasMigrated = true;
    await database.profiles.put(profile);
    await syncRooms(database, [...values.values()]);
  });
}
