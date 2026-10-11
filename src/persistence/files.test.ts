import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readImport } from './files';
import { createRoom, addResponse, emptyDelta } from '../domain/engine';
import { exampleWork, workspace } from '../domain/defaults';
const file = (kind: string, key: string, value: unknown) =>
  new File(
    [JSON.stringify({ kind: `xenotale.${kind}`, schemaVersion: 2, [key]: value })],
    'test.json',
  );
describe('portable files', () => {
  it('accepts exported rooms and rejects broken snapshot references', async () => {
    const r = addResponse(
      createRoom(exampleWork()),
      'hi',
      { kind: 'turn', requestedCharacterIds: [], body: '안녕', choices: [], delta: emptyDelta() },
      { model: 'demo' },
    );
    r.current.context.shortcuts = [
      { id: 'shortcut1', name: '일기', description: '기록', prompt: '하루를 기록한다' },
    ];
    r.current.context.noteGroups = ['빈 그룹'];
    r.current.context.memories = [
      {
        id: 'memory',
        title: '과거 약속',
        body: '기록',
        kind: 'short',
        sources: [],
        eventSources: [`opening:${r.openingId}`],
        createdAt: 1,
        manual: false,
        active: false,
        consolidatedInto: 'long-memory',
      },
    ];
    r.current.context.settings.summaryEvery = 100;
    r.current.context.settings.longEvery = 5;
    const imported = await readImport(file('room', 'room', r));
    expect(imported.kind).toBe('room');
    if (imported.kind !== 'room') throw new Error();
    expect(imported.room.current.context.shortcuts).toEqual(r.current.context.shortcuts);
    expect(imported.room.current.context.noteGroups).toEqual(['빈 그룹']);
    expect(imported.room.current.context.memories).toEqual(r.current.context.memories);
    expect(imported.room.current.context.settings.summaryEvery).toBe(100);
    expect(imported.room.current.context.settings.longEvery).toBe(5);
    r.current.runtime.presence.push('missing');
    await expect(readImport(file('room', 'room', r))).rejects.toThrow('스냅샷');
  });
  it('preserves incomplete autosaved workspaces for future editing', async () => {
    const w = workspace('작가');
    w.work.statuses.push({
      id: 's',
      name: '',
      type: 'choice',
      initial: '',
      min: 0,
      max: 100,
      unit: '',
      options: [],
      prompt: '',
    });
    const imported = await readImport(file('workspace', 'workspace', w));
    expect(imported.kind).toBe('workspace');
    await expect(readImport(file('work', 'work', w.work))).rejects.toThrow();
  });
  it('rejects prototype keys in imported identifiers', async () => {
    const w = exampleWork();
    w.statuses[0].id = '__proto__';
    await expect(readImport(file('work', 'work', w))).rejects.toThrow('형식');
  });
});
