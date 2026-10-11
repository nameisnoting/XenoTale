import { describe, it, expect, vi, afterEach } from 'vitest';
import { emptyWork } from './defaults';
import { exampleWork } from '../test/exampleWork';
import {
  creatorRequest,
  parseCreatorAnswer,
  applyCreatorProposal,
  creatorSections,
} from './creatorAssistant';
import { requestJson } from '../engine/auxiliary';
import type { Model, Work } from './types';

function answer(work: Work, patch: Partial<Work>) {
  const snapshot = creatorRequest({ ...work, ...patch });
  return {
    reply: '제안을 준비했습니다.',
    proposals: creatorSections
      .filter((s) => s.fields.some((f) => Object.hasOwn(patch, f)))
      .map((s) => ({ section: s.id, reason: '요청 반영', replacement: snapshot.draft[s.id] })),
    questions: [],
  };
}
describe('whole creation assistant', () => {
  it('sends all twelve sections with real field schemas, without managed fields or image bytes', () => {
    const work = exampleWork();
    work.cover = 'data:image/png;base64,secret-bytes';
    work.characters[0].image = work.cover;
    const request = creatorRequest(work);
    expect(request.sections).toHaveLength(12);
    expect(request.draft.overview.cover).toBe(
      request.draft.characters.characters instanceof Array &&
        request.draft.characters.characters[0].image,
    );
    expect(JSON.stringify({ draft: request.draft, schema: request.draftSchema })).not.toContain(
      'secret-bytes',
    );
    expect(request.draft.overview).not.toHaveProperty('author');
    expect(request.draft.overview).not.toHaveProperty('id');
    expect(
      (request.draftSchema.effects as any).properties.effects.items.properties.content.type,
    ).toBe('string');
  });
  it('validates and applies linked changes atomically while leaving original untouched', () => {
    const work = emptyWork();
    const characters = work.characters.map((c) => ({ ...c, name: '아리아', prompt: '안내인' }));
    const statuses = [
      {
        id: 'trust',
        name: '신뢰',
        type: 'number' as const,
        initial: 0,
        min: 0,
        max: 100,
        unit: '',
        options: [],
        prompt: '협력하면 증가',
      },
    ];
    const chapters = [
      {
        id: 'next',
        name: '약속',
        type: 'chapter' as const,
        from: work.openings[0].id,
        mode: 'all' as const,
        conditions: [
          { id: 'reach', kind: 'number' as const, ref: 'trust', op: 'gte' as const, value: 10 },
        ],
        prologue: '문이 열린다',
        prompt: '약속을 지킨다',
        afterstory: false,
      },
    ];
    const patch = { title: '약속의 정원', characters, statuses, chapters };
    const { proposal } = parseCreatorAnswer(answer(work, patch), work, creatorRequest(work));
    const next = applyCreatorProposal(work, proposal);
    expect(next).toMatchObject(patch);
    expect(work.title).toBe('');
    expect(work.statuses).toEqual([]);
    expect(next.id).toBe(work.id);
    expect(next.version).toBe(work.version);
  });
  it('retains unrelated edits, but rejects edits in a changed field', () => {
    const work = emptyWork();
    const { proposal } = parseCreatorAnswer(
      answer(work, { title: 'AI 제목' }),
      work,
      creatorRequest(work),
    );
    expect(
      applyCreatorProposal({ ...work, description: '직접 쓴 소개' }, proposal).description,
    ).toBe('직접 쓴 소개');
    expect(() => applyCreatorProposal({ ...work, title: '내 제목' }, proposal)).toThrow(
      '수정하셨습니다',
    );
  });
  it('restores uploaded images exactly without allowing fabricated asset references', () => {
    const work = emptyWork();
    work.cover = 'data:image/png;base64,local';
    const request = creatorRequest(work);
    const raw = answer(work, { title: '이미지 유지' });
    const next = applyCreatorProposal(work, parseCreatorAnswer(raw, work, request).proposal);
    expect(next.cover).toBe(work.cover);
    raw.proposals[0].replacement.cover = 'xenotale-local-asset:999';
    expect(() => parseCreatorAnswer(raw, work, request)).toThrow('등록되지 않은');
  });
  it('rejects invalid references and bounds before any application', () => {
    const work = exampleWork();
    const chapters = work.chapters.map((c) => ({ ...c, from: 'missing' }));
    // The example may have no chapters: always create one invalid candidate.
    if (!chapters.length)
      chapters.push({
        id: 'bad',
        name: '잘못된 연결',
        from: 'missing',
        type: 'chapter',
        mode: 'all',
        conditions: [],
        prologue: '',
        prompt: '',
        afterstory: false,
      });
    expect(() =>
      parseCreatorAnswer(
        answer(work, { title: '바뀌면 안 됨', chapters }),
        work,
        creatorRequest(work),
      ),
    ).toThrow('이전 노드');
    const statuses = work.statuses.map((s) =>
      s.type === 'number' ? { ...s, initial: s.max + 1 } : s,
    );
    expect(() =>
      parseCreatorAnswer(answer(work, { statuses }), work, creatorRequest(work)),
    ).toThrow('숫자 범위');
    expect(work.title).toBe('정원 앞에서');
  });
  it('rejects root metadata, unknown nested fields, duplicate sections and wrong primitive types', () => {
    const work = emptyWork(),
      request = creatorRequest(work);
    const metadata = answer(work, { title: '제목' });
    metadata.proposals[0].replacement.id = 'overridden';
    expect(() => parseCreatorAnswer(metadata, work, request)).toThrow();
    const nested = answer(work, { characters: work.characters });
    (nested.proposals[0].replacement.characters as any[])[0].apiKey = 'nope';
    expect(() => parseCreatorAnswer(nested, work, request)).toThrow('없는 필드');
    const duplicate = answer(work, { title: '제목' });
    duplicate.proposals.push(duplicate.proposals[0]);
    expect(() => parseCreatorAnswer(duplicate, work, request)).toThrow('중복');
    const malformed = answer(work, { title: '제목' });
    malformed.proposals[0].replacement.title = 42;
    expect(() => parseCreatorAnswer(malformed, work, request)).toThrow('형식');
  });
  it('allows Q&A/no-op replies, and validates media and graph references', () => {
    const work = emptyWork(),
      request = creatorRequest(work);
    expect(
      parseCreatorAnswer({ reply: '답변', proposals: [], questions: [] }, work, request).proposal
        .changes,
    ).toEqual([]);
    expect(
      parseCreatorAnswer(answer(work, { title: work.title }), work, request).proposal.changes,
    ).toEqual([]);
    expect(() =>
      parseCreatorAnswer(
        answer(work, {
          media: {
            template: '',
            characters: [{ code: '1', characterId: 'absent' }],
            situations: [],
          },
        }),
        work,
        request,
      ),
    ).toThrow('미디어');
    expect(() =>
      parseCreatorAnswer(answer(work, { relationNodeIds: ['absent'] }), work, request),
    ).toThrow('배치');
  });
  it('preserves shared opaque asset tokens for follow-up proposals', () => {
    const work = emptyWork();
    work.cover = 'data:image/png;base64,a';
    work.characters[0].image = 'data:image/png;base64,b';
    const first = creatorRequest(work);
    const pending = creatorRequest({ ...work, cover: '' }, first.assets);
    expect((pending.draft.characters.characters as any[])[0].image).toBe(
      (first.draft.characters.characters as any[])[0].image,
    );
  });
});

describe('structured creator request output budget', () => {
  afterEach(() => vi.unstubAllGlobals());
  const model: Model = {
    id: 'test/model',
    name: 'test',
    context_length: 200000,
    supported_parameters: ['response_format'],
    top_provider: { max_completion_tokens: 8000 },
  };
  it('uses provider-limited budget and JSON response format', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: '{"reply":"ok"}' } }],
        }),
      });
    vi.stubGlobal('fetch', mock);
    await requestJson('system', {}, model, 'fake-key', new AbortController().signal, {
      maxTokens: 16384,
    });
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(8000);
    expect(body.response_format.type).toBe('json_object');
  });
  it('rejects truncated output and too-small context instead of offering partial changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ finish_reason: 'length', message: { content: '{}' } }],
          }),
        }),
    );
    await expect(
      requestJson('system', {}, model, 'fake-key', new AbortController().signal),
    ).rejects.toThrow('완성되지');
    await expect(
      requestJson(
        'system',
        {},
        { ...model, context_length: 1024 },
        'fake-key',
        new AbortController().signal,
      ),
    ).rejects.toThrow('컨텍스트');
  });
});
