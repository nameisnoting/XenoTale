import { DeleteAction } from './DeleteAction';
import { CardHeader } from './DisclosureCard';
import { requiresDeleteConfirmation } from '../domain/deletion';
import type { Persona } from '../domain/types';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { ActionButton, Button, useNotify } from './UI';
import { PersonaFields } from './DesignControls';
import './PersonaCard.css';

export function PersonaCard({
  value,
  selected = false,
  onSelect,
  onChange,
  onDelete,
  onCopy,
  readOnly = false,
  expanded = false,
  collapsible = true,
}: {
  value: Persona;
  selected?: boolean;
  onSelect?: () => void;
  onChange?: (patch: Partial<Persona>) => void | Promise<unknown>;
  onDelete?: () => void | Promise<unknown>;
  onCopy?: () => void;
  readOnly?: boolean;
  expanded?: boolean;
  collapsible?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const pending = useRef(0);
  const latest = useRef(value);
  const notify = useNotify();
  latest.current = value;
  useEffect(() => {
    if (!pending.current) setDraft(value);
  }, [value]);
  const edit = (patch: Partial<Persona>) => {
    if (readOnly || !onChange) return;
    // Inputs respond immediately while the shared library is saved asynchronously.
    setDraft((previous) => ({ ...previous, ...patch }));
    pending.current++;
    void Promise.resolve(onChange(patch))
      .catch((error) => {
        setDraft(latest.current);
        notify(error instanceof Error ? error.message : '페르소나를 저장하지 못했습니다.');
      })
      .finally(() => pending.current--);
  };
  const Container = collapsible ? 'details' : 'div';
  return (
    <Container
      className={`persona-card edit-card-typography ${selected ? 'selected' : ''}`}
      {...(collapsible ? { open: expanded } : {})}
    >
      <CardHeader
        collapsible={collapsible}
        title={draft.name || '페르소나'}
        titleClassName="persona-title"
        chevronClassName="persona-chevron"
        leading={
          onSelect && (
            <ActionButton
              hover="none"
              className="persona-selection"
              aria-label={`${draft.name || '페르소나'} 선택`}
              aria-pressed={selected}
              onClick={(e) => {
                e.preventDefault();
                onSelect();
              }}
            >
              {selected && <Check size={12} />}
            </ActionButton>
          )
        }
      >
        {onDelete && (
          <DeleteAction
            title={`${draft.name || '페르소나'} 삭제`}
            name={draft.name}
            needsConfirmation={requiresDeleteConfirmation('persona', draft)}
            onDelete={onDelete}
          />
        )}
      </CardHeader>
      <div className="persona-card-body">
        <PersonaFields value={draft} readOnly={readOnly} onChange={edit} />
        {onCopy && (
          <Button size="small" className="primary full" onClick={onCopy}>
            내 페르소나로 복사
          </Button>
        )}
      </div>
    </Container>
  );
}
