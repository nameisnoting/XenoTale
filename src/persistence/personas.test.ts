import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { XenoDatabase } from './db';
import {
  createSharedPersona,
  updateSharedPersona,
  deleteSharedPersona,
  migrateSharedPersonas,
} from './personas';
import { defaultProfile } from '../domain/defaults';
import { exampleWork } from '../test/exampleWork';
import { createRoom } from '../domain/engine';
import { clone } from '../domain/types';
const database = new XenoDatabase('persona-unit-tests');
const personal = {
  id: 'personal',
  name: '사용자',
  image: '',
  prompt: '사용자 설정',
  gender: '여성',
};
beforeEach(async () => {
  await database.rooms.clear();
  await database.profiles.clear();
  await database.profiles.put({ ...defaultProfile(), personas: [clone(personal)] });
});
afterAll(() => database.close());
describe('shared persona library', () => {
  it('promotes old room-local personas and preserves newer shared edits', async () => {
    const room = createRoom(exampleWork());
    room.current.context.personas = [
      { ...personal, prompt: '옛 설정' },
      { ...personal, id: 'legacy', name: '방 안에서 생성' },
    ];
    room.current.context.persona = room.current.context.personas[0];
    await database.rooms.put(room);
    await migrateSharedPersonas(database);
    const profile = await database.profiles.get('profile'),
      saved = await database.rooms.get(room.id);
    expect(profile!.personas).toHaveLength(2);
    expect(profile!.personas[0].prompt).toBe('사용자 설정');
    expect(saved!.current.context.personas).toBeUndefined();
    expect(saved!.current.context.persona.prompt).toBe('사용자 설정');
    await migrateSharedPersonas(database);
    expect((await database.profiles.get('profile'))!.personas).toHaveLength(2);
  });
  it('updates current selections in other rooms while preserving history', async () => {
    const a = createRoom(exampleWork()),
      b = createRoom(exampleWork());
    a.current.context.persona = clone(personal);
    b.current.context.persona = clone(personal);
    await database.rooms.bulkPut([a, b]);
    await updateSharedPersona(database, personal.id, { prompt: '새 공통 설정' });
    expect((await database.rooms.toArray()).map((r) => r.current.context.persona.prompt)).toEqual([
      '새 공통 설정',
      '새 공통 설정',
    ]);
    expect((await database.rooms.get(a.id))!.initial).toEqual(a.initial);
  });
  it('skips the room committed through the UI mutation queue', async () => {
    const room = createRoom(exampleWork());
    room.current.context.persona = clone(personal);
    await database.rooms.put(room);
    await updateSharedPersona(database, personal.id, { name: '갱신' }, room.id);
    expect((await database.rooms.get(room.id))!.revision).toBe(0);
    expect((await database.profiles.get('profile'))!.personas[0].name).toBe('갱신');
  });
  it('copies authored personas to the top with a separate identity', async () => {
    const authored = exampleWork().personas[0],
      copy = await createSharedPersona(database, authored);
    expect(copy).toEqual({ ...authored, id: copy.id, defaultName: '' });
    expect(copy.id).not.toBe(authored.id);
    expect((await database.profiles.get('profile'))!.personas[0].id).toBe(copy.id);
    await updateSharedPersona(database, copy.id, { prompt: '개인 수정' });
    expect(authored.prompt).not.toBe('개인 수정');
    await deleteSharedPersona(database, copy.id);
    expect((await database.profiles.get('profile'))!.personas.map((p) => p.id)).toEqual([
      personal.id,
    ]);
  });
  it('allows deletion of the selected persona and repairs selections in all rooms', async () => {
    const a = createRoom(exampleWork()),
      b = createRoom(exampleWork());
    a.current.context.persona = clone(personal);
    b.current.context.persona = clone(personal);
    await database.rooms.bulkPut([a, b]);
    await deleteSharedPersona(database, personal.id);
    expect(
      (await database.rooms.toArray()).every(
        (r) => r.current.context.persona.id === r.work.personas[0].id,
      ),
    ).toBe(true);
    await migrateSharedPersonas(database);
    expect((await database.profiles.get('profile'))!.personas).toEqual([]);
  });
  it('uses a valid fallback when no authored or personal personas remain', async () => {
    const room = createRoom(exampleWork());
    room.work.personas = [];
    room.current.context.persona = clone(personal);
    await database.rooms.put(room);
    await deleteSharedPersona(database, personal.id);
    expect((await database.rooms.get(room.id))!.current.context.persona.name).toBe('여행자');
  });
});
