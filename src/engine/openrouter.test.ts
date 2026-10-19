import { afterEach, describe, it, expect, vi } from 'vitest';
import { exampleWork } from '../test/exampleWork';
import { addResponse, createRoom, emptyDelta } from '../domain/engine';
import { buildMessages, demoModel, generate, reasoningFor, reasoningSupported } from './openrouter';
import type { Model } from '../domain/types';
const model: Model = {
  id: 'anthropic/test',
  name: 'Mock',
  context_length: 200000,
  supported_parameters: ['structured_outputs'],
  reasoning: { supports_max_tokens: true },
};
const envelope = () => ({
  kind: 'turn',
  requestedCharacterIds: [],
  body: '@아리아: 반갑습니다.',
  choices: [],
  delta: emptyDelta(),
});
const reply = (value: unknown, finish = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 50 },
        cost: 0.001,
      },
    }),
  );
afterEach(() => vi.unstubAllGlobals());
describe('provider contract', () => {
  it('uses Gemini JSON mode with the full local contract and the advertised thinking level', async () => {
    let sent: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        sent = JSON.parse(init.body);
        return reply(envelope());
      }),
    );
    const room = createRoom(exampleWork());
    const gemini: Model = {
      id: 'google/gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      context_length: 1048576,
      supported_parameters: ['structured_outputs', 'response_format', 'reasoning'],
      reasoning: { supported_efforts: ['high', 'medium', 'low'] },
      top_provider: { max_completion_tokens: 65536 },
    };
    const result = await generate(
      room,
      room.current,
      '안녕',
      gemini,
      'fake',
      new AbortController().signal,
      { reroll: false },
    );
    expect(sent.model).toBe(gemini.id);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.tools).toBeUndefined();
    expect(sent.reasoning).toEqual({ effort: 'medium', exclude: true });
    expect(sent.max_tokens).toBe(16384);
    expect(sent.messages[0].content).toContain('OUTPUT SCHEMA');
    expect(sent.messages[0].content).toContain('relationships');
    expect(result.result).toEqual(envelope());
    expect(room.timeline).toEqual([]);
  });
  it('Gemini JSON mode still rejects invalid references and never commits malformed responses', async () => {
    const invalid = envelope();
    invalid.delta.numeric.push({ fieldId: 'unregistered', amount: 1000 });
    const fetch = vi.fn(async (_url: unknown, _init: RequestInit) => reply(invalid));
    vi.stubGlobal('fetch', fetch);
    const room = createRoom(exampleWork()),
      before = structuredClone(room);
    const gemini = {
      ...model,
      id: 'google/gemini-3.8-flash',
      supported_parameters: ['structured_outputs', 'response_format'],
    };
    await expect(
      generate(room, room.current, '안녕', gemini, 'fake', new AbortController().signal, {
        reroll: false,
      }),
    ).rejects.toThrow('응답 형식');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(room).toEqual(before);
    for (const call of fetch.mock.calls)
      expect(JSON.parse((call[1] as RequestInit).body as string).response_format).toEqual({
        type: 'json_object',
      });
  });
  it('non-Gemini structured-output models keep strict JSON schema requests', async () => {
    let sent: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        sent = JSON.parse(init.body);
        return reply(envelope());
      }),
    );
    const room = createRoom(exampleWork());
    await generate(room, room.current, '안녕', model, 'fake', new AbortController().signal, {
      reroll: false,
    });
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.strict).toBe(true);
  });
  it('demo replies keep custom characters, avoid provider requests and never invent state changes', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const work = exampleWork();
    work.characters[0].name = '우주 탐사원';
    work.characters[0].image = 'data:image/png;base64,test';
    let room = createRoom(work);
    const initial = structuredClone(room.current.runtime);
    for (let turn = 0; turn < 3; turn++) {
      const answer = await generate(
        room,
        room.current,
        '정원',
        demoModel,
        '',
        new AbortController().signal,
        { reroll: false },
      );
      expect(answer.result.body).toBe(
        '*여기에 지문이 나옵니다.*\n\n@우주 탐사원: 여기에 캐릭터 대사가 나옵니다.',
      );
      expect(answer.result.delta).toEqual(emptyDelta());
      expect(answer.usage).toEqual({ model: 'demo', cost: 0 });
      room = addResponse(room, '정원', answer.result, answer.usage);
    }
    expect(room.current.runtime.status).toEqual(initial.status);
    expect(room.current.runtime.inventory).toEqual(initial.inventory);
    expect(room.current.runtime.relationships).toEqual(initial.relationships);
    expect(room.work).toEqual(work);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses five reasoning budgets, respects supported efforts, and omits unsupported reasoning', () => {
    expect(reasoningFor(model, 4)?.max_tokens).toBe(16384);
    expect(
      reasoningFor({ ...model, reasoning: { supported_efforts: ['low', 'high'] } }, 2)?.effort,
    ).toBe('high');
    expect(reasoningSupported({ ...model, reasoning: undefined })).toBe(false);
    expect(reasoningFor({ ...model, reasoning: undefined }, 2)).toBeUndefined();
  });
  it('keeps the prefix stable across user input changes and treats empty-send as continue', () => {
    const r = createRoom(exampleWork());
    const options = {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'frame',
    };
    const a = buildMessages(r, r.current, '첫 입력', options);
    const b = buildMessages(r, r.current, '[이어서 내용 전개]', options);
    expect(a.slice(0, -1)).toEqual(b.slice(0, -1));
    expect(JSON.parse(b.at(-1)!.content as string).playerInput.kind).toBe('continue');
    expect(a[0].content).toContain('OUTPUT SCHEMA');
  });
  it('choice visibility never changes generation instructions or cached prefixes', () => {
    const room = createRoom(exampleWork());
    const options = {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'json',
    };
    room.current.context.settings.choices = false;
    const hidden = buildMessages(room, room.current, '안녕', options);
    room.current.context.settings.choices = true;
    expect(buildMessages(room, room.current, '안녕', options)).toEqual(hidden);
    expect(JSON.parse(hidden.at(-1)!.content as string).turnDirectives.choicesEnabled).toBe(true);
  });
  it('sends concrete quality instructions only in the dynamic tail while preserving cache prefixes', async () => {
    const room = createRoom(exampleWork());
    const sent: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        sent.push(JSON.parse(init.body));
        return reply(envelope());
      }),
    );
    await generate(room, room.current, '안녕', model, 'fake', new AbortController().signal, {
      reroll: false,
    });
    room.current.context.settings.quality = {
      ...room.current.context.settings.quality,
      style: '무협',
      ratio: '대사 우선',
      pacing: '빠름',
      length: '짧음',
      viewpoint: '1인칭 관찰자',
      viewpointActorId: 'aria',
      viewpointTargetId: 'user',
    };
    await generate(room, room.current, '안녕', model, 'fake', new AbortController().signal, {
      reroll: false,
    });
    expect(sent[0].messages.slice(0, -1)).toEqual(sent[1].messages.slice(0, -1));
    const tail = JSON.parse(sent[1].messages.at(-1).content).turnDirectives;
    expect(tail.quality.style).toBe('무협');
    expect(tail.qualityInstructions.join('\n')).toContain('wuxia');
    expect(tail.qualityInstructions.join('\n')).toContain('85%');
    expect(tail.qualityInstructions.join('\n')).toContain('1,000');
    expect(tail.qualityInstructions.join('\n')).toContain(
      'observer ID "aria", observing target ID "user"',
    );
    expect(typeof sent[1].messages.at(-1).content).toBe('string');
    expect(JSON.stringify(sent[1].messages.slice(0, -1))).not.toContain('STYLE:');
  });
  it('includes every matching lore entry beyond eight without excluding loaded character lore', () => {
    const room = createRoom(exampleWork());
    const loreEntry = (id: string, keywords = ['정원']) => ({
      id,
      name: id,
      keywords,
      prompt: `${id} 설정`,
    });
    room.work.lore = [
      ...Array.from({ length: 10 }, (_, index) => loreEntry(`work-${index}`)),
      loreEntry('unmatched', ['서고']),
      loreEntry('empty-keyword', ['']),
    ];
    room.work.characters.find((character) => character.id === 'aria')!.lore = [
      loreEntry('main-character'),
    ];
    room.work.characters.find((character) => character.id === 'sera')!.lore = [
      loreEntry('supporting-character'),
    ];
    const options = {
      reroll: false,
      extra: [],
      directive: '',
      canRequest: true,
      transport: 'json',
    };
    const activeLore = (extra: string[]) => {
      const messages = buildMessages(room, room.current, '정원을 살펴본다', {
        ...options,
        extra,
      });
      return JSON.parse(messages.at(-1)!.content as string).runtimeContext.activeLorebook;
    };
    expect(activeLore([]).map((entry: { id: string }) => entry.id)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `work-${index}`),
      'main-character',
    ]);
    expect(activeLore(['sera']).map((entry: { id: string }) => entry.id)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `work-${index}`),
      'main-character',
      'supporting-character',
    ]);
  });
  it('keeps supporting on-stage profiles in the uncached tail and removes them after exit', async () => {
    const room = createRoom(exampleWork());
    const supporting = room.work.characters.find((character) => character.id === 'sera')!;
    const sent: any[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        sent.push(JSON.parse(init.body));
        return reply(envelope());
      }),
    );
    for (const presence of [['aria'], ['aria', 'sera'], ['aria']]) {
      room.current.runtime.presence = presence;
      await generate(room, room.current, '안녕', model, 'fake', new AbortController().signal, {
        reroll: false,
      });
    }
    const tails = sent.map((request) => JSON.parse(request.messages.at(-1).content).runtimeContext);
    expect(tails[0].additionalCharacterDetails).toEqual([]);
    expect(tails[1].additionalCharacterDetails).toEqual([
      { id: 'sera', name: supporting.name, prompt: supporting.prompt },
    ]);
    expect(tails[1].loadedCharacterIds).toContain('sera');
    expect(tails[2].additionalCharacterDetails).toEqual([]);
    expect(sent[0].messages.slice(0, -1)).toEqual(sent[1].messages.slice(0, -1));
    expect(sent[1].messages.slice(0, -1)).toEqual(sent[2].messages.slice(0, -1));
    expect(JSON.stringify(sent[0].messages.slice(0, -1))).not.toContain(supporting.prompt);
    expect(sent[1].messages[0].content[0].cache_control.type).toBe('ephemeral');
    for (const request of sent) expect(typeof request.messages.at(-1).content).toBe('string');
  });
  it('adds cache boundaries only before dynamic state and sends reasoning with output headroom', async () => {
    let sent: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u, init) => {
        sent = JSON.parse(init.body);
        return reply(envelope());
      }),
    );
    const r = createRoom(exampleWork());
    r.current.context.settings.creativity = 4;
    const answer = await generate(
      r,
      r.current,
      '안녕',
      model,
      'fake',
      new AbortController().signal,
      { reroll: false },
    );
    expect(sent.reasoning).toEqual({ max_tokens: 16384, exclude: true });
    expect(sent.max_tokens).toBeGreaterThan(sent.reasoning.max_tokens);
    expect(sent.messages[0].content[0].cache_control.type).toBe('ephemeral');
    expect(typeof sent.messages.at(-1).content).toBe('string');
    expect(answer.usage.cacheRead).toBe(50);
  });
  it('retries one semantically invalid delta and returns only the valid complete result', async () => {
    const invalid = envelope();
    invalid.delta.numeric.push({ fieldId: 'unknown', amount: 1 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(invalid))
      .mockResolvedValueOnce(reply(envelope()));
    vi.stubGlobal('fetch', fetch);
    const r = createRoom(exampleWork());
    const answer = await generate(
      r,
      r.current,
      '안녕',
      model,
      'fake',
      new AbortController().signal,
      { reroll: false },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(answer.result.delta.numeric).toEqual([]);
    expect(answer.usage.input).toBe(200);
    expect(r.timeline).toEqual([]);
  });
  it('loads an introduced supporting character before accepting their dialogue', async () => {
    const request = {
      ...envelope(),
      kind: 'need_context',
      body: '',
      requestedCharacterIds: ['sera'],
    };
    const answer = {
      ...envelope(),
      body: '@세라: 기록을 보여 드릴까요?',
      delta: { ...emptyDelta(), presence: [{ characterId: 'sera', present: true }] },
    };
    let payload: any;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(request))
      .mockImplementationOnce(async (_u, init) => {
        payload = JSON.parse(init.body);
        return reply(answer);
      });
    vi.stubGlobal('fetch', fetch);
    const r = createRoom(exampleWork());
    const out = await generate(
      r,
      r.current,
      '사서를 만난다',
      model,
      'fake',
      new AbortController().signal,
      { reroll: false },
    );
    expect(out.result.body).toContain('세라');
    expect(payload.messages.at(-1).content).toContain('기록과 약속을 중요하게');
    expect(
      JSON.parse(payload.messages.at(-1).content).runtimeContext.currentState.presence,
    ).not.toContain('sera');
    expect(JSON.stringify(payload.messages.slice(0, -1))).not.toContain(
      r.work.characters.find((character) => character.id === 'sera')!.prompt,
    );
  });
  it('rejects truncated generations without committing a partial response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(envelope(), 'length')));
    const r = createRoom(exampleWork());
    await expect(
      generate(r, r.current, '안녕', model, 'fake', new AbortController().signal, {
        reroll: false,
      }),
    ).rejects.toThrow('끝까지');
    expect(r.timeline).toHaveLength(0);
  });
});
