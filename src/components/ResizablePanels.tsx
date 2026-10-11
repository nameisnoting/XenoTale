import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import './ResizablePanels.css';

type Side = 'left' | 'right';
type Preferences = Partial<Record<Side, number>>;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Both panels share the spare width equally, so even two maximum widths preserve the center.
export function useResizablePanels({
  layout,
  leftCollapsed,
  rightCollapsed,
}: {
  layout: 'chat' | 'editor';
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [width, setWidth] = useState(window.innerWidth);
  const key = `xenotale.panel-widths.${layout}`;
  const [preferred, setPreferred] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
      return Object.fromEntries(
        ['left', 'right']
          .filter((side) => Number.isFinite(saved?.[side]))
          .map((side) => [side, saved[side]]),
      );
    } catch {
      return {};
    }
  });
  useLayoutEffect(() => {
    const measure = () => {
      setViewport(window.innerWidth);
      setWidth(root.current?.getBoundingClientRect().width ?? window.innerWidth);
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const desktop = viewport > 800;
  const leftMin = layout === 'editor' && viewport < 1200 ? 300 : clamp(viewport * 0.2535, 300, 365);
  const rightMin = clamp(viewport * 0.2528, 280, 364);
  const leftVisible = !leftCollapsed;
  const rightVisible = viewport >= 1200 && !rightCollapsed;
  const baseline = (leftVisible ? leftMin : 74) + (rightVisible ? rightMin : 0);
  const centerMin = Math.min(560, Math.max(0, width - baseline));
  const count = Number(leftVisible) + Number(rightVisible);
  const extra = Math.max(0, width - baseline - centerMin) / Math.max(1, count);
  const bounds = {
    left: { min: leftMin, max: Math.min(520, leftMin + extra) },
    right: { min: rightMin, max: Math.min(520, rightMin + extra) },
  };
  const sizes = {
    left: leftVisible ? clamp(preferred.left ?? leftMin, bounds.left.min, bounds.left.max) : 74,
    right: rightVisible
      ? clamp(preferred.right ?? rightMin, bounds.right.min, bounds.right.max)
      : 0,
  };
  const resize = (side: Side, value: number) => {
    const next = { ...preferred, [side]: clamp(value, bounds[side].min, bounds[side].max) };
    setPreferred(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Resizing also works without storage. */
    }
  };
  return {
    root,
    desktop,
    bounds,
    sizes,
    resize,
    visible: { left: leftVisible, right: rightVisible },
    style: desktop
      ? ({
          gridTemplateColumns: `${sizes.left}px minmax(0, 1fr)${rightVisible ? ` ${sizes.right}px` : ''}`,
        } as CSSProperties)
      : undefined,
  };
}

export function PanelResizeHandles({ panels }: { panels: ReturnType<typeof useResizablePanels> }) {
  if (!panels.desktop) return null;
  return (
    <>
      {(['left', 'right'] as const).map(
        (side) =>
          panels.visible[side] && (
            <PanelResizeHandle
              key={side}
              side={side}
              size={panels.sizes[side]}
              min={panels.bounds[side].min}
              max={panels.bounds[side].max}
              onResize={(value) => panels.resize(side, value)}
            />
          ),
      )}
    </>
  );
}

function PanelResizeHandle({
  side,
  size,
  min,
  max,
  onResize,
}: {
  side: Side;
  size: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const direction = side === 'left' ? 1 : -1;
  return (
    <div
      className={`panel-resize-handle panel-resize-handle--${side} ${dragging ? 'is-dragging' : ''}`}
      style={{ [side]: size }}
      role="separator"
      aria-label={`${side === 'left' ? '왼쪽' : '오른쪽'} 패널 크기 조절`}
      aria-orientation="vertical"
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      title="드래그하여 너비 조절 · 두 번 클릭하면 기본 너비"
      onDoubleClick={() => onResize(min)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, size };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onResize(drag.current.size + direction * (event.clientX - drag.current.x));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        onResize(
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : size + direction * (event.key === 'ArrowRight' ? 16 : -16),
        );
      }}
    />
  );
}
