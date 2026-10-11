import { RECENT_RAW_TURNS, activeMemories, memoryTitle } from '../domain/memory';
import type { Model, Room, Checkpoint, Usage } from '../domain/types';
import { selected, fingerprint } from '../domain/types';
import { envelopeSchema, emptyDelta, applyDelta, type Envelope } from '../domain/engine';
import enginePrompt from './prompts/engine_system_v2.txt?raw';
import { effectiveSystemPrompt } from '../domain/systemPrompt';
import { buildQualityDirectives } from '../domain/qualityDirectives';
import { runtimeRelations } from '../domain/relations';
import responseSchema from './turn-envelope.schema.json';

const BASE = 'https://openrouter.ai/api/v1';
export const demoModel: Model = {
  id: 'demo',
  name: '체험 모드 · API 호출 없음',
  context_length: 64000,
  supported_parameters: [],
  reasoning: { supported_efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
};
export async function listModels(): Promise<Model[]> {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error('모델 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const data = await res.json();
  return data.data
    .filter((m: Model) => m.id && m.supported_parameters)
    .sort((a: Model, b: Model) => a.name.localeCompare(b.name));
}
export async function verifyKey(key: string) {
  const res = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok)
    throw new Error(
      res.status === 401
        ? 'API 키가 유효하지 않습니다.'
        : '키 확인에 실패했습니다. 연결을 확인해 주세요.',
    );
  return res.json();
}
export const reasoningSupported = (model?: Model) =>
  !!model?.reasoning &&
  (model.reasoning.supports_max_tokens === true || 'supported_efforts' in model.reasoning);
const efforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export function reasoningFor(
  model: Model,
  level: number,
): { effort?: string; max_tokens?: number; exclude: boolean } | undefined {
  if (!reasoningSupported(model)) return undefined;
  const value = Math.max(0, Math.min(4, Math.round(level)));
  if (model.reasoning?.supports_max_tokens)
    return { max_tokens: [1024, 2048, 4096, 8192, 16384][value], exclude: true };
  const supported = model.reasoning?.supported_efforts ?? efforts.slice(0, 5);
  const available = efforts.filter((e) => supported.includes(e));
  if (!available.length) return undefined;
  return { effort: available[Math.round((value * (available.length - 1)) / 4)], exclude: true };
}
type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
};
const stable = <T extends { id: string }>(list: T[]) =>
  [...list].sort((a, b) => a.id.localeCompare(b.id));
export function buildMessages(
  room: Room,
  before: Checkpoint,
  input: string,
  options: {
    reroll: boolean;
    extra: string[];
    directive: string;
    canRequest: boolean;
    dice?: number;
    transport: string;
  },
): Message[] {
  const w = room.work;
  const ctx = before.context;
  const mainIds = w.characters.filter((c) => c.role === 'main').map((c) => c.id);
  const loadedIds = [...new Set([...mainIds, ...before.runtime.presence, ...options.extra])];
  const fixed = [
    enginePrompt,
    'OUTPUT SCHEMA: ' + JSON.stringify(responseSchema),
    effectiveSystemPrompt(w),
    JSON.stringify({
      work: w.prompt,
      directory: stable(w.characters).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        trigger: c.trigger,
        group: c.group,
        profileRequiresLoad: c.role !== 'main',
      })),
      mainCharacters: stable(w.characters)
        .filter((c) => c.role === 'main')
        .map((c) => ({ id: c.id, name: c.name, prompt: c.prompt })),
      statuses: stable(w.statuses),
      characterGroups: w.characterGroups ?? [],
      items: stable(w.items).map((i) => ({ id: i.id, name: i.name, prompt: i.prompt })),
      relationships: stable(w.relations),
      media: { ...w.media, commonCharacterCode: '0' },
      effects: w.effects.map((e) => ({
        id: e.id,
        name: e.name,
        prompt: e.prompt,
        tag: e.name.trim() ? `{{${e.name}}}` : `{{effect:${e.id}}}`,
      })),
    }),
  ].join('\n\n');
  const timeline = options.reroll ? room.timeline.slice(0, -1) : room.timeline;
  const memories = activeMemories(room, ctx.memories, timeline);
  const covered = new Set(memories.flatMap((m) => m.sources));
  const result: Message[] = [
    { role: 'system', content: fixed },
    {
      role: 'user',
      content: JSON.stringify({
        roomProfile: {
          persona: {
            name: ctx.persona.name,
            prompt: ctx.persona.prompt,
            gender: ctx.persona.gender,
          },
          notes: ctx.notes.filter((n) => n.enabled).map((n) => ({ name: n.name, body: n.body })),
        },
        verifiedMemory: memories.map((m) => ({ title: memoryTitle(room, m), content: m.body })),
        opening: w.openings.find((o) => o.id === room.openingId)?.body,
      }),
    },
  ];
  const recentRaw = new Set(
    timeline
      .filter((t) => t.kind === 'turn')
      .slice(-RECENT_RAW_TURNS)
      .map((t) => t.id),
  );
  for (const event of timeline) {
    if (event.kind === 'turn') {
      if (covered.has(fingerprint(event)) && !recentRaw.has(event.id)) continue;
      result.push(
        { role: 'user', content: event.input },
        { role: 'assistant', content: selected(event).body },
      );
    } else
      result.push({
        role: 'user',
        content: JSON.stringify({ committedLocalEvent: event.body, changes: event.changes }),
      });
  }
  const search = (
    input +
    '\n' +
    timeline
      .filter((e) => e.kind === 'turn')
      .slice(-2)
      .map((e) => (e.kind === 'turn' ? e.input + selected(e).body : ''))
      .join('\n')
  )
    .normalize('NFKC')
    .toLocaleLowerCase();
  const lore = [
    ...w.lore,
    ...w.characters.filter((c) => loadedIds.includes(c.id)).flatMap((c) => c.lore),
  ].filter((l) =>
    l.keywords.some((k) => k.trim() && search.includes(k.normalize('NFKC').toLocaleLowerCase())),
  );
  const chapter = w.chapters.find((c) => c.id === before.runtime.nodeId);
  const eventInterval = ({ 적음: 10, 보통: 5, 빈번: 3 } as Record<string, number>)[
    ctx.settings.quality.events
  ];
  result.push({
    role: 'user',
    content: JSON.stringify({
      runtimeContext: {
        chapter: chapter
          ? { id: chapter.id, backdrop: chapter.prompt }
          : { id: room.openingId, backdrop: '도입부에서 이어지는 장면' },
        currentState: before.runtime,
        relationships: runtimeRelations(w, before.runtime),
        effectResults: before.runtime.effectResults ?? [],
        loadedCharacterIds: loadedIds,
        // On-stage supporting profiles and same-turn context loads belong to this uncached tail.
        additionalCharacterDetails: stable(w.characters)
          .filter((c) => c.role !== 'main' && loadedIds.includes(c.id))
          .map((c) => ({ id: c.id, name: c.name, prompt: c.prompt })),
        activeLorebook: lore,
      },
      turnDirectives: {
        outputLanguage: 'Korean',
        quality: ctx.settings.quality,
        qualityInstructions: buildQualityDirectives(ctx.settings.quality),
        // This setting controls presentation only; generated choices remain available.
        choicesEnabled: true,
        canRequestContext: options.canRequest,
        transport: options.transport,
        eventCue:
          eventInterval && (before.runtime.turnCount + 1) % eventInterval === 0
            ? 'Introduce at most one plausible new situation without overriding player agency.'
            : null,
      },
      localActionResults: options.dice ? [{ kind: 'dice', sides: 20, result: options.dice }] : [],
      retryDirective: options.directive || null,
      playerInput: {
        kind: ['[이어서 진행]', '[이어서 내용 전개]'].includes(input) ? 'continue' : 'message',
        text: input,
      },
    }),
  });
  return result;
}
function parseContent(text: string) {
  const trimmed = text.trim();
  const framed = trimmed.match(/^<XENOTALE_RESULT_V2>\s*([\s\S]+?)\s*<\/XENOTALE_RESULT_V2>$/);
  return envelopeSchema.parse(JSON.parse(framed ? framed[1] : trimmed));
}
function mockResponse(room: Room, before: Checkpoint, input: string, variant: number): Envelope {
  const name = room.work.characters[0].name;
  const next = before.runtime.turnCount + 1;
  const delta = emptyDelta();
  const affinity = room.work.statuses.find((s) => s.id === 'affinity');
  if (affinity) delta.numeric.push({ fieldId: affinity.id, amount: variant % 2 === 0 ? 2 : 3 });
  if (room.work.statuses.some((s) => s.id === 'place') && /정원/.test(input))
    delta.choice.push({ fieldId: 'place', optionId: '정원' });
  if (
    next >= 3 &&
    room.work.items.some((i) => i.id === 'key') &&
    !before.runtime.inventory.key?.owned
  )
    delta.inventory.push({ itemId: 'key', owned: true });
  if (next >= 2 && room.work.relations.some((r) => r.id === 'aria-user'))
    delta.relationships.push({
      relationId: 'aria-user',
      label: variant % 2 ? '마음을 여는 사이' : '조금 익숙한 방문객',
    });
  const bodies = [
    `*${name}는 잠시 생각하더니 문 옆으로 한 걸음 물러선다. 바람이 잎을 스치는 소리가 두 사람 사이의 침묵을 채운다.*\n\n@${name}: 아직 모르는 것이 많겠지요. 급하게 답을 찾지 않아도 괜찮아요. 하나씩 살펴보면 됩니다.\n\n*가까운 길을 가리키는 손끝이 정원을 향한다. 선택은 당신에게 남겨져 있다.*`,
    `*작은 미소가 ${name}의 얼굴에 번진다. 주머니 속 열쇠가 가볍게 부딪히는 소리가 들린다.*\n\n@${name}: 그렇게 말씀하실 줄은 몰랐네요. 그럼, 제가 알고 있는 이야기를 하나 들려드릴까요?\n\n*저택의 창문에 구름 사이로 나온 빛이 내려앉는다.*`,
    `@${name}: 이곳에는 오래된 약속이 남아 있어요. 누군가는 기다리고, 누군가는 다시 찾아오죠.\n\n*말을 마친 ${name}는 한동안 길 끝을 바라본다. 무언가 더 할 말이 있는 듯하지만, 당신의 대답을 기다린다.*`,
  ];
  return {
    kind: 'turn',
    requestedCharacterIds: [],
    body:
      bodies[(next + variant - 1) % bodies.length] +
      (delta.inventory.length ? '\n\n*아리아가 서고의 열쇠를 건넨다.*' : ''),
    choices: ['이야기를 더 듣는다', '주변을 천천히 살펴본다'],
    delta,
  };
}
export async function generate(
  room: Room,
  before: Checkpoint,
  input: string,
  model: Model,
  apiKey: string,
  signal: AbortSignal,
  options: {
    reroll: boolean;
    directive?: string;
    dice?: number;
    onPhase?: (phase: string) => void;
  },
): Promise<{ result: Envelope; usage: Usage }> {
  if (model.id === 'demo') {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 650);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('취소', 'AbortError'));
        },
        { once: true },
      );
    });
    const last = room.timeline.at(-1);
    return {
      result: mockResponse(
        room,
        before,
        input,
        options.reroll && last?.kind === 'turn' ? last.candidates.length : 0,
      ),
      usage: { model: 'demo', cost: 0 },
    };
  }
  if (!apiKey.trim()) throw new Error('마이페이지에서 OpenRouter API 키를 연결해 주세요.');
  let extra: string[] = [];
  let repaired = false;
  let directive = options.directive ?? '';
  let canRequest = true;
  const usage: Usage = { model: model.id, input: 0, output: 0 };
  const supported = model.supported_parameters;
  const transport = supported.includes('structured_outputs')
    ? 'json'
    : supported.includes('tools')
      ? 'tool'
      : 'frame';
  const reasoning = reasoningFor(model, before.context.settings.creativity);
  const reserved = reasoning?.max_tokens ? reasoning.max_tokens + 4096 : reasoning ? 16384 : 4096;
  const maxTokens = Math.min(
    reserved,
    model.top_provider?.max_completion_tokens ?? reserved,
    Math.floor(model.context_length / 2),
  );
  if (reasoning?.max_tokens && reasoning.max_tokens >= maxTokens)
    reasoning.max_tokens = Math.max(1, maxTokens - 2048);
  for (let attempt = 0; attempt < 3; attempt++) {
    const messages = buildMessages(room, before, input, {
      reroll: options.reroll,
      extra,
      directive,
      canRequest,
      dice: options.dice,
      transport,
    });
    // Three stable boundaries; the final changing runtime/input block is never cached explicitly.
    if (/^~?anthropic\//.test(model.id))
      for (const index of new Set([0, 1, messages.length - 2])) {
        const message = messages[index];
        if (message && typeof message.content === 'string')
          message.content = [
            { type: 'text', text: message.content, cache_control: { type: 'ephemeral' } },
          ];
      }
    const approximate = JSON.stringify(messages).length; // Conservative multilingual upper estimate, not a tokenizer.
    if (approximate + maxTokens > model.context_length * 0.94)
      throw new Error(
        '대화가 모델의 컨텍스트 한도에 가까워졌습니다. 기억을 요약하거나 더 큰 컨텍스트 모델을 선택해 주세요.',
      );
    const payload: Record<string, unknown> = {
      model: model.id,
      messages,
      max_tokens: maxTokens,
      stream: false,
      session_id: room.id,
    };
    if (reasoning) payload.reasoning = reasoning;
    if (transport === 'json')
      payload.response_format = {
        type: 'json_schema',
        json_schema: { name: 'xenotale_turn', strict: true, schema: responseSchema },
      };
    if (transport === 'tool') {
      payload.tools = [
        {
          type: 'function',
          function: {
            name: 'submit_turn',
            description: 'Return the final turn or a request for missing character context.',
            parameters: responseSchema,
          },
        },
      ];
      payload.tool_choice = { type: 'function', function: { name: 'submit_turn' } };
    }
    options.onPhase?.(
      extra.length ? '등장인물 설정을 확인하고 있습니다…' : '답변을 생각하고 있습니다…',
    );
    const response = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      const status = response.status;
      throw new Error(
        status === 401
          ? 'API 키를 다시 확인해 주세요.'
          : status === 402
            ? 'OpenRouter 잔액이 부족합니다.'
            : status === 429
              ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
              : `모델 요청에 실패했습니다 (${status}). 다른 모델을 선택하거나 다시 시도해 주세요.`,
      );
    }
    const data = await response.json();
    const u = data.usage;
    if (u) {
      usage.input = (usage.input ?? 0) + (u.prompt_tokens ?? 0);
      usage.output = (usage.output ?? 0) + (u.completion_tokens ?? 0);
      if (typeof u.cost === 'number') usage.cost = (usage.cost ?? 0) + u.cost;
      if (u.prompt_tokens_details?.cached_tokens !== undefined)
        usage.cacheRead = (usage.cacheRead ?? 0) + u.prompt_tokens_details.cached_tokens;
    }
    const answer = data.choices?.[0];
    if (!answer || !['stop', 'tool_calls'].includes(answer.finish_reason))
      throw new Error('응답이 끝까지 생성되지 않았습니다. 상태는 변경되지 않았습니다.');
    let result: Envelope;
    try {
      const raw =
        transport === 'tool'
          ? answer.message.tool_calls?.find(
              (t: { function: { name: string } }) => t.function.name === 'submit_turn',
            )?.function.arguments
          : answer.message.content;
      result = parseContent(raw ?? '');
      if (result.kind === 'need_context') {
        if (
          !canRequest ||
          result.body ||
          result.choices.length ||
          Object.values(result.delta).some((a) => a.length) ||
          !result.requestedCharacterIds.length
        )
          throw new Error('잘못된 컨텍스트 요청');
        if (result.requestedCharacterIds.some((x) => !room.work.characters.some((c) => c.id === x)))
          throw new Error('등록되지 않은 인물');
        extra = result.requestedCharacterIds;
        canRequest = false;
        continue;
      }
      if (!result.body.trim() || result.requestedCharacterIds.length) throw new Error('대화 없음');
      applyDelta(room.work, before.runtime, result.delta);
      const loaded = new Set([
        ...room.work.characters.filter((c) => c.role === 'main').map((c) => c.id),
        ...before.runtime.presence,
        ...extra,
      ]);
      const entered = new Set(
        result.delta.presence.filter((c) => c.present).map((c) => c.characterId),
      );
      for (const match of result.body.matchAll(/(?:^|\n)@([^:\n]+):/g)) {
        const actor = room.work.characters.find((c) => c.name === match[1]);
        if (
          !actor ||
          !loaded.has(actor.id) ||
          (!before.runtime.presence.includes(actor.id) && !entered.has(actor.id))
        )
          throw new Error('미등록 또는 미로딩 등장인물');
      }
    } catch {
      if (!repaired && attempt < 2) {
        repaired = true;
        directive +=
          '\nReturn a valid complete TurnEnvelope. No markdown code fence or text outside the result.';
        continue;
      }
      throw new Error(
        '응답 형식이 올바르지 않아 적용하지 않았습니다. 다른 모델로 다시 시도해 주세요.',
      );
    }
    return { result, usage };
  }
  throw new Error('응답을 완성하지 못했습니다. 이전 대화는 그대로 유지됩니다.');
}
