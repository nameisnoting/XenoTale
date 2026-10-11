import { useEffect, useRef, type RefObject } from 'react';

// Both graph canvases prevent browser/page zoom and consume Ctrl + wheel themselves.
export function useCanvasWheel(
  target: RefObject<HTMLElement | SVGElement | null>,
  onZoom: (delta: number, event: WheelEvent) => void,
) {
  const zoom = useRef(onZoom);
  zoom.current = onZoom;
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const wheel = (event: Event) => {
      if (!(event instanceof WheelEvent)) return;
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      zoom.current(event.deltaY * factor, event);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [target]);
}
