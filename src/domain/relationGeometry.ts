type Point = { x: number; y: number };
export const RELATION_LABEL_HEIGHT = 32;
export function relationLabelWidth(label: string) {
  // Compact 12px text, 6px horizontal padding and a 1px border on each side.
  const textWidth = [...(label || '관계 입력')].reduce(
    (width, char) => width + (/\s/u.test(char) ? 4 : /[\u0000-\u007f]/u.test(char) ? 7 : 12),
    0,
  );
  return Math.max(28, Math.min(240, Math.ceil(textWidth) + 14));
}

// Reserve the label's projected width along the perpendicular axis, so reverse
// directions stay apart even for vertical/diagonal nodes or long relationship names.
export function relationGeometry(
  a: Point,
  b: Point,
  width: number,
  reverseWidth?: number,
  nodes: Point[] = [],
  placedLabels: (Point & { width: number })[] = [],
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const ux = length ? dx / length : 1,
    uy = length ? dy / length : 0;
  const nx = -uy,
    ny = ux;
  const offset =
    reverseWidth === undefined
      ? 0
      : (Math.abs(nx) * Math.max(width, reverseWidth)) / 2 +
        (Math.abs(ny) * RELATION_LABEL_HEIGHT) / 2 +
        12;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const label = { x: middle.x + nx * offset, y: middle.y + ny * offset };
  const clear = (p: Point) =>
    nodes.every(
      (node) =>
        Math.abs(p.x - node.x) >= width / 2 + 40 ||
        p.y + RELATION_LABEL_HEIGHT / 2 <= node.y - 36 ||
        p.y - RELATION_LABEL_HEIGHT / 2 >= node.y + 72,
    );
  if (!clear(label)) {
    // Try moving along the connection first, retaining the separation from its
    // reverse direction. If crowded, move further out on the same side.
    const shifts = [-0.15, 0.15, -0.3, 0.3].map((fraction) => fraction * Math.min(length, 400));
    const candidate = shifts
      .map((shift) => ({ x: label.x + ux * shift, y: label.y + uy * shift }))
      .find(clear);
    if (candidate) Object.assign(label, candidate);
    else {
      for (let extra = 24; extra <= 480; extra += 24) {
        const p = { x: middle.x + nx * (offset + extra), y: middle.y + ny * (offset + extra) };
        if (clear(p)) {
          Object.assign(label, p);
          break;
        }
      }
    }
  }
  const control = { x: label.x * 2 - middle.x, y: label.y * 2 - middle.y };
  const anchor = (node: Point, radius: number) => {
    const x = control.x - node.x,
      y = control.y - node.y;
    const distance = Math.hypot(x, y) || 1;
    return { x: node.x + (x / distance) * radius, y: node.y + (y / distance) * radius };
  };
  const start = anchor(a, 35),
    end = anchor(b, 37);
  // Keep the label on the curve after clipping endpoints outside the avatars.
  control.x = label.x * 2 - (start.x + end.x) / 2;
  control.y = label.y * 2 - (start.y + end.y) / 2;
  // Labels live near the departure, independently of the curve's bend. Keep the
  // existing route stable and leave room for avatars and their names.
  const at = (t: number) => ({
    x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
    y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
  });
  const nearSource = at(0.22);
  const labelNodes = [a, b, ...nodes];
  const labelClear = (p: Point) =>
    labelNodes.every(
      (node) =>
        Math.abs(p.x - node.x) >= width / 2 + 40 ||
        p.y + RELATION_LABEL_HEIGHT / 2 <= node.y - 36 ||
        p.y - RELATION_LABEL_HEIGHT / 2 >= node.y + 72,
    ) &&
    placedLabels.every(
      (other) =>
        Math.abs(p.x - other.x) >= (width + other.width) / 2 + 8 ||
        Math.abs(p.y - other.y) >= RELATION_LABEL_HEIGHT + 8,
    );
  let sourceLabel: Point | undefined;
  for (let extra = reverseWidth === undefined ? 0 : 16; extra <= 256 && !sourceLabel; extra += 24) {
    for (const t of [0.22, 0.26, 0.3, 0.34]) {
      const p = at(t);
      const candidate = { x: p.x + nx * extra, y: p.y + ny * extra };
      if (labelClear(candidate)) {
        sourceLabel = candidate;
        break;
      }
    }
  }
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: sourceLabel ?? nearSource,
  };
}
