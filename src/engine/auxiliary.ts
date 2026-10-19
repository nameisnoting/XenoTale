import {
  summarySources,
  activeShortMemories,
  validMemories,
  SUMMARY_PROMPTS,
} from '../domain/memory';
export { summarySources, summaryCountdown } from '../domain/memory';
import type { Room, Model, Memory } from '../domain/types';
import { id, selected, fingerprint } from '../domain/types';
import { demoSummary } from '../domain/demo';
import type { InputPart } from '../domain/creatorAttachments';
import { readJsonStream, type JsonProgress } from './jsonStream';
import { modelError, readModelError } from './providerError';
export async function requestJson(
  system: string,
  data: unknown,
  model: Model,
  key: string,
  signal: AbortSignal,
  options: {
    maxTokens?: number;
    parts?: InputPart[];
    pdfEngine?: 'native' | 'cloudflare-ai';
    allowTextFallback?: boolean;
    preserveInvalidOutput?: boolean;
    onProgress?: (progress: JsonProgress) => void;
  } = {},
) {
  if (!key) throw new Error('마이페이지에서 API 키를 연결해 주세요.');
  const requestContent = JSON.stringify(data);
  const maxTokens = Math.min(
    options.maxTokens ?? 4096,
    model.top_provider?.max_completion_tokens ?? Infinity,
  );
  const referenceLength =
    options.parts?.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : 0), 0) ??
    0;
  if (
    requestContent.length + referenceLength + system.length + maxTokens >
    model.context_length * 0.94
  )
    throw new Error('모델의 컨텍스트가 부족합니다. 더 큰 모델을 선택해 주세요.');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: options.parts?.length
            ? [{ type: 'text', text: requestContent }, ...options.parts]
            : requestContent,
        },
      ],
      max_tokens: maxTokens,
      ...(options.pdfEngine
        ? { plugins: [{ id: 'file-parser', pdf: { engine: options.pdfEngine } }] }
        : {}),
      ...(options.onProgress ? { stream: true } : {}),
      ...(model.supported_parameters.includes('response_format')
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
    signal,
  });
  if (!response.ok) throw await readModelError(response, key);
  let content: string;
  let finishReason: string | null;
  if (options.onProgress && response.headers.get('content-type')?.includes('text/event-stream')) {
    ({ content, finishReason } = await readJsonStream(response, options.onProgress, signal, key));
  } else {
    const result = await response.json();
    if (result.error) throw modelError(response.status, result, key);
    const answer = result.choices?.[0];
    content = answer?.message?.content;
    finishReason = answer?.finish_reason;
  }
  if (finishReason !== 'stop') {
    if (options.preserveInvalidOutput && typeof content === 'string') return content;
    throw new Error('응답이 완성되지 않았습니다.');
  }
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    if ((options.allowTextFallback || options.preserveInvalidOutput) && typeof content === 'string')
      return content;
    throw new Error('모델이 올바른 JSON을 반환하지 않았습니다.');
  }
}
export function parseSummary(value: unknown) {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  const content =
    record && [record.content, record.summary, record.body].find((v) => typeof v === 'string');
  let body =
    typeof content === 'string'
      ? content
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  if (!body?.trim()) throw new Error('요약 내용이 비어 있습니다.');
  const lines = (field: string, label: string) =>
    Array.isArray(record?.[field])
      ? (record[field] as unknown[])
          .filter((v): v is string => typeof v === 'string' && !!v.trim())
          .map((v) => `${label}: ${v}`)
      : [];
  body = [body.trim(), ...lines('unresolved', '미해결'), ...lines('uncertainties', '불확실')].join(
    '\n',
  );
  if (body.length > 8000) throw new Error('요약 내용이 너무 깁니다.');
  const title =
    typeof record?.title === 'string' ? record.title.trim().slice(0, 300) || undefined : undefined;
  return { title, body };
}
export async function summarize(
  room: Room,
  model: Model,
  key: string,
  signal: AbortSignal,
  consolidate = false,
): Promise<Memory[]> {
  const existing = room.current.context.memories;
  const entries = consolidate ? activeShortMemories(room) : [];
  const turns = consolidate ? [] : summarySources(room);
  if (consolidate ? entries.length < 2 : turns.length === 0)
    throw new Error(
      consolidate ? '통합할 단기요약이 2개 이상 필요합니다.' : '요약할 새 대화가 없습니다.',
    );
  const sources = [
    ...new Set(consolidate ? entries.flatMap((m) => m.sources) : turns.map(fingerprint)),
  ];
  const coveredEvents = new Set(validMemories(room).flatMap((m) => m.eventSources ?? []));
  const openingSource = `opening:${room.openingId}`;
  const scenes = room.timeline.filter((e) => e.kind !== 'turn' && !coveredEvents.has(e.id));
  const eventSources = consolidate
    ? [...new Set(entries.flatMap((m) => m.eventSources ?? []))]
    : [...(!coveredEvents.has(openingSource) ? [openingSource] : []), ...scenes.map((e) => e.id)];
  const turnIds = new Set(turns.map((t) => t.id));
  const sceneIds = new Set(scenes.map((e) => e.id));
  const sourceData = consolidate
    ? entries.map((m) => ({ title: m.title, content: m.body }))
    : [
        ...(!coveredEvents.has(openingSource)
          ? [
              {
                kind: 'opening',
                turn: 0,
                body: room.work.openings.find((o) => o.id === room.openingId)?.body ?? '',
              },
            ]
          : []),
        ...room.timeline
          .filter((e) => turnIds.has(e.id) || sceneIds.has(e.id))
          .map((e) =>
            e.kind === 'turn'
              ? {
                  kind: 'turn',
                  input: e.input,
                  body: selected(e).body,
                  validatedEvents: selected(e).changes,
                }
              : { kind: e.kind, turn: 0, body: e.body, validatedEvents: e.changes },
          ),
      ];
  let body: string;
  let title: string | undefined;
  if (model.id === 'demo') body = demoSummary(consolidate);
  else {
    const value = parseSummary(
      await requestJson(
        consolidate
          ? (room.current.context.settings.longSummaryPrompt ?? SUMMARY_PROMPTS.long)
          : (room.current.context.settings.shortSummaryPrompt ?? SUMMARY_PROMPTS.short),
        {
          outputLanguage: 'Korean',
          summaryCharLimit: consolidate ? 5000 : 2500,
          entries: sourceData,
        },
        model,
        key,
        signal,
        { allowTextFallback: true },
      ),
    );
    body = value.body;
    title = value.title;
  }
  const memoryId = id();
  return [
    ...existing.map((m) =>
      entries.some((e) => e.id === m.id) ? { ...m, active: false, consolidatedInto: memoryId } : m,
    ),
    {
      id: memoryId,
      title,
      body,
      kind: consolidate ? 'long' : 'short',
      sources,
      eventSources,
      createdAt: Date.now(),
      manual: false,
      active: true,
    },
  ];
}
