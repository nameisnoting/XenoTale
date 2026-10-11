import { describe, expect, it } from 'vitest';
import { relationGeometry, relationLabelWidth, RELATION_LABEL_HEIGHT } from './relationGeometry';

describe('reciprocal relationship labels', () => {
  it('sizes short names with 6px padding instead of a 96px minimum', () => {
    expect(relationLabelWidth('친구')).toBe(38);
    expect(relationLabelWidth('A')).toBeLessThan(38);
    expect(relationLabelWidth('')).toBeGreaterThan(38);
    expect(relationLabelWidth('긴 이름'.repeat(100))).toBe(240);
  });
  it('separates labels from the same source without moving their curves', () => {
    const a = { x: 180, y: 200 },
      b = { x: 450, y: 400 },
      c = { x: 150, y: 550 };
    const first = relationGeometry(a, b, 96, 96, [a, b, c]);
    const unoccupied = relationGeometry(a, c, 96, undefined, [a, b, c]);
    const second = relationGeometry(
      a,
      c,
      96,
      undefined,
      [a, b, c],
      [{ ...first.label, width: 96 }],
    );
    expect(second.path).toEqual(unoccupied.path);
    expect(
      Math.abs(first.label.x - second.label.x) >= 104 ||
        Math.abs(first.label.y - second.label.y) >= 40,
    ).toBe(true);
    expect(Math.hypot(second.label.x - a.x, second.label.y - a.y)).toBeLessThan(
      Math.hypot(second.label.x - c.x, second.label.y - c.y),
    );
  });
  it.each([
    [400, 0],
    [0, 400],
    [300, 300],
    [-300, 300],
    [20, 400],
    [400, 20],
  ])('keeps opposite labels separate at direction %s, %s', (x, y) => {
    const a = { x: 100, y: 100 },
      b = { x: 100 + x, y: 100 + y };
    const width = relationLabelWidth('매우 길게 작성한 표면 관계 이름');
    const reverseWidth = relationLabelWidth('친구');
    const forward = relationGeometry(a, b, width, reverseWidth);
    const reverse = relationGeometry(b, a, reverseWidth, width);
    const separated =
      Math.abs(forward.label.x - reverse.label.x) > (width + reverseWidth) / 2 ||
      Math.abs(forward.label.y - reverse.label.y) > RELATION_LABEL_HEIGHT;
    expect(separated).toBe(true);
    expect(forward.path).not.toEqual(reverse.path);
  });
  it('places labels closer to their source and keeps coincident node paths finite', () => {
    const a = { x: 0, y: 0 },
      b = { x: 400, y: 200 };
    const { label } = relationGeometry(a, b, 96);
    expect(Math.hypot(label.x - a.x, label.y - a.y)).toBeLessThan(
      Math.hypot(label.x - b.x, label.y - b.y),
    );
    expect(relationGeometry({ x: 10, y: 10 }, { x: 10, y: 10 }, 96, 96).path).not.toMatch(
      /NaN|Infinity/,
    );
  });
  it('moves long labels away from another avatar without merging reciprocal labels', () => {
    const a = { x: 165, y: 140 },
      b = { x: 165, y: 490 },
      user = { x: 300, y: 330 };
    const forward = relationGeometry(a, b, 132, 240, [a, b, user]);
    const reverse = relationGeometry(b, a, 240, 132, [a, b, user]);
    for (const route of [forward, reverse]) {
      const width = route === forward ? 132 : 240;
      expect(
        Math.abs(route.label.x - user.x) >= width / 2 + 40 ||
          route.label.y + 16 <= user.y - 36 ||
          route.label.y - 16 >= user.y + 56,
      ).toBe(true);
      const source = route === forward ? a : b;
      const target = route === forward ? b : a;
      expect(Math.hypot(route.label.x - source.x, route.label.y - source.y)).toBeLessThan(
        Math.hypot(route.label.x - target.x, route.label.y - target.y),
      );
    }
    expect(Math.abs(forward.label.x - reverse.label.x)).toBeGreaterThan((132 + 240) / 2);
  });
});
