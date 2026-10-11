import { SelectionPill } from '../../components/SelectionPill';
import { SnippetArea } from '../../components/SnippetArea';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { Plus } from 'lucide-react';
import { id } from '../../domain/types';
import { Field, TextInput, Button } from '../../components/UI';
import type { CreatorPanelState } from './useCreatorPanelState';

export function OpeningsSection({
  work,
  selectedOpeningId,
  onOpeningSelect,
  update,
  openingIndex,
  opening,
  changeOpening,
}: Pick<
  CreatorPanelState,
  | 'work'
  | 'selectedOpeningId'
  | 'onOpeningSelect'
  | 'update'
  | 'openingIndex'
  | 'opening'
  | 'changeOpening'
>) {
  return (
    <>
      <h2>도입부</h2>
      <div className="tab-pills">
        {work.openings.map((o, i) => (
          <SelectionPill
            key={o.id}
            name={o.name}
            selected={i === openingIndex}
            onSelect={() => onOpeningSelect(o.id)}
            deletion={
              work.openings.length === 1
                ? undefined
                : {
                    title: '도입부 삭제',
                    ariaLabel: `${o.name} 삭제`,
                    name: o.name,
                    needsConfirmation: requiresDeleteConfirmation('opening', o),
                    disabled: work.chapters.some((c) => c.from === o.id),
                    onDelete: () => {
                      if (work.openings.length === 1 || work.chapters.some((c) => c.from === o.id))
                        return;
                      const openings = work.openings.filter((entry) => entry.id !== o.id);
                      update({ openings });
                      if (o.id === selectedOpeningId) onOpeningSelect(openings[0].id);
                    },
                  }
            }
          />
        ))}
        <Button
          onClick={() => {
            const openingId = id();
            update({
              openings: [
                ...work.openings,
                {
                  id: openingId,
                  name: `도입부 ${work.openings.length + 1}`,
                  defaultName: `도입부 ${work.openings.length + 1}`,
                  body: '',
                  suggestions: ['', '', ''],
                  bgm: '',
                  presence: work.characters.filter((c) => c.role === 'main').map((c) => c.id),
                },
              ],
            });
            onOpeningSelect(openingId);
          }}
        >
          <Plus size={16} />
          추가
        </Button>
      </div>
      <Field label="제목" required>
        <TextInput value={opening.name} onChange={(name) => changeOpening({ name })} />
      </Field>
      <Field label="내용" required>
        <SnippetArea
          value={opening.body}
          onChange={(body) => changeOpening({ body })}
          rows={14}
          snippets={[
            { label: '지문', text: '**', cursorOffset: 1 },
            { label: '{{user}}', text: '{{user}}' },
            ...work.characters.map((c) => ({
              key: c.id,
              label: `@${c.name || '캐릭터'}`,
              text: `@${c.name || '캐릭터'}: `,
            })),
          ]}
        />
      </Field>
      <h3>추천 답변</h3>
      {opening.suggestions.map((s, i) => (
        <input
          key={i}
          aria-label={`추천 답변 ${i + 1}`}
          value={s}
          placeholder="추천 답변을 작성해 주세요"
          onChange={(e) =>
            changeOpening({
              suggestions: opening.suggestions.map((v, j) => (i === j ? e.target.value : v)),
            })
          }
        />
      ))}
      <Field label="BGM" hint="재생 가능한 HTTPS 오디오 주소를 입력해 주세요.">
        <TextInput value={opening.bgm} onChange={(bgm) => changeOpening({ bgm })} />
      </Field>
    </>
  );
}
