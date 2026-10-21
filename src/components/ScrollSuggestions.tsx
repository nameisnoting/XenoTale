import { useEffect, useRef, useState, type RefObject } from 'react';
import { SuggestionButtons } from './SuggestionButtons';
import './ScrollSuggestions.css';

// Keep footer choices out of the reading area until the reader reaches the end.
export function ScrollSuggestions({
  scroll,
  choices,
  onSelect,
  followFooterResize,
}: {
  scroll: RefObject<HTMLDivElement | null>;
  choices: string[];
  onSelect: (text: string) => void;
  followFooterResize: RefObject<boolean>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const viewport = scroll.current;
    const tray = root.current;
    if (!viewport || !tray) return;
    let open = false;
    let previousTop = viewport.scrollTop;
    const atEnd = () => viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 8;
    const reveal = () => {
      if (open || !atEnd()) return;
      open = true;
      followFooterResize.current = true;
      previousTop = viewport.scrollTop;
      setExpanded(true);
    };
    const onScroll = () => {
      const top = viewport.scrollTop;
      const movingUp = top < previousTop - 1;
      const movingDown = top > previousTop + 1;
      previousTop = top;
      if (open && movingUp) {
        followFooterResize.current = false;
        open = false;
        setExpanded(false);
      } else if (!open && movingDown) reveal();
    };
    // At the end, a downward wheel gesture can reopen a tray just collapsed by
    // scrolling up, even if the larger viewport no longer has a scroll range.
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) reveal();
    };
    const onKey = (event: KeyboardEvent) => {
      if (['End', 'PageDown', 'ArrowDown', ' '].includes(event.key)) reveal();
    };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if ((event.touches[0]?.clientY ?? touchY) < touchY - 4) reveal();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    viewport.addEventListener('wheel', onWheel, { passive: true });
    viewport.addEventListener('keydown', onKey);
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: true });
    const frame = requestAnimationFrame(reveal);
    return () => {
      cancelAnimationFrame(frame);
      followFooterResize.current = false;
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('keydown', onKey);
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
    };
  }, [scroll, followFooterResize]);
  return (
    <div
      className="scroll-suggestions"
      ref={root}
      data-expanded={expanded}
      inert={!expanded}
      aria-hidden={!expanded}
    >
      <div className="scroll-suggestions-inner">
        <SuggestionButtons choices={choices} onSelect={onSelect} />
      </div>
    </div>
  );
}
