import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import type { StatusDef } from './types';
import { emptyWork } from './defaults';
import { applyDelta, emptyDelta, initialState } from './engine';
import { requiresDeleteConfirmation } from './deletion';
import { workSchema } from '../persistence/files';
import { nextStatusName, statusTemplateExample, syncStatusTemplate } from './statusTemplate';

const status = (name = '상태값1', id = 'one'): StatusDef => ({
  id,
  name,
  defaultName: name,
  type: 'number',
  initial: 0,
  min: 0,
  max: 100,
  unit: '',
  options: [],
  prompt: '',
});
it('creates the requested tokens and keeps untouched defaults aligned on add, rename and delete', () => {
  const one = status();
  const two = status('상태값2', 'two');
  expect(syncStatusTemplate('', [], [one])).toBe('{{상태값1}}');
  const template = syncStatusTemplate('{{상태값1}}', [one], [one, two]);
  expect(template).toBe('{{상태값1}}\n{{상태값2}}');
  expect(syncStatusTemplate(template, [one, two], [{ ...one, name: '체력' }, two])).toBe(
    '{{체력}}\n{{상태값2}}',
  );
  expect(syncStatusTemplate(template, [one, two], [two])).toBe('{{상태값2}}');
});
it('updates both example formats with the current definitions', () => {
  const before = [status()];
  const after = [
    { ...status(), name: '체력', displayMax: true, unit: '점' },
    status('위치', 'place'),
  ];
  for (const kind of ['markdown', 'html'] as const) {
    const template = syncStatusTemplate(statusTemplateExample(before, kind), before, after);
    expect(template).toBe(statusTemplateExample(after, kind));
    expect(template).toContain('{{체력}} / 100점');
    expect(template).toContain('{{위치}}');
  }
});
it('preserves authored markdown and HTML when definitions change', () => {
  const before = [status()];
  for (const template of ['체력: {{상태값1}}', '<div class="mine">{{one}}</div>'])
    expect(syncStatusTemplate(template, before, [...before, status('상태값2', 'two')])).toBe(
      template,
    );
});
it('uses IDs for unnamed fields, escapes HTML labels and generates a titled code block', () => {
  expect(statusTemplateExample([{ ...status(), name: '' }])).toBe('{{one}}');
  expect(statusTemplateExample([status('<체력> & 힘')], 'html')).toContain(
    '<dt>&lt;체력&gt; &amp; 힘</dt>',
  );
  expect(statusTemplateExample([status('체력|힘')], 'markdown')).toBe(
    '```Status\n체력|힘: {{체력|힘}}\n```',
  );
  expect(statusTemplateExample([], 'html')).toBe('');
});
it('avoids default-name collisions after deletion and preserves default titles in portable files', () => {
  const work = emptyWork();
  work.statuses = [status(), status('상태값3', 'three')];
  expect(nextStatusName(work.statuses)).toBe('상태값2');
  const restored = workSchema.parse(work).statuses[0];
  expect(restored.defaultName).toBe('상태값1');
  expect(requiresDeleteConfirmation('status', restored)).toBe(false);
  expect(requiresDeleteConfirmation('status', { ...restored, name: '체력' })).toBe(true);
});
it('matches AI changes by ID even when names and types match, and clamps numeric deltas', () => {
  const work = emptyWork();
  work.statuses = [status('체력', 'one'), status('체력', 'two')];
  const before = initialState(work, work.openings[0].id);
  const delta = { ...emptyDelta(), numeric: [{ fieldId: 'two', amount: 999 }] };
  const { state } = applyDelta(work, before, delta);
  expect(state.status).toEqual({ one: 0, two: 100 });
  expect(before.status).toEqual({ one: 0, two: 0 });
  expect(() =>
    applyDelta(work, before, { ...delta, numeric: [{ fieldId: '체력', amount: 1 }] }),
  ).toThrow();
});
it('replaces text and registered choices and rejects mismatched types', () => {
  const work = emptyWork();
  work.statuses = [
    { ...status('기분', 'mood'), type: 'text', initial: '' },
    { ...status('위치', 'place'), type: 'choice', initial: '집', options: ['집', '정원'] },
  ];
  const before = initialState(work, work.openings[0].id);
  const delta = {
    ...emptyDelta(),
    text: [{ fieldId: 'mood', value: '기쁨' }],
    choice: [{ fieldId: 'place', optionId: '정원' }],
  };
  expect(applyDelta(work, before, delta).state.status).toEqual({ mood: '기쁨', place: '정원' });
  expect(() =>
    applyDelta(work, before, { ...emptyDelta(), numeric: [{ fieldId: 'mood', amount: 1 }] }),
  ).toThrow();
});
