import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import './AnchoredPopover.css';
export function AnchoredPopover({
  anchor,
  children,
  className = '',
  label,
  onClose,
  onKeyDown,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  label: string;
  onClose: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!anchor.current || !menu.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 16;
      const topEdge = (viewport?.offsetTop ?? 0) + 16;
      const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 32;
      const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 32;
      const width = Math.min(360, rightEdge - leftEdge);
      const above = Math.max(0, rect.top - 8 - topEdge);
      const below = Math.max(0, bottomEdge - rect.bottom - 8);
      const upwards = above >= 120 || above >= below;
      const maxHeight = Math.min(480, upwards ? above : below);
      const height = Math.min(menu.current.scrollHeight, maxHeight);
      const next = {
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)),
        top: upwards ? Math.max(topEdge, rect.top - 8 - height) : rect.bottom + 8,
        width,
        maxHeight,
      };
      setPosition((previous) =>
        previous &&
        Object.keys(next).every(
          (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        anchor.current?.focus();
      }
    };
    const observer = new ResizeObserver(update);
    if (menu.current) observer.observe(menu.current);
    if (anchor.current) observer.observe(anchor.current);
    update();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={menu}
      className={`anchored-popover ${className}`}
      role="menu"
      aria-label={label}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
