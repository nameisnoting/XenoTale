import type { Profile, Room } from './types';

// Historical checkpoints keep their original settings. Display and new requests
// use the shared chat/summary selection without rewriting conversation history.
export function withChatModels(room: Room, profile: Profile): Room {
  const settings = room.current.context.settings;
  if (settings.modelId === profile.defaultModel && settings.summaryModelId === profile.summaryModel)
    return room;
  return {
    ...room,
    current: {
      ...room.current,
      context: {
        ...room.current.context,
        settings: {
          ...settings,
          modelId: profile.defaultModel,
          summaryModelId: profile.summaryModel,
        },
      },
    },
  };
}
