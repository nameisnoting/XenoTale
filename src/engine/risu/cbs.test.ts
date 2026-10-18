import { test, expect } from 'vitest';
import { cbs, applyRisuRules } from './cbs';
import { activeLore } from './lore';
import type { RisuCommand } from './types';
const context: RisuCommand = {
  config: {
    version: 1,
    scripts: [],
    styles: '',
    variables: '',
    rules: [],
    loreSettings: { scanDepth: 1, tokenBudget: 1000, recursive: false },
  },
  state: { selected: 'Elf' },
  chats: [{ role: 'user', data: '숲으로' }],
  lore: [],
  action: 'display',
  user: '여행자',
  character: '모험',
  index: 0,
};
test('nested CBS conditions and ordered regex preserve unknown expressions and button targets', () => {
  expect(
    cbs(
      '{{#when::{{getvar::selected}}::is::Elf}}안녕 {{user}}{{#if::0}}숨김{{:else}}!{{/if}}{{:else}}실패{{/when}}',
      context,
    ),
  ).toBe('안녕 여행자!');
  expect(cbs('{{button::선택::choose}} {{unknown}}', context)).toContain(
    'data-risu-trigger="choose"',
  );
  const command = {
    ...context,
    config: {
      ...context.config,
      rules: [
        {
          id: '1',
          name: '',
          type: 'editdisplay' as const,
          pattern: '(hello)',
          replacement: '$1 {{user}}$n',
          flags: 'g<cbs>',
        },
        {
          id: '2',
          name: '',
          type: 'editdisplay' as const,
          pattern: 'hello',
          replacement: '안녕',
          flags: 'g',
        },
      ],
    },
  };
  expect(applyRisuRules('hello', command, 'editdisplay')).toBe('안녕 여행자\n');
});
test('lore keeps references out of the prompt and honors scan depth and recursive activation', () => {
  const command = {
    ...context,
    lore: [
      { name: '기본', prompt: '공통 규칙', keywords: [], activation: 'always' },
      { name: '숲', prompt: '나무가 있다', keywords: ['숲'], activation: 'keyword' },
      { name: '나무', prompt: '연쇄 자료', keywords: ['나무'], activation: 'keyword' },
      { name: '자료', prompt: '조회용 자료', keywords: ['숲'], activation: 'reference' },
    ],
  };
  expect(activeLore(command)).toBe('공통 규칙\n\n나무가 있다');
  expect(
    activeLore({
      ...command,
      config: {
        ...command.config,
        loreSettings: { ...command.config.loreSettings, recursive: true },
      },
    }),
  ).toContain('연쇄 자료');
});
