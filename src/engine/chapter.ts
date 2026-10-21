import type { Model, Room } from '../domain/types';
import { enterChapter, prepareChapter, addResponse } from '../domain/engine';
import { clone } from '../domain/types';
import { generate } from './openrouter';

// Reuse the normal narrator, model transport, context/memory and state validation.
// Generated openings use the existing editable response candidates, without player text.
export async function generateChapter(
  room: Room,
  chapterId: string,
  model: Model,
  apiKey: string,
  signal: AbortSignal,
  onPhase?: (phase: string) => void,
  options: { reroll?: boolean; directive?: string } = {},
): Promise<Room> {
  const last = room.timeline.at(-1);
  if (options.reroll && (last?.kind !== 'turn' || last.chapterId !== chapterId))
    throw new Error('가장 최근 AI 프롤로그만 리롤할 수 있습니다.');
  const source =
    options.reroll && last?.kind === 'turn'
      ? {
          ...room,
          current: { runtime: clone(last.before.runtime), context: clone(room.current.context) },
          timeline: room.timeline.slice(0, -1),
        }
      : room;
  const { chapter, after } = prepareChapter(source, chapterId);
  if (chapter.prologueMode !== 'ai') return enterChapter(room, chapterId);
  const from = [...room.work.openings, ...room.work.chapters].find(
    (node) => node.id === source.current.runtime.nodeId,
  );
  const directive = [
    'CHAPTER TRANSITION: The player has chosen the next chapter. Write its opening scene in Korean as a completed turn, continuing naturally from the latest committed dialogue and current state.',
    "Bridge the previous scene to the destination with coherent time, location, character emotions and unresolved actions. Do not restart the story, copy the original opening, invent a player question, or decide the player's next action.",
    'Use the destination chapter guidance below. Keep established facts and state unless a change is actually justified by this scene. Return ordinary TurnEnvelope body, choices and delta; do not output this instruction.',
    JSON.stringify({
      from: { name: from?.name, id: source.current.runtime.nodeId },
      destination: {
        name: chapter.name,
        id: chapter.id,
        type: chapter.type,
        guidance: chapter.prompt,
        afterstory: chapter.afterstory,
      },
    }),
    ...(chapter.type === 'ending'
      ? [
          'Write an ending consistent with the preceding story. Respect whether afterstory is allowed.',
        ]
      : []),
    options.directive ?? '',
  ].join('\n');
  const result = await generate(
    { ...source, current: after },
    after,
    `[챕터 이동: ${chapter.name}]`,
    model,
    apiKey,
    signal,
    {
      reroll: false,
      directive,
      onPhase,
    },
  );
  signal.throwIfAborted();
  return options.reroll
    ? addResponse(room, '', result.result, result.usage, {
        reroll: true,
        risuState: result.risuState,
      })
    : enterChapter(room, chapterId, result);
}
