import { useEffect, useState } from 'react';
import type { GraphView } from '../features/Graphs';

/** Use a stable, workspace/room-specific key in the owning keyed component. */
export function useGraphView(storageKey: string) {
  const [view, setView] = useState<GraphView>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (
        saved &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y) &&
        Number.isFinite(saved.scale) &&
        saved.scale > 0
      )
        return { x: saved.x, y: saved.y, scale: Math.max(0.3, Math.min(3, saved.scale)) };
    } catch {
      // Invalid or unavailable preferences must not prevent opening the graph.
    }
    return { x: 0, y: 0, scale: 1 };
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(view));
    } catch {
      // Pan and zoom remain usable without preference storage.
    }
  }, [storageKey, view]);
  return [view, setView] as const;
}
