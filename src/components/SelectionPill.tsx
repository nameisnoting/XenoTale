import type { ComponentProps } from 'react';
import { DeleteAction } from './DeleteAction';
import './SelectionPill.css';

/** Selection and removal are sibling buttons, so removal never selects the item. */
export function SelectionPill({
  name,
  selected,
  onSelect,
  shape = 'tab',
  deletion,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  shape?: 'tab' | 'round';
  deletion?: Omit<ComponentProps<typeof DeleteAction>, 'icon' | 'className' | 'label'>;
}) {
  return (
    <div
      className={`selection-pill selection-pill--${shape}${selected ? ' is-selected' : ''}${deletion ? ' has-delete' : ''}`}
    >
      <button
        className="selection-pill-label"
        data-hover="none"
        aria-pressed={selected}
        onClick={onSelect}
      >
        {name}
      </button>
      {deletion && <DeleteAction {...deletion} icon="close" className="selection-pill-delete" />}
    </div>
  );
}
