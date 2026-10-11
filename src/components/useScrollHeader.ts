import { useEffect, useState, type RefObject } from 'react';
import './ScrollHeader.css';
export function useScrollHeader(scroll: RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let previous = element.scrollTop,
      accumulated = 0,
      direction = 0,
      current = false,
      ignoreUntil = 0,
      intentUntil = 0;
    setHidden(false);
    const ensureVisible = () => {
      if (element.clientHeight === 0) return false;
      if (element.scrollHeight <= element.clientHeight + 1 || element.scrollTop <= 16) {
        current = false;
        accumulated = 0;
        setHidden(false);
        return true;
      }
      return false;
    };
    const intent = () => {
      intentUntil = performance.now() + 1500;
    };
    const pointer = (event: PointerEvent) => {
      if (event.target === element) intent();
    };
    const key = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
        intent();
    };
    const update = () => {
      const top = element.scrollTop,
        delta = top - previous;
      previous = top;
      const nextDirection = Math.sign(delta);
      if (ensureVisible()) return;
      if (performance.now() < ignoreUntil || performance.now() > intentUntil) return;
      if (top <= 16) {
        if (current) {
          current = false;
          setHidden(false);
          ignoreUntil = performance.now() + 220;
        }
        accumulated = 0;
        return;
      }
      if (nextDirection !== direction) accumulated = 0;
      direction = nextDirection;
      accumulated += delta;
      const next = accumulated > 24 && top > 64 ? true : accumulated < -24 ? false : current;
      if (next !== current) {
        current = next;
        setHidden(next);
        accumulated = 0;
        ignoreUntil = performance.now() + 220;
      }
    };
    element.addEventListener('scroll', update, { passive: true });
    element.addEventListener('wheel', intent, { passive: true });
    element.addEventListener('touchmove', intent, { passive: true });
    element.addEventListener('pointerdown', pointer, { passive: true });
    element.addEventListener('keydown', key);
    // Content can shrink after deleting a response or changing an opening.
    // Visibility must recover even when the last user scroll intent has expired.
    const resize = new ResizeObserver(ensureVisible);
    resize.observe(element);
    const content = new MutationObserver(ensureVisible);
    content.observe(element, { childList: true, subtree: true, characterData: true });
    ensureVisible();
    return () => {
      resize.disconnect();
      content.disconnect();
      element.removeEventListener('scroll', update);
      element.removeEventListener('wheel', intent);
      element.removeEventListener('touchmove', intent);
      element.removeEventListener('pointerdown', pointer);
      element.removeEventListener('keydown', key);
    };
  }, [scroll]);
  return hidden;
}
