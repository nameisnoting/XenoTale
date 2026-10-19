import { Select } from '../../components/Select';
import { Field, Button } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { ConditionEditor } from './ConditionEditor';
import { ActionValueEditor } from './ActionValueEditor';
import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { eventOperations, eventTriggers, newEventStep, type EventStep } from '../../domain/events';
import { id, type Work, type Condition } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';

export type EventLibrary = 'values' | 'items' | 'effects' | 'panels';
export function EventTriggerEditor({
  work,
  action,
  change,
}: {
  work: Work;
  action: WorkAction;
  change: (patch: Partial<WorkAction>) => void;
}) {
  const targets = action.trigger === 'item-gained' ? work.items : work.statuses;
  return (
    <>
      <Field label="언제">
        <Select
          label="이벤트 실행 시점"
          value={action.trigger}
          onChange={(trigger) =>
            change({ trigger: trigger as WorkAction['trigger'], triggerRef: '' })
          }
          options={[...eventTriggers]}
        />
      </Field>
      {['item-gained', 'state-changed'].includes(action.trigger) && (
        <Field label={action.trigger === 'item-gained' ? '획득할 아이템' : '변경될 상태값'}>
          <Select
            label="이벤트 시작 대상"
            value={action.triggerRef ?? ''}
            onChange={(triggerRef) => change({ triggerRef })}
            options={[
              { value: '', label: '선택하세요' },
              ...targets.map((target) => ({ value: target.id, label: target.name || '이름 없음' })),
            ]}
          />
          <p className="muted rule-button-hint">
            실제 값이 바뀔 때 실행합니다. 한 번의 입력이나 버튼 실행에서 같은 이벤트는 한 번만
            실행합니다.
          </p>
        </Field>
      )}
      {action.trigger === 'button' && (
        <Field label="실행 버튼 위치">
          <RadioOptions
            value={action.buttonLocation === 'screen' ? '화면 안에서 연결' : '입력창 위에 표시'}
            values={['입력창 위에 표시', '화면 안에서 연결']}
            onChange={(value) =>
              change({ buttonLocation: value === '화면 안에서 연결' ? 'screen' : 'composer' })
            }
          />
          <p className="muted rule-button-hint">
            {action.buttonLocation === 'screen'
              ? '상태창의 게임 화면이나 수동연출 버튼에 이 이벤트를 연결하세요.'
              : `대화 입력창 위에 ‘${action.name || '이벤트'}’ 버튼이 표시됩니다.`}{' '}
            버튼을 누르면 조건을 확인하고 작업을 순서대로 실행합니다.
          </p>
        </Field>
      )}
    </>
  );
}

export function EventConditions({
  work,
  conditions,
  mode,
  onChange,
}: {
  work: Work;
  conditions: Condition[];
  mode: 'all' | 'any';
  onChange: (conditions: Condition[], mode: 'all' | 'any') => void;
}) {
  return (
    <>
      <Field label="조건 충족 방식">
        <RadioOptions
          value={mode === 'all' ? '모두 충족' : '하나라도 충족'}
          values={['모두 충족', '하나라도 충족']}
          onChange={(value) => onChange(conditions, value === '모두 충족' ? 'all' : 'any')}
        />
      </Field>
      {!conditions.length && <p className="muted">조건 없음 · 시작 시점이 되면 실행합니다.</p>}
      {conditions.map((condition, index) => (
        <ConditionEditor
          key={condition.id}
          work={work}
          value={condition}
          onChange={(value) =>
            onChange(
              conditions.map((c, i) => (i === index ? value : c)),
              mode,
            )
          }
          onDelete={() =>
            onChange(
              conditions.filter((_, i) => i !== index),
              mode,
            )
          }
        />
      ))}
      <AddButton
        onClick={() =>
          onChange(
            [
              ...conditions,
              {
                id: id(),
                kind: 'number',
                ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                op: 'gte',
                value: 0,
              },
            ],
            mode,
          )
        }
      >
        조건 추가
      </AddButton>
    </>
  );
}

export function EventStepEditor({
  work,
  step,
  onChange,
  onDelete,
  onLibrary,
}: {
  work: Work;
  step: EventStep;
  onChange: (step: EventStep) => void;
  onDelete: () => void;
  onLibrary: (library: EventLibrary) => void;
}) {
  const relations = ['relation', 'inner-relation'].includes(step.kind);
  const targets =
    step.kind === 'effect'
      ? work.effects
      : relations
        ? work.relations.map((relation) => ({
            id: relation.id,
            name: `${relation.from === 'user' ? '플레이어' : work.characters.find((c) => c.id === relation.from)?.name || '?'} → ${relation.to === 'user' ? '플레이어' : work.characters.find((c) => c.id === relation.to)?.name || '?'}`,
          }))
        : ['gain', 'consume'].includes(step.kind)
          ? work.items
          : step.kind === 'background'
            ? (work.media.assets ?? [])
            : work.statuses.filter((s) =>
                step.kind === 'text' ? s.type !== 'number' : s.type === 'number',
              );
  const library: EventLibrary | null =
    step.kind === 'effect'
      ? 'effects'
      : ['gain', 'consume'].includes(step.kind)
        ? 'items'
        : ['add', 'set', 'text'].includes(step.kind)
          ? 'values'
          : null;
  return (
    <>
      <Field label="작업 종류">
        <Select
          label="작업 종류"
          value={step.kind}
          onChange={(kind) => onChange(newEventStep(work, kind as EventStep['kind']))}
          options={[...eventOperations]}
        />
      </Field>
      {step.kind !== 'music' && (
        <Field label="대상">
          <Select
            label="작업 대상"
            value={step.kind === 'background' ? step.value : step.target}
            onChange={(target) =>
              onChange({
                ...step,
                ...(step.kind === 'background' ? { value: target } : { target }),
              })
            }
            options={[
              { value: '', label: '선택하세요' },
              ...targets.map((target) => ({ value: target.id, label: target.name || '이름 없음' })),
            ]}
          />
        </Field>
      )}
      <ActionValueEditor
        key={step.kind}
        work={work}
        step={step}
        onChange={(value) => onChange({ ...step, value })}
      />
      {step.kind === 'effect' && (
        <p className="muted">
          읽는 흐름을 유지하도록 대화에 연출 보기 버튼을 추가합니다. 플레이어가 누르면 실행합니다.
        </p>
      )}
      {relations && (
        <p className="muted">
          관계도에서 만든 관계의 현재 내용을 변경합니다.
          {step.kind === 'inner-relation' &&
            ' 내면을 보는 조건은 관계도의 내면 해금 조건을 따릅니다.'}
        </p>
      )}
      <div className="event-editor-tools">
        {library && (
          <Button onClick={() => onLibrary(library)}>
            {library === 'values' ? '상태값' : library === 'items' ? '아이템' : '연출'} 만들기·편집
          </Button>
        )}
        <DeleteAction
          title="작업 삭제"
          label="작업 삭제"
          needsConfirmation={false}
          onDelete={onDelete}
        />
      </div>
    </>
  );
}
