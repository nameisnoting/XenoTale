import { useEffect, useState, type ReactNode } from 'react';
import { ActionsSection } from './ActionsSection';
import { EventResourceEditor, eventLibraries } from './EventResources';
import type { EventLibrary } from './EventParts';
import { Button } from '../../components/UI';
import { statusPanels } from '../../domain/statusTemplate';
import type { CreatorPanelState } from './useCreatorPanelState';
import './EventsSection.css';

export function EventsSection(state: CreatorPanelState) {
  const storageKey = `xenotale.creator-resource.${state.work.id}`;
  const [editing, setEditing] = useState<{ host: string; kind: EventLibrary } | null>(() => {
    try {
      const previous = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (
        previous &&
        eventLibraries.some((entry) => entry.id === previous.kind) &&
        (previous.host === 'work' ||
          state.work.actions?.some((action) => action.id === previous.host))
      )
        return previous;
      const saved = localStorage.getItem(`xenotale.creator-tab.${state.work.id}.events`);
      if (eventLibraries.some((library) => library.id === saved))
        return { host: 'work', kind: saved as EventLibrary };
    } catch {
      /* Optional browser preference. */
    }
    return null;
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(editing));
      localStorage.removeItem(`xenotale.creator-tab.${state.work.id}.events`);
    } catch {
      /* Optional browser preference. */
    }
  }, [editing, storageKey, state.work.id]);
  const open = (kind: EventLibrary, host = 'work') => setEditing({ kind, host });
  const editor = (host: string, onDone?: (kind: EventLibrary) => void): ReactNode =>
    editing?.host === host ? (
      <EventResourceEditor
        key={`${host}.${editing.kind}`}
        {...state}
        resourceKind={editing.kind}
        autoReveal={host === 'work'}
        onDone={() => {
          onDone?.(editing.kind);
          setEditing(null);
        }}
      />
    ) : null;
  const counts = {
    values: state.work.statuses.length,
    items: state.work.items.length,
    effects: state.work.effects.length + (state.work.displayRules?.length ?? 0),
    panels: statusPanels(state.work).length,
  };
  return (
    <>
      <section className="event-resource-shelf" aria-label="작품의 공유 요소">
        <h3>함께 사용할 요소</h3>
        <p className="muted">
          필요한 요소를 여기서 만들거나, 이벤트를 편집하는 중에 바로 추가하세요.
        </p>
        <div className="event-resource-options" role="group" aria-label="요소 만들기·편집">
          {eventLibraries.map((library) => (
            <Button key={library.id} onClick={() => open(library.id)}>
              <span>{library.name}</span>
              <span className="muted">{counts[library.id]}개 · 만들기·편집</span>
            </Button>
          ))}
        </div>
        {editor('work')}
      </section>
      <section aria-label="이벤트" className="event-list">
        <ActionsSection {...state} onOpenLibrary={open} renderLibrary={editor} />
      </section>
    </>
  );
}
