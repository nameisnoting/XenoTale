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
import { reviewCreatorProposal } from './creatorReview';
import type { Model, Work, Chapter } from './types';
import { validateWork } from './engine';

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
  it('proposes shared values, rules and multiple panels through linked creation sections', () => {
    const work = exampleWork();
    const hp = work.statuses[0].id;
    const patch: Partial<Work> = {
      statusPanels: [
        { id: 'combat', name: '전투', statusIds: [hp], template: `HP {{${hp}}}` },
        { id: 'person', name: '인물', statusIds: [hp], template: `체력 {{${hp}}}` },
      ],
      actions: [
        {
          id: 'heal',
          name: '회복',
          trigger: 'button',
          mode: 'all',
          conditions: [],
          steps: [{ kind: 'add', target: hp, value: '20' }],
        },
      ],
    };
    const request = creatorRequest(work);
    expect(request.sections.find((s) => s.id === 'statuses')?.name).toBe('이벤트 · 상태값·상태창');
    expect(request.draftSchema.statuses).toBeDefined();
    const parsed = parseCreatorAnswer(answer(work, patch), work, request);
    expect(parsed.proposal.sections).toHaveLength(1);
    const next = applyCreatorProposal(work, parsed.proposal);
    expect(next.statuses).toEqual(work.statuses);
    expect(next.statusPanels).toEqual(patch.statusPanels);
    expect(next.actions).toEqual(patch.actions);
  });

  it('sends all eleven sections with real field schemas, without managed fields or image bytes', () => {
    const work = exampleWork();
    work.cover = 'data:image/png;base64,secret-bytes';
    work.characters[0].image = work.cover;
    const request = creatorRequest(work);
    expect(request.sections).toHaveLength(11);
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
    const review = reviewCreatorProposal({ ...work, title: '내 제목' }, proposal);
    expect(review.work.title).toBe('내 제목');
    expect(review.issues[0].message).toContain('직접 수정');
  });
  it('restores uploaded images exactly without allowing fabricated asset references', () => {
    const work = emptyWork();
    work.cover = 'data:image/png;base64,local';
    const request = creatorRequest(work);
    const raw = answer(work, { title: '이미지 유지' });
    const next = applyCreatorProposal(work, parseCreatorAnswer(raw, work, request).proposal);
    expect(next.cover).toBe(work.cover);
    raw.proposals[0].replacement.cover = 'xenotale-local-asset:999';
    const review = reviewCreatorProposal(work, parseCreatorAnswer(raw, work, request).proposal);
    expect(review.work.cover).toBe(work.cover);
    expect(review.work.title).toBe('이미지 유지');
    expect(review.issues[0].message).toContain('등록되지 않은');
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
    const reviewed = reviewCreatorProposal(
      work,
      parseCreatorAnswer(
        answer(work, { title: '바뀌면 안 됨', chapters }),
        work,
        creatorRequest(work),
      ).proposal,
    );
    expect(reviewed.work.chapters).toEqual(work.chapters);
    expect(reviewed.work.title).toBe('바뀌면 안 됨');
    expect(reviewed.issues.some((issue) => issue.message.includes('이전 노드'))).toBe(true);
    const statuses = work.statuses.map((s) =>
      s.type === 'number' ? { ...s, initial: s.max + 1 } : s,
    );
    const statusesReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(answer(work, { statuses }), work, creatorRequest(work)).proposal,
    );
    expect(statusesReview.work.statuses).toEqual(work.statuses);
    expect(statusesReview.issues.some((issue) => issue.message.includes('숫자 범위'))).toBe(true);
    expect(work.title).toBe('정원 앞에서');
  });
  it('rejects root metadata, unknown nested fields, duplicate sections and wrong primitive types', () => {
    const work = emptyWork(),
      request = creatorRequest(work);
    const metadata = answer(work, { title: '제목' });
    metadata.proposals[0].replacement.id = 'overridden';
    const metadataReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(metadata, work, request).proposal,
    );
    expect(metadataReview.work.id).toBe(work.id);
    expect(metadataReview.work.title).toBe('제목');
    expect(metadataReview.issues[0].message).toContain('없는 필드');
    const nested = answer(work, { characters: work.characters });
    (nested.proposals[0].replacement.characters as any[])[0].apiKey = 'nope';
    const nestedReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(nested, work, request).proposal,
    );
    expect(nestedReview.work.characters).toEqual(work.characters);
    expect(nestedReview.issues[0].message).toContain('없는 필드');
    const duplicate = answer(work, { title: '제목' });
    duplicate.proposals.push(duplicate.proposals[0]);
    const duplicateReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(duplicate, work, request).proposal,
    );
    expect(duplicateReview.applicable).toBe(false);
    expect(duplicateReview.issues[0].message).toContain('중복');
    const malformed = answer(work, { title: '제목' });
    malformed.proposals[0].replacement.title = 42;
    const malformedReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(malformed, work, request).proposal,
    );
    expect(malformedReview.applicable).toBe(false);
    expect(malformedReview.issues[0].message).toContain('형식');
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
    const mediaReview = reviewCreatorProposal(
      work,
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
      ).proposal,
    );
    expect(mediaReview.work.media).toEqual(work.media);
    expect(mediaReview.issues[0].message).toContain('미디어');
    const graphReview = reviewCreatorProposal(
      work,
      parseCreatorAnswer(answer(work, { relationNodeIds: ['absent'] }), work, request).proposal,
    );
    expect(graphReview.work.relationNodeIds).toBeUndefined();
    expect(graphReview.issues[0].message).toContain('배치');
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
    const mock = vi.fn().mockResolvedValue({
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
      vi.fn().mockResolvedValue({
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
  it.each(['stop', 'length'])(
    'retains malformed or incomplete creator output when preservation is requested (%s)',
    async (finish) => {
      const content = '{"reply":"이미 받은 설명","proposals":[';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [{ finish_reason: finish, message: { content } }] }),
        }),
      );
      expect(
        await requestJson('system', {}, model, 'fake-key', new AbortController().signal, {
          preserveInvalidOutput: true,
        }),
      ).toBe(content);
    },
  );
});

describe('partial creator application', () => {
  const numeric = (id: string, initial = 10) => ({
    id,
    name: id,
    type: 'number' as const,
    initial,
    min: 0,
    max: 100,
    unit: '',
    options: [],
    prompt: '',
  });
  const chapter = (work: Work, id: string): Chapter => ({
    id,
    name: id,
    type: 'chapter',
    from: work.openings[0].id,
    mode: 'all',
    conditions: [],
    prologue: '기존 도입문',
    prompt: '',
    afterstory: false,
  });
  const review = (work: Work, patch: Partial<Work>) =>
    reviewCreatorProposal(
      work,
      parseCreatorAnswer(answer(work, patch), work, creatorRequest(work)).proposal,
    );

  it('preserves a rejected existing status, applies valid siblings and retains every raw proposal', () => {
    const work = emptyWork();
    work.statuses = [numeric('bad'), numeric('good')];
    const raw = answer(work, {
      title: '새 제목',
      statuses: [numeric('bad', 999), numeric('good', 20), numeric('new', 30)],
    });
    const parsed = parseCreatorAnswer(raw, work, creatorRequest(work));
    expect(parsed.reply).toBe(raw.reply);
    expect(parsed.proposal.sections.find((s) => s.id === 'statuses')!.replacement.statuses).toEqual(
      raw.proposals.find((s) => s.section === 'statuses')!.replacement.statuses,
    );
    const result = reviewCreatorProposal(work, parsed.proposal);
    expect(result.work.statuses.map((s) => s.initial)).toEqual([10, 20, 30]);
    expect(result.work.title).toBe('새 제목');
    expect(result.issues).toContainEqual(expect.objectContaining({ field: 'statuses', index: 0 }));
    expect(work.statuses.map((s) => s.initial)).toEqual([10, 10]);
    expect(() => validateWork(result.work)).not.toThrow();
  });
  it('rejects the entire chapter containing a bad choice condition while valid chapters apply', () => {
    const work = emptyWork();
    work.statuses = [
      { ...numeric('place'), type: 'choice', initial: '등교', options: ['등교', '귀가'] },
    ];
    const original = {
      ...chapter(work, 'old'),
      conditions: [
        {
          id: 'condition',
          kind: 'choice' as const,
          ref: 'place',
          op: 'eq' as const,
          value: '등교',
        },
      ],
    };
    work.chapters = [original];
    const bad = {
      ...original,
      prologue: '적용되면 안 되는 변경',
      conditions: [{ ...original.conditions[0], value: '학교에 감' }],
    };
    const good = {
      ...chapter(work, 'good'),
      conditions: [{ ...original.conditions[0], value: '귀가' }],
    };
    const result = review(work, {
      title: '정상 제목',
      chapters: [bad, good, { ...bad, id: 'bad-new' }],
    });
    expect(result.work.chapters).toEqual([original, good]);
    expect(result.issues.filter((i) => i.field === 'chapters').map((i) => i.index)).toEqual([0, 2]);
    expect(result.work.title).toBe('정상 제목');
    expect(() => validateWork(result.work)).not.toThrow();
  });
  it('rechecks dependencies after a new invalid status is excluded', () => {
    const work = emptyWork();
    const bad = { ...numeric('bad'), max: -1 };
    const scene = {
      ...chapter(work, 'dependent'),
      conditions: [
        { id: 'condition', kind: 'number' as const, ref: 'bad', op: 'gte' as const, value: 1 },
      ],
    };
    const result = review(work, {
      title: '유효한 내용',
      statuses: [bad, numeric('good')],
      chapters: [scene],
    });
    expect(result.work.statuses.map((s) => s.id)).toEqual(['good']);
    expect(result.work.chapters).toEqual([]);
    expect(result.issues.some((i) => i.field === 'statuses')).toBe(true);
    expect(result.issues.some((i) => i.field === 'chapters')).toBe(true);
    expect(result.work.title).toBe('유효한 내용');
    expect(() => validateWork(result.work)).not.toThrow();
  });
  it('does not remove a character still referenced by an unchanged opening', () => {
    const work = exampleWork();
    const result = review(work, {
      title: '유효한 제목',
      characters: [{ ...work.characters[0], id: 'replacement' }],
    });
    expect(result.work.characters).toEqual(work.characters);
    expect(result.work.openings).toEqual(work.openings);
    expect(result.work.title).toBe('유효한 제목');
    expect(result.issues.some((i) => i.field === 'characters')).toBe(true);
    expect(() => validateWork(result.work)).not.toThrow();
  });
  it('keeps linked valid replacements together, regardless of proposal ordering', () => {
    const work = emptyWork();
    const patch = {
      characters: [{ ...work.characters[0], id: 'replacement' }],
      openings: [{ ...work.openings[0], presence: ['replacement'] }],
    };
    const raw = answer(work, patch);
    raw.proposals.reverse();
    const result = reviewCreatorProposal(
      work,
      parseCreatorAnswer(raw, work, creatorRequest(work)).proposal,
    );
    expect(result.work).toMatchObject(patch);
    expect(result.issues).toEqual([]);
  });
  it('preserves required lists when all newly proposed entries are malformed', () => {
    const work = exampleWork();
    const raw = answer(work, { title: '제목', characters: work.characters });
    raw.proposals.find((s) => s.section === 'characters')!.replacement.characters = [42, null];
    const result = reviewCreatorProposal(
      work,
      parseCreatorAnswer(raw, work, creatorRequest(work)).proposal,
    );
    expect(result.work.characters).toEqual(work.characters);
    expect(result.work.title).toBe('제목');
    expect(() => validateWork(result.work)).not.toThrow();
    expect(review(work, { characters: [] }).applicable).toBe(false);
  });
  it('ignores pre-existing unfinished values while applying unrelated valid edits', () => {
    const work = emptyWork();
    work.statuses = [numeric('unfinished', 999)];
    const result = review(work, { title: '제목' });
    expect(result.work.title).toBe('제목');
    expect(result.work.statuses).toEqual(work.statuses);
  });
  it('keeps raw malformed output and unknown sections visible without applying them', () => {
    const work = emptyWork();
    const truncated = '{"reply":"설명은 보존됩니다","proposals":[';
    const parsed = parseCreatorAnswer(truncated, work, creatorRequest(work));
    expect(parsed.reply).toBe(truncated);
    expect(parsed.proposal.sections[0].replacement.response).toBe(truncated);
    expect(reviewCreatorProposal(work, parsed.proposal).applicable).toBe(false);
    const unknown = parseCreatorAnswer(
      {
        reply: '알 수 없는 제안',
        proposals: [{ section: 'surprise', reason: '원문', replacement: { newField: 42 } }],
        questions: [],
      },
      work,
      creatorRequest(work),
    );
    expect(unknown.proposal.sections[0].replacement).toEqual({ newField: 42 });
    expect(reviewCreatorProposal(work, unknown.proposal).work).toEqual(work);
  });
  it('skips only the field edited after a response while applying other valid fields', () => {
    const work = emptyWork();
    const proposal = parseCreatorAnswer(
      answer(work, { title: 'AI 제목', defaultUi: 'visual-novel' }),
      work,
      creatorRequest(work),
    ).proposal;
    const result = reviewCreatorProposal({ ...work, title: '내 제목' }, proposal);
    expect(result.work.title).toBe('내 제목');
    expect(result.work.defaultUi).toBe('visual-novel');
    expect(result.issues[0].field).toBe('title');
  });
  it('collects every invalid condition and terminates on cycles', () => {
    const work = emptyWork();
    const result = review(work, {
      title: '제목',
      chapters: [
        { ...chapter(work, 'a'), from: 'b' },
        { ...chapter(work, 'b'), from: 'a' },
      ],
    });
    expect(result.work.chapters).toEqual([]);
    expect(result.work.title).toBe('제목');
    expect(result.issues.filter((i) => i.field === 'chapters')).toHaveLength(2);
  });
});
