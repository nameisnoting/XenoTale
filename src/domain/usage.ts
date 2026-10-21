import type { Room, Usage } from './types';

export const roomUsage = (room: Room): Usage[] =>
  room.timeline.flatMap((event) =>
    event.kind === 'turn' ? event.candidates.map((candidate) => candidate.usage) : [],
  );
