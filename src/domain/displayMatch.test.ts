import { it, expect } from 'vitest';
import { displayPattern, readDisplayMatch } from './displayMatch';
import { transformDisplay } from './displayRules';

it('matches literal marker names, including regex punctuation, without changing surrounding text', () => {
  for (const name of ['HP', '회복+20', '웃음(밝음)', '$[표식].*?\\']) {
    const pattern = displayPattern('marker', name);
    expect(readDisplayMatch(pattern, 'g')).toEqual({ mode: 'marker', text: name });
    expect(
      transformDisplay('앞 {{' + name + '}} 뒤 {{' + name + '}}', [
        { id: 'r', name: '', enabled: true, pattern, flags: 'g', replacement: '❤️' },
      ]),
    ).toBe('앞 ❤️ 뒤 ❤️');
  }
  expect(displayPattern('marker', '{{HP}}')).toBe(displayPattern('marker', 'HP'));
  expect(displayPattern('marker', '')).toBe('');
});

it('round trips literal text and preserves advanced regexes and flags as advanced inputs', () => {
  const text = 'HP + (20) [보너스]';
  expect(readDisplayMatch(displayPattern('text', text), 'g')).toEqual({ mode: 'text', text });
  for (const [pattern, flags] of [
    ['HP: (\\d+)', 'g'],
    ['^start', 'gm'],
    ['word', 'i'],
    ['word', ''],
  ]) {
    expect(readDisplayMatch(pattern, flags)).toEqual({ mode: 'regex', text: pattern });
    expect(displayPattern('regex', pattern)).toBe(pattern);
  }
});
