import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { SortableList } from '../../components/SortableList';
import type { Lore } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, TextInput, Area } from '../../components/UI';
import { KeywordInput } from '../../components/DesignControls';

export function LoreEditor({
  entries,
  onChange,
}: {
  entries: Lore[];
  onChange: (v: Lore[]) => void;
}) {
  return (
    <>
      <SortableList
        items={entries}
        itemId={(entry) => entry.id}
        itemName={(entry) => entry.name || '로어북'}
        onChange={onChange}
      >
        {(l, handle, i) => (
          <DisclosureCard
            className="creator-card"
            expanded
            key={l.id}
            title={l.name || `로어북 ${i + 1}`}
            leading={handle}
            actions={
              <DeleteAction
                title="로어북 삭제"
                name={l.name}
                needsConfirmation={requiresDeleteConfirmation('lore', l)}
                onDelete={() => onChange(entries.filter((x) => x.id !== l.id))}
              />
            }
          >
            <Field label="이름">
              <TextInput
                value={l.name}
                onChange={(name) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, name } : x)))
                }
              />
            </Field>
            <Field label="키워드">
              <KeywordInput
                value={l.keywords}
                onChange={(keywords) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, keywords } : x)))
                }
              />
            </Field>
            <Field label="프롬프트">
              <Area
                value={l.prompt}
                onChange={(prompt) =>
                  onChange(entries.map((x) => (x.id === l.id ? { ...x, prompt } : x)))
                }
              />
            </Field>
          </DisclosureCard>
        )}
      </SortableList>
      <AddButton
        onClick={() =>
          onChange([
            ...entries,
            {
              id: id(),
              name: `로어북 ${entries.length + 1}`,
              defaultName: `로어북 ${entries.length + 1}`,
              keywords: [],
              prompt: '',
            },
          ])
        }
      >
        로어북 추가
      </AddButton>
    </>
  );
}
