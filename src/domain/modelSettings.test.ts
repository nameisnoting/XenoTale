import { describe, it, expect } from 'vitest';
import { withChatModels } from './modelSettings';
import { createRoom, addResponse, emptyDelta } from './engine';
import { defaultProfile } from './defaults';
import { exampleWork } from '../test/exampleWork';

describe('shared model selections', () => {
  it('changes only the current model settings without rewriting history or other room settings', () => {
    const room = addResponse(
      createRoom(exampleWork(), 'old/chat'),
      '인사',
      {
        kind: 'turn',
        requestedCharacterIds: [],
        body: '안녕',
        choices: [],
        delta: emptyDelta(),
      },
      { model: 'old/chat' },
    );
    room.current.context.settings.creativity = 4;
    const original = structuredClone(room);
    const profile = { ...defaultProfile(), defaultModel: 'new/chat', summaryModel: 'new/summary' };
    const result = withChatModels(room, profile);
    expect(result.current.context.settings).toEqual({
      ...original.current.context.settings,
      modelId: 'new/chat',
      summaryModelId: 'new/summary',
    });
    expect(result.timeline).toBe(room.timeline);
    expect(result.initial).toBe(room.initial);
    expect(result.current.runtime).toBe(room.current.runtime);
    expect(result.revision).toBe(room.revision);
    expect(room).toEqual(original);
    expect(withChatModels(result, profile)).toBe(result);
  });
});
