import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  createRoom,
  addResponse,
  emptyDelta,
  enterChapter,
  branchRoom,
  editTurnText,
} from '../domain/engine';
import { exampleWork } from '../test/exampleWork';
import { fingerprint } from '../domain/types';
import { summaryCountdown, summarySources, summarize, parseSummary } from './auxiliary';
import {
  longSummaryCountdown,
  memoryTitle,
  activeMemories,
  activeShortMemories,
  applyMemories,
  repairMemoryActivity,
  SUMMARY_PROMPTS,
} from '../domain/memory';
import { demoModel, buildMessages } from './openrouter';
describe('memory intervals', () => {
  it('counts only unremembered turns from the first period', () => {
    let room = createRoom(exampleWork());
    room.current.context.settings.summaryEvery = 5;
    expect(summaryCountdown(room)).toBe(5);
    for (let i = 0; i < 10; i++)
      room = addResponse(
        room,
        '다음',
        {
          kind: 'turn',
          requestedCharacterIds: [],
          body: '대화',
          choices: [],
          delta: emptyDelta(),
        },
        { model: 'demo' },
      );
    expect(summarySources(room)).toHaveLength(10);
    expect(summaryCountdown(room)).toBe(0);
    room.current.context.memories.push({
      id: 'm',
      body: '기억',
      kind: 'short',
      sources: summarySources(room).map(fingerprint),
      createdAt: 0,
      manual: false,
    });
    expect(summarySources(room)).toHaveLength(0);
    expect(summaryCountdown(room)).toBe(5);
  });
  it('keeps ten recent turns raw and replaces only the exact covered candidates in prompts', async () => {
    let room = createRoom(exampleWork());
    for (let i = 0; i < 20; i++)
      room = addResponse(
        room,
        `입력 ${i + 1}`,
        {
          kind: 'turn',
          requestedCharacterIds: [],
          body: `대답 ${i + 1}`,
          choices: [],
          delta: emptyDelta(),
        },
        { model: 'demo' },
      );
    expect(summarySources(room)).toHaveLength(20);
    const memories = await summarize(room, summaryModel, 'test-only', new AbortController().signal);
    expect(memories[0].body).toBe('대화 내용을 정리했습니다.');
    expect(memories[0].sources).toHaveLength(20);
    room.current.context.memories = memories;
    expect(summarySources(room)).toHaveLength(0);
    const messages = buildMessages(room, room.current, '다음', {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'frame',
    });
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(10);
    expect(room.timeline).toHaveLength(20);
  });
  it('preserves manually edited memories during long-term consolidation', async () => {
    const room = createRoom(exampleWork());
    room.current.context.memories = [
      {
        id: 'manual',
        body: '직접 고친 기억',
        kind: 'short',
        sources: [],
        manual: true,
        createdAt: 0,
      },
      { id: 'a', body: '첫 사건', kind: 'short', sources: [], manual: false, createdAt: 1 },
      { id: 'b', body: '둘째 사건', kind: 'short', sources: [], manual: false, createdAt: 2 },
    ];
    const result = await summarize(
      room,
      summaryModel,
      'test-only',
      new AbortController().signal,
      true,
    );
    expect(result).toHaveLength(4);
    expect(result.find((m) => m.id === 'manual')?.body).toBe('직접 고친 기억');
    expect(result.find((m) => m.id === 'manual')?.active).toBe(false);
    expect(result.find((m) => m.kind === 'long')?.body).toBe('대화 내용을 정리했습니다.');
    expect(result.find((m) => m.id === 'b')?.body).toBe('둘째 사건');
  });
});

beforeEach(() => mockSummary('{"content":"대화 내용을 정리했습니다."}'));
afterEach(() => vi.unstubAllGlobals());
const nextTurn = (room: ReturnType<typeof createRoom>) =>
  addResponse(
    room,
    '다음',
    {
      kind: 'turn',
      requestedCharacterIds: [],
      body: '대화 내용',
      choices: [],
      delta: emptyDelta(),
    },
    { model: 'demo' },
  );
function mockSummary(answer: string) {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer } }] }),
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const summaryModel = {
  ...demoModel,
  id: 'summary-test',
  supported_parameters: ['response_format'],
};
it('never records demo summaries even when actual dialogue already exists', async () => {
  const room = addResponse(
    createRoom(exampleWork()),
    '실제 질문',
    {
      kind: 'turn',
      requestedCharacterIds: [],
      body: '열쇠를 찾아 서고로 갔다.',
      choices: [],
      delta: emptyDelta(),
    },
    { model: 'actual-chat-model' },
  );
  const before = structuredClone(room);
  const fetchMock = mockSummary('{"content":"호출되면 안 됨"}');
  await expect(
    summarize(room, demoModel, 'test-only', new AbortController().signal),
  ).rejects.toThrow('현재 요약용 LLM이 지정되지 않았습니다.');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(room).toEqual(before);
  expect(summarySources(room)).toHaveLength(1);
});
it('excludes old placeholders from prompts and coverage, and replaces them using the original turns', async () => {
  let room = createRoom(exampleWork());
  for (let i = 0; i < 20; i++) room = nextTurn(room);
  const turns = summarySources(room);
  room.current.context.memories = [
    {
      id: 'bad-short',
      body: '여기에 단기기억 요약이 나옵니다.',
      kind: 'short',
      sources: turns.slice(0, 10).map(fingerprint),
      manual: false,
      active: false,
      consolidatedInto: 'bad-long',
      createdAt: 1,
    },
    {
      id: 'real-short',
      body: '서고에서 열쇠를 찾았다.',
      kind: 'short',
      sources: turns.slice(10).map(fingerprint),
      manual: false,
      active: false,
      consolidatedInto: 'bad-long',
      createdAt: 2,
    },
    {
      id: 'bad-long',
      body: '여기에 장기기억 요약이 나옵니다.',
      kind: 'long',
      sources: turns.map(fingerprint),
      manual: false,
      createdAt: 3,
    },
  ];
  expect(summarySources(room)).toHaveLength(10);
  expect(activeShortMemories(room).map((memory) => memory.id)).toEqual(['real-short']);
  const messages = buildMessages(room, room.current, '다음', {
    reroll: false,
    extra: [],
    directive: '',
    canRequest: true,
    transport: 'json',
  });
  expect(JSON.stringify(messages)).not.toContain('여기에 단기기억 요약이 나옵니다.');
  expect(JSON.stringify(messages)).not.toContain('여기에 장기기억 요약이 나옵니다.');
  expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(20);
  const before = structuredClone(room);
  const fetchMock = mockSummary(
    '{"title":"원래 대화 복구","content":"첫 대화에서 안내인과 약속을 나눴다."}',
  );
  const memories = await summarize(room, summaryModel, 'test-only', new AbortController().signal);
  const payload = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(
    JSON.parse(payload.messages[1].content).entries.filter(
      (entry: { kind: string }) => entry.kind === 'turn',
    ),
  ).toHaveLength(10);
  expect(memories.map((memory) => memory.id)).not.toContain('bad-short');
  expect(memories.map((memory) => memory.id)).not.toContain('bad-long');
  expect(memories.find((memory) => memory.id === 'real-short')?.active).toBe(true);
  expect(memories.at(-1)?.body).toBe('첫 대화에서 안내인과 약속을 나눴다.');
  expect(summarySources(applyMemories(room, memories))).toHaveLength(0);
  expect(room).toEqual(before);
});
it('rejects placeholder output from a real model without marking any turns remembered', async () => {
  const room = nextTurn(createRoom(exampleWork()));
  const before = structuredClone(room);
  mockSummary('{"title":"요약","content":"여기에 단기기억 요약이 나옵니다."}');
  await expect(
    summarize(room, summaryModel, 'test-only', new AbortController().signal),
  ).rejects.toThrow('예시 문구');
  expect(room).toEqual(before);
  expect(summarySources(room)).toHaveLength(1);
});
it('extracts titles/content and supports legacy and invalid output fallback', async () => {
  expect(
    parseSummary({ title: '발견', content: '약속', unresolved: ['열쇠'], uncertainties: [] }),
  ).toEqual({ title: '발견', body: '약속\n미해결: 열쇠' });
  expect(parseSummary({ summary: '기존 요약' })).toEqual({ title: undefined, body: '기존 요약' });
  expect(() => parseSummary('')).toThrow('비어');
  const room = nextTurn(nextTurn(createRoom(exampleWork())));
  mockSummary('JSON 형식 없이 사건을 요약한 내용');
  const result = await summarize(room, summaryModel, 'test-only', new AbortController().signal);
  expect(result[0].body).toBe('JSON 형식 없이 사건을 요약한 내용');
  expect(memoryTitle(room, result[0])).toBe('1 ~ 2턴');
});
it('includes opening and chapter prose in source order without counting them as turns', async () => {
  let room = createRoom(exampleWork());
  room.work.chapters[0].conditions = [];
  room = nextTurn(room);
  room = enterChapter(room, 'archive');
  room = nextTurn(room);
  const fetchMock = mockSummary('{"title":"서고의 만남","content":"서고로 이동했다"}');
  const result = await summarize(room, summaryModel, 'test-only', new AbortController().signal);
  const request = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  const entries = JSON.parse(request.messages[1].content).entries;
  expect(entries.map((e: { kind: string }) => e.kind)).toEqual([
    'opening',
    'turn',
    'chapter',
    'turn',
  ]);
  expect(entries[0].body).toBe(room.work.openings[0].body);
  expect(entries[2].body).toBe(room.work.chapters[0].prologue);
  expect(entries[0].turn).toBe(0);
  expect(entries[2].turn).toBe(0);
  expect(result[0].sources).toHaveLength(2);
  expect(result[0].eventSources).toHaveLength(2);
  expect(memoryTitle(room, { ...result[0], title: '' })).toBe('1 ~ 2턴');
});
it('uses the user prompt as a complete replacement and sends title/content JSON to chat', async () => {
  const room = nextTurn(createRoom(exampleWork()));
  room.current.context.settings.shortSummaryPrompt = '내가 작성한 요약 규칙';
  const fetchMock = mockSummary('{"title":"첫 약속","content":"인사를 했다"}');
  room.current.context.memories = await summarize(
    room,
    summaryModel,
    'test-only',
    new AbortController().signal,
  );
  const request = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(request.messages[0].content).toBe('내가 작성한 요약 규칙');
  const messages = buildMessages(room, room.current, '다음', {
    reroll: false,
    extra: [],
    directive: '',
    canRequest: true,
    transport: 'frame',
  });
  expect(JSON.parse(messages[1].content as string).verifiedMemory).toEqual([
    { title: '첫 약속', content: '인사를 했다' },
  ]);
  room.current.context.settings.shortSummaryPrompt = undefined;
  await summarize(
    { ...room, current: { ...room.current, context: { ...room.current.context, memories: [] } } },
    summaryModel,
    'test-only',
    new AbortController().signal,
  );
  const fallback = JSON.parse(
    (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(fallback.messages[0].content).toBe(SUMMARY_PROMPTS.short);
});
it('counts down long memory in turns and excludes archived short memories from prompts', async () => {
  let room = createRoom(exampleWork());
  expect(longSummaryCountdown(room)).toBe(100);
  for (let i = 0; i < 10; i++) room = nextTurn(room);
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'test-only', new AbortController().signal),
  );
  expect(longSummaryCountdown(room)).toBe(90);
  for (let i = 0; i < 10; i++) room = nextTurn(room);
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'test-only', new AbortController().signal),
  );
  room.current.context.memories[0].body = '수정된 첫 요약';
  const fetchMock = mockSummary('{"content":"수정된 첫 요약을 반영한 장기기억"}');
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'fake', new AbortController().signal, true),
  );
  const request = JSON.parse(
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(JSON.parse(request.messages[1].content).entries[0].content).toBe('수정된 첫 요약');
  expect(room.current.context.memories).toHaveLength(3);
  expect(activeShortMemories(room)).toHaveLength(0);
  expect(activeMemories(room)).toHaveLength(1);
  expect(longSummaryCountdown(room)).toBe(100);
  const messages = buildMessages(room, room.current, '다음', {
    reroll: false,
    extra: [],
    directive: '',
    canRequest: true,
    transport: 'frame',
  });
  const memory = JSON.parse(messages[1].content as string).verifiedMemory;
  expect(memory).toHaveLength(1);
  expect(memory[0].title).toBe('1 ~ 20턴');
  expect(memory[0].content).toContain('수정된 첫 요약');
  const restored = repairMemoryActivity(
    room.current.context.memories.filter((m) => m.kind === 'short'),
  );
  expect(restored.every((m) => m.active)).toBe(true);
});
it('branches with the short/long activity state at the completed summary checkpoint', async () => {
  let room = nextTurn(createRoom(exampleWork()));
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'test-only', new AbortController().signal),
  );
  const shortPoint = room.timeline.at(-1)!;
  room = nextTurn(room);
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'test-only', new AbortController().signal),
  );
  room = applyMemories(
    room,
    await summarize(room, summaryModel, 'test-only', new AbortController().signal, true),
  );
  const longPoint = room.timeline.at(-1)!;
  room = nextTurn(room);
  expect(branchRoom(room, shortPoint.id).current.context.memories).toHaveLength(1);
  expect(activeShortMemories(branchRoom(room, shortPoint.id))).toHaveLength(1);
  const longBranch = branchRoom(room, longPoint.id);
  expect(longBranch.current.context.memories).toHaveLength(3);
  expect(activeShortMemories(longBranch)).toHaveLength(0);
  expect(activeMemories(longBranch)[0].kind).toBe('long');
  const edited = editTurnText(room, shortPoint.id, 'assistant', '수정한 대화');
  expect(edited.current.context.memories.some((m) => m.kind === 'long')).toBe(false);
  expect(activeShortMemories(edited)).toHaveLength(1);
});

it('summarizes on the tenth turn and resets countdown after a successful summary', async () => {
  let room = createRoom(exampleWork());
  for (let i = 0; i < 10; i++) {
    room = addResponse(
      room,
      '다음',
      { kind: 'turn', requestedCharacterIds: [], body: '대화', choices: [], delta: emptyDelta() },
      { model: 'demo' },
    );
    expect(summaryCountdown(room)).toBe(9 - i);
  }
  room.current.context.memories = await summarize(
    room,
    summaryModel,
    'test-only',
    new AbortController().signal,
  );
  expect(summaryCountdown(room)).toBe(10);
  room = addResponse(
    room,
    '다음',
    { kind: 'turn', requestedCharacterIds: [], body: '대화', choices: [], delta: emptyDelta() },
    { model: 'demo' },
  );
  expect(summaryCountdown(room)).toBe(9);
  room.current.context.settings.summaryEvery = 5;
  expect(summaryCountdown(room)).toBe(4);
});
