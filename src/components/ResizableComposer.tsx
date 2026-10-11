import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './ResizableComposer.css';
export function ResizableComposer({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const [height, setHeight] = useState<number | undefined>();
  const [max, setMax] = useState(144);
  const min = 144;
  const measure = () => {
    const main = root.current?.closest<HTMLElement>('.chat-main');
    if (!main) return min;
    const header = main.querySelector<HTMLElement>('.chat-header');
    return Math.max(min, main.clientHeight - (header?.offsetHeight ?? 0) - 32);
  };
  useLayoutEffect(() => {
    const update = () => {
      const value = measure();
      setMax(value);
      setHeight((old) => (old === undefined ? old : Math.min(old, value)));
    };
    const observer = new ResizeObserver(update);
    const main = root.current?.closest<HTMLElement>('.chat-main');
    if (main) {
      observer.observe(main);
      const header = main.querySelector('.chat-header');
      if (header) observer.observe(header);
    }
    window.visualViewport?.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  const clamp = (value: number) => Math.max(min, Math.min(measure(), value));
  return (
    <div
      ref={root}
      className="composer resizable-composer"
      data-manual={height !== undefined}
      data-expanded={(height ?? min) > min + 32}
      style={height ? { height } : undefined}
    >
      <div
        className="composer-resize-handle"
        role="separator"
        aria-label="메시지 입력창 크기 조절"
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(height ?? min)}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            y: event.clientY,
            height: root.current?.offsetHeight ?? min,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const value = drag.current;
          if (!value) return;
          const distance = value.y - event.clientY;
          if (Math.abs(distance) > 4) value.moved = true;
          setHeight(clamp(value.height + distance));
        }}
        onPointerUp={(event) => {
          const value = drag.current;
          if (!value) return;
          const distance = value.y - event.clientY;
          if (distance >= 48) setHeight(measure());
          else if (distance <= -48) setHeight(undefined);
          else if (!value.moved) setHeight((height ?? min) > min + 32 ? undefined : measure());
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          setHeight(
            event.key === 'Home'
              ? undefined
              : event.key === 'End'
                ? measure()
                : clamp((height ?? min) + (event.key === 'ArrowUp' ? 16 : -16)),
          );
        }}
      >
        <span aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}
