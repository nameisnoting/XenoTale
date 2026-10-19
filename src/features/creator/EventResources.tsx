import { useEffect, useRef } from 'react';
import { Button } from '../../components/UI';
import { StatusValuesEditor } from './StatusSection';
import { ItemsSection } from './ItemsSection';
import { StatusPanelsEditor } from './StatusPanelsEditor';
import { EffectsSection } from './ExtraSections';
import type { EventLibrary } from './EventParts';
import type { CreatorPanelState } from './useCreatorPanelState';

export const eventLibraries: { id: EventLibrary; name: string }[] = [
  { id: 'values', name: '상태값' },
  { id: 'items', name: '아이템' },
  { id: 'effects', name: '연출' },
  { id: 'panels', name: '상태창' },
];

/** One editor at the place it was opened; all references still use the shared Work IDs. */
export function EventResourceEditor({
  resourceKind,
  onDone,
  ...state
}: CreatorPanelState & {
  resourceKind: EventLibrary;
  onDone: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const name = eventLibraries.find((entry) => entry.id === resourceKind)!.name;
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    root.current?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <section
      ref={root}
      tabIndex={-1}
      data-event-resource-editor={resourceKind}
      data-event-edit="resource"
      className="event-resource-editor edit-card-typography"
      aria-label={`${name} 편집`}
    >
      <div className="event-resource-heading">
        <h3>{name} 만들기·편집</h3>
        <Button onClick={onDone}>편집 완료</Button>
      </div>
      <p className="muted">
        이 작품에서 함께 쓰는 요소입니다. 변경 내용은 연결된 이벤트·시나리오·관계도에도 반영됩니다.
      </p>
      {resourceKind === 'values' ? (
        <StatusValuesEditor {...state} />
      ) : resourceKind === 'items' ? (
        <ItemsSection {...state} />
      ) : resourceKind === 'effects' ? (
        <EffectsSection {...state} embedded />
      ) : (
        <StatusPanelsEditor {...state} />
      )}
      <div className="event-resource-finish">
        <Button onClick={onDone}>편집 완료</Button>
      </div>
    </section>
  );
}
