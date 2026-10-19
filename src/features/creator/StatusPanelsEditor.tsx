import { useState } from 'react';
import { Eye } from 'lucide-react';
import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { DisclosureCard } from '../../components/DisclosureCard';
import { SelectionPill } from '../../components/SelectionPill';
import { StatusDisplay } from '../../components/DesignControls';
import { Area, Button, Field, TextInput } from '../../components/UI';
import { initialState } from '../../domain/engine';
import {
  panelStatuses,
  statusPanels,
  statusTemplateExample,
  syncStatusTemplate,
} from '../../domain/statusTemplate';
import { clone, id, type StatusPanel, type Work } from '../../domain/types';
import type { CreatorPanelState } from './useCreatorPanelState';

export function StatusPanelsEditor({ work, update }: Pick<CreatorPanelState, 'work' | 'update'>) {
  const panels = statusPanels(work);
  return (
    <>
      <p className="muted">
        전투·인물 정보처럼 상태창을 여러 개 만들 수 있습니다. 같은 상태값을 여러 창에 표시해도 값은
        하나로 유지됩니다.
      </p>
      {panels.map((panel) => (
        <StatusPanelEditor
          key={panel.id}
          panel={panel}
          work={work}
          onChange={(patch) =>
            update({
              statusPanels: panels.map((p) => (p.id === panel.id ? { ...p, ...patch } : p)),
            })
          }
          onDelete={() => update({ statusPanels: panels.filter((p) => p.id !== panel.id) })}
        />
      ))}
      <AddButton
        onClick={() => {
          let number = 1;
          while (panels.some((p) => p.name === `상태창${number}`)) number++;
          update({
            statusPanels: [
              ...panels,
              { id: id(), name: `상태창${number}`, statusIds: [], template: '' },
            ],
          });
        }}
      >
        상태창 추가
      </AddButton>
    </>
  );
}

function StatusPanelEditor({
  panel,
  work,
  onChange,
  onDelete,
}: {
  panel: StatusPanel;
  work: Work;
  onChange: (patch: Partial<StatusPanel>) => void;
  onDelete: () => void;
}) {
  const [preview, setPreview] = useState<Work | null>(null);
  const selected = panelStatuses(panel, work.statuses);
  const select = (statusIds: string[] | undefined) => {
    onChange({
      statusIds,
      template: syncStatusTemplate(
        panel.template,
        selected,
        panelStatuses({ ...panel, statusIds }, work.statuses),
      ),
    });
  };
  return (
    <DisclosureCard
      title={panel.name || '상태창'}
      className="creator-card status-panel-editor"
      expanded
      actions={
        <DeleteAction
          title="상태창 삭제"
          name={panel.name}
          needsConfirmation={!!panel.template.trim() || !!panel.statusIds?.length}
          onDelete={onDelete}
          description="표시할 상태창만 삭제합니다. 상태값과 변경 규칙은 유지됩니다."
        />
      }
    >
      <Field label="상태창 이름">
        <TextInput value={panel.name} onChange={(name) => onChange({ name })} />
      </Field>
      <Field
        label="표시할 상태값"
        hint="선택한 값으로 기본 문법과 예시를 만듭니다. 직접 작성한 문법은 유지되며 모든 상태값을 참조할 수 있습니다."
      >
        <div className="tab-pills" role="group" aria-label="표시할 상태값">
          <SelectionPill
            name="모두 선택"
            selected={panel.statusIds === undefined}
            onSelect={() => select(undefined)}
          />
          {work.statuses.map((s) => (
            <SelectionPill
              key={s.id}
              name={s.name || '이름 없는 상태값'}
              selected={selected.some((value) => value.id === s.id)}
              onSelect={() =>
                select(
                  selected.some((value) => value.id === s.id)
                    ? selected.filter((value) => value.id !== s.id).map((value) => value.id)
                    : [...selected.map((value) => value.id), s.id],
                )
              }
            />
          ))}
        </div>
      </Field>
      <div className="form-row" role="group" aria-label="상태창 예시">
        <Button
          disabled={!selected.length}
          onClick={() => onChange({ template: statusTemplateExample(selected, 'markdown') })}
        >
          예시 마크다운
        </Button>
        <Button
          disabled={!selected.length}
          onClick={() => onChange({ template: statusTemplateExample(selected, 'html') })}
        >
          예시 html
        </Button>
      </div>
      <Field label="문법 입력" hint="Markdown 또는 HTML. {{상태값 이름}}으로 현재 값을 표시합니다.">
        <Area value={panel.template} onChange={(template) => onChange({ template })} rows={7} />
      </Field>
      <Button
        disabled={!panel.template.trim() && !selected.length}
        onClick={() => setPreview(clone(work))}
      >
        <Eye size={15} />
        미리보기
      </Button>
      {preview && (
        <StatusDisplay
          work={preview}
          runtime={initialState(preview, preview.openings[0].id)}
          panelId={panel.id}
          collapsible={false}
        />
      )}
    </DisclosureCard>
  );
}
