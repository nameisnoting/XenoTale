import { useState } from 'react';
import { CreatorTabs, useCreatorTab } from './CreatorTabs';
import { StatusValuesEditor } from './StatusSection';
import { ItemsSection } from './ItemsSection';
import { ActionsSection } from './ActionsSection';
import { StatusPanelsEditor } from './StatusPanelsEditor';
import { EffectsSection } from './ExtraSections';
import type { CreatorPanelState } from './useCreatorPanelState';
import './EventsSection.css';

export function EventsSection(state: CreatorPanelState) {
  const [tab, setTab] = useCreatorTab(state.work.id, 'events', [
    'events',
    'values',
    'items',
    'effects',
    'panels',
  ] as const);
  const [visited, setVisited] = useState(() => new Set([tab]));
  const select = (next: typeof tab) => {
    setTab(next);
    setVisited((previous) => new Set([...previous, next]));
  };
  return (
    <>
      <CreatorTabs
        label="이벤트 제작"
        value={tab}
        scrollable
        onChange={select}
        items={[
          { id: 'events', label: '이벤트' },
          { id: 'values', label: '상태값' },
          { id: 'items', label: '아이템' },
          { id: 'effects', label: '연출' },
          { id: 'panels', label: '상태창' },
        ]}
      />
      <div role="tabpanel" aria-label="이벤트" hidden={tab !== 'events'}>
        {visited.has('events') && <ActionsSection {...state} onOpenLibrary={select} />}
      </div>
      <div role="tabpanel" aria-label="상태값" hidden={tab !== 'values'}>
        {visited.has('values') && <StatusValuesEditor {...state} />}
      </div>
      <div role="tabpanel" aria-label="아이템" hidden={tab !== 'items'}>
        {visited.has('items') && <ItemsSection {...state} />}
      </div>
      <div role="tabpanel" aria-label="연출" hidden={tab !== 'effects'}>
        {visited.has('effects') && <EffectsSection {...state} embedded />}
      </div>
      <div role="tabpanel" aria-label="상태창" hidden={tab !== 'panels'}>
        {visited.has('panels') && <StatusPanelsEditor {...state} />}
      </div>
    </>
  );
}
