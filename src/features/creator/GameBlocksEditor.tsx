import type { Work } from '../../domain/types';
import { id } from '../../domain/types';
import type { GameBlock } from '../../domain/gamePanels';
import { AddButton } from '../../components/AddButton';
import { DisclosureCard } from '../../components/DisclosureCard';
import { DeleteAction } from '../../components/DeleteAction';
import { Field, TextInput, Area } from '../../components/UI';
import { Select } from '../../components/Select';
import { ConditionEditor } from './ConditionEditor';

export function GameBlocksEditor({
  work,
  blocks,
  onChange,
}: {
  work: Work;
  blocks: GameBlock[];
  onChange: (blocks: GameBlock[]) => void;
}) {
  const references = (text: string, readable: boolean) =>
    text.replace(/\{\{([^{}]+)\}\}/g, (token, key) => {
      const fields = work.statuses.filter((s) =>
        readable ? s.id === key : s.name === key || s.id === key,
      );
      return fields.length === 1 ? `{{${readable ? fields[0].name : fields[0].id}}}` : token;
    });
  const patch = (i: number, value: Partial<GameBlock>) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, ...value } : b)));
  return (
    <div className="game-block-editor">
      <h3>게임 화면 · 버튼 연결</h3>
      <p className="muted">
        영역마다 표시 조건을 정하고 버튼에 이벤트를 연결합니다. 선택 표시와 단계 전환은 같은
        상태값을 사용합니다.
      </p>
      {blocks.map((block, i) => (
        <DisclosureCard
          key={block.id}
          className="creator-card"
          title={block.title || `선택 영역 ${i + 1}`}
          expanded={i === 0}
          actions={
            <DeleteAction
              title="선택 영역 삭제"
              needsConfirmation={!!block.buttons.length || !!block.description}
              onDelete={() => onChange(blocks.filter((b) => b.id !== block.id))}
            />
          }
        >
          <Field label="영역 제목">
            <TextInput value={block.title} onChange={(title) => patch(i, { title })} />
          </Field>
          <Field label="영역 설명" hint="{{상태값 이름}}으로 현재 값을 표시할 수 있습니다.">
            <Area
              value={references(block.description, true)}
              onChange={(description) => patch(i, { description: references(description, false) })}
              rows={3}
            />
          </Field>
          <Field label="버튼 배치">
            <Select
              label="버튼 열 수"
              value={String(block.columns)}
              onChange={(value) => patch(i, { columns: Number(value) })}
              options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n}열` }))}
            />
          </Field>
          <Field label="영역 표시 조건" hint="조건이 없으면 항상 표시합니다.">
            <Select
              label="영역 조건 결합"
              value={block.mode}
              onChange={(value) => patch(i, { mode: value as 'all' | 'any' })}
              options={[
                { value: 'all', label: '조건을 모두 충족' },
                { value: 'any', label: '하나 이상 충족' },
              ]}
            />
          </Field>
          {block.conditions.map((condition, c) => (
            <ConditionEditor
              key={condition.id}
              work={work}
              value={condition}
              onChange={(value) =>
                patch(i, { conditions: block.conditions.map((v, j) => (j === c ? value : v)) })
              }
              onDelete={() =>
                patch(i, { conditions: block.conditions.filter((v) => v.id !== condition.id) })
              }
            />
          ))}
          <AddButton
            onClick={() =>
              patch(i, {
                conditions: [
                  ...block.conditions,
                  {
                    id: id(),
                    kind: 'number',
                    ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                    op: 'eq',
                    value: 0,
                  },
                ],
              })
            }
          >
            표시 조건 추가
          </AddButton>
          {block.buttons.map((button, n) => (
            <div className="game-button-editor" key={button.id}>
              <Field label="버튼 이름">
                <TextInput
                  value={button.label}
                  onChange={(label) =>
                    patch(i, {
                      buttons: block.buttons.map((b, j) => (j === n ? { ...b, label } : b)),
                    })
                  }
                />
              </Field>
              <Field label="실행할 이벤트">
                <Select
                  label="버튼에 연결할 이벤트"
                  value={button.actionId}
                  onChange={(actionId) =>
                    patch(i, {
                      buttons: block.buttons.map((b, j) => (j === n ? { ...b, actionId } : b)),
                    })
                  }
                  options={[
                    { value: '', label: '이벤트 선택' },
                    ...(work.actions ?? [])
                      .filter((a) => a.trigger === 'button')
                      .map((a) => ({ value: a.id, label: a.name || '이름 없는 이벤트' })),
                  ]}
                />
              </Field>
              <DeleteAction
                title="화면 버튼 삭제"
                needsConfirmation={!!button.actionId}
                onDelete={() =>
                  patch(i, { buttons: block.buttons.filter((b) => b.id !== button.id) })
                }
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patch(i, { buttons: [...block.buttons, { id: id(), label: '버튼', actionId: '' }] })
            }
          >
            화면 버튼 추가
          </AddButton>
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() =>
          onChange([
            ...blocks,
            {
              id: id(),
              title: '',
              description: '',
              columns: 3,
              mode: 'all',
              conditions: [],
              buttons: [],
            },
          ])
        }
      >
        선택 영역 추가
      </AddButton>
    </div>
  );
}
