import { describe, expect, it } from 'vitest';
import { quality } from './defaults';
import { buildQualityDirectives } from './qualityDirectives';
import { VIEWPOINTS } from './types';

describe('selected quality instructions', () => {
  it('leaves natural style/ratio/pacing/length unconstrained instead of injecting all presets', () => {
    const instructions = buildQualityDirectives(quality);
    expect(instructions.some((text) => /^(STYLE|RATIO|PACING|LENGTH):/.test(text))).toBe(false);
    expect(instructions.every((text) => typeof text === 'string')).toBe(true);
  });
  it.each(['라이트노벨', '판타지', '무협', 'TRPG'])(
    'adds one selected style without changing the chosen viewpoint or pacing (%s)',
    (style) => {
      const instructions = buildQualityDirectives({ ...quality, style });
      expect(instructions.filter((text) => text.startsWith('STYLE:'))).toHaveLength(1);
      expect(instructions.filter((text) => text.startsWith('PACING:'))).toEqual([]);
      expect(instructions.filter((text) => text.startsWith('VIEWPOINT:'))).toEqual(
        buildQualityDirectives(quality).filter((text) => text.startsWith('VIEWPOINT:')),
      );
    },
  );
  it.each(VIEWPOINTS)('keeps player agency in each viewpoint (%s)', (viewpoint) => {
    const instructions = buildQualityDirectives({
      ...quality,
      viewpoint,
      viewpointActorId: 'aria',
      viewpointTargetId: 'user',
    });
    const text = instructions.find((text) => text.startsWith('VIEWPOINT:'))!;
    expect(text).toMatch(/human|player|user/);
    if (viewpoint.startsWith('1인칭')) expect(text).toContain('"aria"');
    if (viewpoint.endsWith('관찰자')) expect(text).toContain('"user"');
  });
  it('keeps missing viewpoint selectors consistent with the creator default player selection', () => {
    const instructions = buildQualityDirectives({ ...quality, viewpoint: '1인칭 관찰자' });
    expect(instructions.find((text) => text.startsWith('VIEWPOINT:'))).toContain(
      'observer ID "user", observing target ID "user"',
    );
  });
  it('ignores unknown imported preset strings without injecting objects or functions', () => {
    expect(
      buildQualityDirectives({
        ...quality,
        style: '__proto__',
        ratio: 'constructor',
        pacing: '未知',
        length: 'toString',
        difficulty: 'constructor',
        viewpoint: 'constructor' as typeof quality.viewpoint,
      }).every(
        (text) =>
          typeof text === 'string' &&
          !/^(STYLE|RATIO|PACING|LENGTH|DIFFICULTY|VIEWPOINT):/.test(text),
      ),
    ).toBe(true);
  });
});
