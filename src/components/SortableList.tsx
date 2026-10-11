import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { ActionButton } from './UI';
import './SortableList.css';

type Drag = {
  id: string;
  pointer: number;
  start: number;
  y: number;
  moved: boolean;
  target: string;
  after: boolean;
};
export function SortableList<T>({
  items,
  itemId,
  itemName,
  onChange,
  children,
  className = '',
}: {
  items: T[];
  itemId: (item: T) => string;
  itemName: (item: T) => string;
  onChange: (items: T[]) => void;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ items, itemId, onChange });
  latest.current = { items, itemId, onChange };
  const drag = useRef<Drag | null>(null);
  const [indicator, setIndicator] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [active, setActive] = useState(false);
  const targetAt = (state: Drag) => {
    const rows = [
      ...(root.current?.querySelectorAll<HTMLElement>(':scope > .sortable-item') ?? []),
    ];
    const row =
      rows.find((element) => {
        const rect = element.getBoundingClientRect();
        return state.y >= rect.top && state.y <= rect.bottom;
      }) ??
      rows.reduce<HTMLElement | undefined>((best, element) => {
        const distance = (value: HTMLElement) =>
          Math.abs(
            state.y -
              (value.getBoundingClientRect().top + value.getBoundingClientRect().height / 2),
          );
        return !best || distance(element) < distance(best) ? element : best;
      }, undefined);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    state.target = row.dataset.sortId!;
    state.after = state.y > rect.top + rect.height / 2;
    setIndicator({ ...state });
  };
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const scroll = () => {
      const state = drag.current;
      if (!state) return;
      let parent = root.current?.parentElement;
      while (
        parent &&
        !(
          parent.scrollHeight > parent.clientHeight &&
          /auto|scroll/.test(getComputedStyle(parent).overflowY)
        )
      )
        parent = parent.parentElement;
      const rect = parent?.getBoundingClientRect();
      const top = rect?.top ?? 0;
      const bottom = rect?.bottom ?? window.innerHeight;
      const amount = state.y < top + 48 ? -12 : state.y > bottom - 48 ? 12 : 0;
      if (amount && state.moved) {
        if (parent) parent.scrollTop += amount;
        else window.scrollBy(0, amount);
        targetAt(state);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const finish = (cancel = false) => {
    const state = drag.current;
    drag.current = null;
    setActive(false);
    setIndicator(null);
    if (cancel || !state?.moved || state.target === state.id) return;
    const { items, itemId, onChange } = latest.current;
    const moved = items.find((item) => itemId(item) === state.id);
    if (!moved) return;
    const result = items.filter((item) => itemId(item) !== state.id);
    const position = result.findIndex((item) => itemId(item) === state.target);
    if (position < 0) return;
    result.splice(position + Number(state.after), 0, moved);
    if (result.every((item, index) => itemId(item) === itemId(items[index]))) return;
    onChange(result);
    setAnnouncement(
      `${itemName(moved)}: ${result.findIndex((item) => itemId(item) === state.id) + 1}번째로 이동했습니다.`,
    );
  };
  return (
    <div ref={root} className={`sortable-list ${className}`}>
      {items.map((item, index) => {
        const key = itemId(item);
        const name = itemName(item);
        const handle = (
          <ActionButton
            hover="none"
            type="button"
            className="drag-handle"
            aria-label={`${name} 위치 이동`}
            title="드래그 또는 위/아래 방향키로 위치 이동"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: key,
                pointer: event.pointerId,
                start: event.clientY,
                y: event.clientY,
                moved: false,
                target: key,
                after: false,
              };
              setActive(true);
            }}
            onPointerMove={(event) => {
              const state = drag.current;
              if (!state || state.pointer !== event.pointerId) return;
              state.y = event.clientY;
              state.moved ||= Math.abs(state.y - state.start) >= 6;
              if (state.moved) targetAt(state);
            }}
            onPointerUp={() => finish()}
            onPointerCancel={() => finish(true)}
            onLostPointerCapture={() => {
              if (drag.current) finish(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                finish(true);
                return;
              }
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const destination =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : Math.max(
                        0,
                        Math.min(items.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)),
                      );
              if (destination === index) return;
              const result = [...items];
              result.splice(index, 1);
              result.splice(destination, 0, item);
              onChange(result);
              setAnnouncement(`${name}: ${destination + 1}번째로 이동했습니다.`);
            }}
          >
            <GripVertical size={16} aria-hidden="true" />
          </ActionButton>
        );
        return (
          <div
            key={key}
            data-sort-id={key}
            className={`sortable-item ${indicator?.id === key ? 'is-dragging' : ''} ${indicator?.moved && indicator.target === key && indicator.id !== key ? (indicator.after ? 'drop-after' : 'drop-before') : ''}`}
          >
            {children(item, handle, index)}
          </div>
        );
      })}
      <span className="sort-announcement" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
