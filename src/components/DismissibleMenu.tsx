import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './RoomListItem.css';

// Trigger and menu share an id, so pressing the trigger toggles only once.
export function DismissibleMenu({
  id,
  onDismiss,
  children,
  label = '작품 메뉴',
}: {
  id: string;
  onDismiss: () => void;
  children: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useLayoutEffect(() => {
    const trigger = document.querySelector<HTMLElement>(`[aria-controls="${id}"]`);
    if (!trigger || !ref.current) return;
    const anchor = trigger.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(innerWidth - box.width - 8, anchor.right - box.width)),
      top:
        anchor.bottom + box.height + 8 <= innerHeight
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - box.height - 4),
    });
    ref.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [id]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (ref.current?.contains(target) || target.closest(`[aria-controls="${id}"]`)) return;
      dismiss.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismiss.current();
        document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    const close = () => dismiss.current();
    const scroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [id]);
  return createPortal(
    <div
      ref={ref}
      id={id}
      className="room-action-menu"
      style={position}
      role="menu"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[
          (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
