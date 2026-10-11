import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { IconButton, Modal } from './UI';
import './MobileSurfaces.css';

export function BottomSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const initialHeight = () => Math.round(window.innerHeight * 0.82);
  const [height, setHeight] = useState(initialHeight);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const clamp = (value: number) => Math.max(120, Math.min(window.innerHeight - 16, value));
  useEffect(() => {
    const resize = () => {
      setViewportHeight(window.innerHeight);
      setHeight((value) => clamp(value));
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return (
    <Modal
      title={title}
      className="bottom-sheet"
      onClose={onClose}
      style={
        {
          height,
          '--sheet-backdrop-opacity': Math.min(0.6, (height / viewportHeight) * 0.65),
        } as CSSProperties
      }
      handle={
        <button
          type="button"
          className="sheet-drag-handle"
          aria-label="대화 메뉴 크기 조절"
          onPointerDown={(event) => {
            drag.current = { y: event.clientY, height };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setHeight(clamp(drag.current.height + drag.current.y - event.clientY));
          }}
          onPointerUp={(event) => {
            const start = drag.current;
            drag.current = null;
            if (!start) return;
            const distance = event.clientY - start.y;
            if (clamp(start.height - distance) < window.innerHeight * 0.35 || distance > 160)
              onClose();
            else if (distance < -48) setHeight(window.innerHeight - 16);
            else if (distance > 48) setHeight(initialHeight());
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              setHeight(event.key === 'ArrowUp' ? window.innerHeight - 16 : initialHeight());
            }
          }}
        >
          <span />
        </button>
      }
    >
      {children}
    </Modal>
  );
}

export function SideDrawer({
  title,
  children,
  onClose,
  headerActions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  headerActions?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const oldInert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      // A form dialog opened from the drawer owns keyboard input until it closes.
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (root) root.inert = oldInert;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="drawer-layer">
      <button className="drawer-scrim" aria-label={`${title} 닫기`} onClick={onClose} />
      <aside ref={ref} className="side-drawer design-ui" aria-label={title}>
        <header>
          <h2>{title}</h2>
          {headerActions}
          <IconButton title="닫기" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function MobilePage({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
    body.current?.scrollTo(0, 0);
  }, [title]);
  return (
    <main className="mobile-chat-page design-ui" aria-label={title}>
      <header>
        <IconButton title="대화방으로 돌아가기" onClick={onBack}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
      </header>
      <div ref={body} className="mobile-page-body">
        {children}
      </div>
    </main>
  );
}
