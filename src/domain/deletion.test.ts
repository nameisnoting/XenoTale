import { describe, expect, it } from 'vitest';
import { requiresDeleteConfirmation as confirm } from './deletion';
import { emptyWork } from './defaults';
import { workSchema } from '../persistence/files';
import { newEvent } from './events';

describe('authored-entry deletion policy', () => {
  it('deletes untouched generated titles immediately, but protects renamed titles across serialization', () => {
    const note = { name: '노트 1', defaultName: '노트 1', body: '' };
    expect(confirm('note', note)).toBe(false);
    expect(confirm('note', JSON.parse(JSON.stringify({ ...note, name: '노트 99' })))).toBe(true);
    expect(confirm('note', { ...note, body: '  \n ' })).toBe(false);
    expect(confirm('note', { ...note, body: '기억할 내용' })).toBe(true);
  });
  it('protects images, gender and prompt even with an unchanged persona title', () => {
    const blank = {
      name: '페르소나 1',
      defaultName: '페르소나 1',
      prompt: '',
      image: '',
      gender: '',
    };
    expect(confirm('persona', blank)).toBe(false);
    for (const patch of [
      { image: 'data:image/png;base64,abc' },
      { gender: '남성' },
      { prompt: '내용' },
      { name: '내 이름' },
    ])
      expect(confirm('persona', { ...blank, ...patch })).toBe(true);
    expect(confirm('persona', { ...blank, defaultName: '' })).toBe(true);
  });
  it('protects authored keywords and nested character data', () => {
    expect(
      confirm('lore', { name: '로어북 1', defaultName: '로어북 1', keywords: [], prompt: '' }),
    ).toBe(false);
    expect(confirm('lore', { name: '로어북 1', keywords: ['비밀'], prompt: '' })).toBe(true);
    expect(
      confirm('character', { name: '', image: '', trigger: '', prompt: '', group: '', lore: [{}] }),
    ).toBe(true);
  });
  it('distinguishes default numeric settings from configured ones', () => {
    const status = {
      name: '',
      type: 'number',
      initial: 0,
      min: 0,
      max: 100,
      prompt: '',
      unit: '',
      options: [],
    };
    expect(confirm('status', status)).toBe(false);
    for (const patch of [
      { max: 200 },
      { initial: 1 },
      { type: 'text' },
      { levels: [{ min: 0, max: 100, prompt: '' }] },
    ])
      expect(confirm('status', { ...status, ...patch })).toBe(true);
    expect(
      confirm('item', { name: '', image: '', prompt: '', owned: false, enhancement: null }),
    ).toBe(false);
    expect(confirm('item', { name: '', owned: true })).toBe(true);
  });
  it('protects opening suggestions and chapter conditions without counting default links', () => {
    expect(
      confirm('opening', {
        name: '도입부 1',
        defaultName: '도입부 1',
        body: '',
        suggestions: ['', '', ''],
        bgm: '',
        presence: ['character'],
      }),
    ).toBe(false);
    expect(confirm('opening', { name: '도입부 1', suggestions: ['선택'] })).toBe(true);
    const chapter = {
      name: '챕터 1',
      defaultName: '챕터 1',
      from: 'opening',
      type: 'chapter',
      mode: 'all',
      conditions: [],
      prologue: '',
      prompt: '',
      afterstory: true,
    };
    expect(confirm('chapter', chapter)).toBe(false);
    expect(confirm('chapter', { ...chapter, conditions: [{ ref: 'status' }] })).toBe(true);
  });
  it('protects descriptions, effect code, group prompts and both relationship labels', () => {
    expect(confirm('shortcut', { name: '', description: '설명', prompt: '' })).toBe(true);
    expect(confirm('effect', { name: '', prompt: '', content: '<html>' })).toBe(true);
    expect(confirm('characterGroup', { name: '그룹 1', prompt: '그룹 설정' })).toBe(true);
    expect(confirm('relation', { label: '', innerLabel: '비밀 관계' })).toBe(true);
  });
  it('protects event names, execution settings and links, retaining provenance through files', () => {
    const event = newEvent();
    expect(confirm('event', event)).toBe(false);
    expect(confirm('event', { ...event, workspace: { view: 'nodes' } })).toBe(false);
    for (const patch of [
      { name: '보상 받기' },
      { name: '이벤트99' },
      { trigger: 'after-response' },
      { triggerRef: 'status-id' },
      { mode: 'any' },
      { buttonLocation: 'screen' },
      { steps: [{ kind: 'music', target: '', value: '' }] },
      { conditions: [{ ref: 'status-id' }] },
      { workspace: { view: 'blocks', chapters: ['chapter-id'] } },
      { workspace: { view: 'blocks', innerUnlock: true } },
    ])
      expect(confirm('event', { ...event, ...patch })).toBe(true);
    const work = emptyWork();
    work.actions = [{ ...event, name: '이벤트99' }];
    const restored = workSchema.parse(JSON.parse(JSON.stringify(work))).actions![0];
    expect(restored.defaultName).toBe(event.name);
    expect(confirm('event', restored)).toBe(true);
    const legacy = { ...event, defaultName: undefined };
    expect(confirm('event', legacy)).toBe(false);
    expect(confirm('event', { ...legacy, name: '규칙 1' })).toBe(false);
    expect(confirm('event', { ...legacy, name: '보상 받기' })).toBe(true);
  });
  it('retains default-name provenance in portable work data', () => {
    const work = emptyWork();
    work.personas = [
      { id: 'persona', name: '페르소나 99', defaultName: '페르소나 1', prompt: '', image: '' },
    ];
    work.lore = [
      { id: 'lore', name: '로어북 99', defaultName: '로어북 1', prompt: '', keywords: [] },
    ];
    const restored = workSchema.parse(JSON.parse(JSON.stringify(work)));
    expect(confirm('persona', restored.personas[0])).toBe(true);
    expect(confirm('lore', restored.lore[0])).toBe(true);
    expect(confirm('opening', restored.openings[0])).toBe(false);
  });
});
