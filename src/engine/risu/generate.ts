import type { Room, Checkpoint, Model, Usage } from '../../domain/types';
import { risuChatEntries } from '../../domain/risuState';
import { activeMemories } from '../../domain/memory';
import { fingerprint } from '../../domain/types';
import { emptyDelta } from '../../domain/engine';
import { risuCommand, runRisu } from './client';
import type { RisuMessage } from './types';
import type { reasoningFor } from '../openrouter';

/** Risu uses plain narrative/tag output, preserving its request/output hooks. Native rooms keep TurnEnvelope. */
export async function generateRisu(
  room: Room,
  before: Checkpoint,
  input: string,
  model: Model,
  key: string,
  signal: AbortSignal,
  options: {
    reroll: boolean;
    directive?: string;
    onPhase?: (phase: string) => void;
    reasoning?: ReturnType<typeof reasoningFor>;
  },
) {
  const timeline = options.reroll ? room.timeline.slice(0, -1) : room.timeline;
  const source = { ...room, timeline };
  const command = risuCommand(source, before);
  if (options.reroll) command.state = room.current.runtime.risu;
  command.chats.push({ role: 'user', data: input });
  const messages: RisuMessage[] = [
    {
      role: 'system',
      content: [room.work.systemMode === 'custom' ? room.work.customSystem : '', room.work.prompt]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  if (command.config.examples) messages.push({ role: 'system', content: command.config.examples });
  const persona = before.context.persona;
  if (persona.prompt)
    messages.push({ role: 'system', content: `${persona.name}\n${persona.prompt}` });
  const notes = before.context.notes
    .filter((n) => n.enabled)
    .map((n) => n.body)
    .join('\n');
  if (notes) messages.push({ role: 'system', content: notes });
  const memories = activeMemories(room, before.context.memories, timeline),
    covered = new Set(memories.flatMap((m) => m.sources));
  for (const memory of memories) messages.push({ role: 'system', content: memory.body });
  const opening = room.work.openings.find((o) => o.id === room.openingId);
  if (opening) messages.push({ role: 'assistant', content: opening.body });
  const promptSource = {
    ...source,
    timeline: timeline.filter((e) => e.kind !== 'turn' || !covered.has(fingerprint(e))),
  };
  for (const entry of risuChatEntries(promptSource))
    messages.push({ role: entry.role === 'user' ? 'user' : 'assistant', content: entry.data });
  messages.push({ role: 'user', content: input });
  if (command.config.postHistory)
    messages.push({ role: 'system', content: command.config.postHistory });
  if (options.directive) messages.push({ role: 'system', content: options.directive });
  if (room.work.statuses.length)
    messages.push({
      role: 'system',
      content: JSON.stringify({
        xenotaleStatus: before.runtime.status,
        inventory: before.runtime.inventory,
      }),
    });
  options.onPhase?.('작품 규칙과 주사위를 준비하고 있습니다…');
  const prepared = await runRisu(room.id, { ...command, action: 'request', messages });
  if (signal.aborted) throw new DOMException('취소', 'AbortError');
  const reasoning = options.reasoning;
  const reserved = reasoning?.max_tokens ? reasoning.max_tokens + 4096 : reasoning ? 16384 : 12000;
  const outputLimit = Math.min(
    reserved,
    model.top_provider?.max_completion_tokens ?? reserved,
    Math.floor(model.context_length / 3),
  );
  if (reasoning?.max_tokens && reasoning.max_tokens >= outputLimit)
    reasoning.max_tokens = Math.max(1, outputLimit - 2048);
  if (JSON.stringify(prepared.messages).length + outputLimit > model.context_length * 0.94)
    throw new Error(
      '모델의 컨텍스트 한도에 가깝습니다. 더 큰 컨텍스트 모델을 선택하거나 대화를 정리해 주세요.',
    );
  options.onPhase?.('답변을 생각하고 있습니다…');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: model.id,
      messages: prepared.messages,
      stream: false,
      max_tokens: outputLimit,
      session_id: room.id,
      ...(reasoning ? { reasoning } : {}),
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : `모델 요청에 실패했습니다 (${response.status}).`,
    );
  const data = await response.json(),
    answer = data.choices?.[0],
    text = answer?.message?.content;
  if (!text?.trim()) throw new Error('모델의 응답이 비어 있습니다.');
  options.onPhase?.('응답의 판정과 상태를 반영하고 있습니다…');
  let processed;
  try {
    processed = await runRisu(room.id, {
      ...command,
      action: 'output',
      state: prepared.state,
      chats: [...prepared.chats, { role: 'char', data: text }],
      text,
    });
    delete processed.state._xenotale_error;
  } catch (error) {
    processed = {
      text,
      state: {
        ...prepared.state,
        _xenotale_error: `응답 원문은 저장했습니다. 규칙 처리 오류: ${(error as Error).message}`,
      },
    };
  }
  const u = data.usage,
    usage: Usage = {
      model: model.id,
      input: u?.prompt_tokens,
      output: u?.completion_tokens,
      cost: u?.cost,
      cacheRead: u?.prompt_tokens_details?.cached_tokens,
    };
  return {
    result: {
      kind: 'turn' as const,
      requestedCharacterIds: [],
      body: processed.text,
      choices: [],
      delta: emptyDelta(),
    },
    usage,
    risuState: processed.state,
  };
}
