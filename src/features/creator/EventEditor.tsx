import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { DisclosureCard, CardSection } from '../../components/DisclosureCard';
import { Field, TextInput, Button, IconButton } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { Select } from '../../components/Select';
import { DeleteAction } from '../../components/DeleteAction';
import { AddButton } from '../../components/AddButton';
import { eventOperations, newEventStep, moveEventStep, type EventStep } from '../../domain/events';
import { id } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';
import type { CreatorPanelState } from './useCreatorPanelState';
import {
  EventTriggerEditor,
  EventConditions,
  EventStepEditor,
  type EventLibrary,
} from './EventParts';
import { EventConnections } from './EventConnections';
import { EventGraph } from './EventGraph';
import { EventTest } from './EventTest';

export function EventEditor({
  work,
  action,
  update,
  notify,
  onLibrary,
  onNavigate,
  expanded,
}: {
  action: WorkAction;
  expanded: boolean;
  onLibrary: (tab: EventLibrary) => void;
  onNavigate?: (section: string) => void;
} & Pick<CreatorPanelState, 'work' | 'update' | 'notify'>) {
  const [selected, setSelected] = useState('trigger');
  const change = (patch: Partial<WorkAction>) => {
    if (
      patch.trigger &&
      patch.trigger !== 'button' &&
      (work.effects.some((e) => e.actionIds?.includes(action.id)) ||
        work.statusPanels?.some((p) =>
          p.blocks?.some((b) => b.buttons.some((button) => button.actionId === action.id)),
        ))
    ) {
      notify('화면·연출 버튼에 연결된 이벤트입니다. 버튼 연결을 먼저 해제해 주세요.');
      return;
    }
    update({ actions: work.actions?.map((a) => (a.id === action.id ? { ...a, ...patch } : a)) });
  };
  const stepIndex = selected.startsWith('step:') ? Number(selected.slice(5)) : -1;
  const step = action.steps[stepIndex];
  const view = action.workspace?.view ?? 'blocks';
  const editTrigger = <EventTriggerEditor {...{ work, action, change }} />;
  const editConditions = (
    <EventConditions
      work={work}
      conditions={action.conditions}
      mode={action.mode}
      onChange={(conditions, mode) => change({ conditions, mode })}
    />
  );
  const editLinks = <EventConnections {...{ work, action, update, change, onNavigate }} />;
  const editStep = (index: number) => (
    <EventStepEditor
      work={work}
      step={action.steps[index]}
      onLibrary={onLibrary}
      onChange={(value) => change({ steps: action.steps.map((s, i) => (i === index ? value : s)) })}
      onDelete={() => {
        change({ steps: action.steps.filter((_, i) => i !== index) });
        setSelected('trigger');
      }}
    />
  );
  const reorder = (from: number, to: number) => {
    change({ steps: moveEventStep(action, from, to) });
    setSelected(`step:${to}`);
  };
  const addStep = (kind: EventStep['kind']) => {
    change({ steps: [...action.steps, newEventStep(work, kind)] });
    setSelected(`step:${action.steps.length}`);
  };
  return (
    <DisclosureCard
      className="creator-card event-editor"
      title={action.name || '이름 없는 이벤트'}
      expanded={expanded}
      actions={
        <DeleteAction
          title="이벤트 삭제"
          name={action.name}
          needsConfirmation={!!action.steps.length || !!action.conditions.length}
          onDelete={() => {
            if (
              work.statusPanels?.some((panel) =>
                panel.blocks?.some((block) => block.buttons.some((b) => b.actionId === action.id)),
              ) ||
              work.effects.some((e) => e.actionIds?.includes(action.id))
            ) {
              notify(
                '게임 화면 또는 연출에서 사용하는 이벤트입니다. 버튼 연결을 먼저 해제해 주세요.',
              );
              return;
            }
            update({ actions: work.actions?.filter((a) => a.id !== action.id) });
          }}
        />
      }
    >
      <Field label="이벤트 이름">
        <TextInput value={action.name} onChange={(name) => change({ name })} />
      </Field>
      <Field label="작업 방식">
        <RadioOptions
          value={view === 'nodes' ? '노드형' : '블록형'}
          values={['블록형', '노드형']}
          onChange={(value) =>
            change({
              workspace: { ...action.workspace, view: value === '노드형' ? 'nodes' : 'blocks' },
            })
          }
        />
      </Field>
      <div className="event-editor-tools" role="group" aria-label="공유 요소 만들기">
        <Button onClick={() => onLibrary('values')}>상태값 만들기·편집</Button>
        <Button onClick={() => onLibrary('items')}>아이템 만들기·편집</Button>
        <Button onClick={() => onLibrary('effects')}>연출 만들기·편집</Button>
      </div>
      <Field label="추가할 내용">
        <Select
          label="이벤트에 추가할 내용"
          value=""
          onChange={(kind) => {
            if (kind === 'condition') {
              change({
                conditions: [
                  ...action.conditions,
                  {
                    id: id(),
                    kind: 'number',
                    ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                    op: 'gte',
                    value: 0,
                  },
                ],
              });
              setSelected('conditions');
            } else if (kind === 'links') setSelected('links');
            else if (kind) addStep(kind as EventStep['kind']);
          }}
          options={[
            { value: '', label: '조건이나 실행할 작업을 선택하세요' },
            { value: 'condition', label: '실행 조건' },
            ...eventOperations,
            { value: 'links', label: '시나리오·내면 해금 조건 연결' },
          ]}
        />
      </Field>
      {view === 'nodes' ? (
        <>
          <EventGraph
            {...{ work, action, selected }}
            onSelect={setSelected}
            onConnect={(source, target) => {
              if (source === target) return;
              const to = source < 0 ? 0 : source < target ? source + 1 : source;
              reorder(target, to);
            }}
          />
          <div className="event-node-inspector" aria-label="선택한 노드 편집">
            <h3>
              {selected === 'trigger'
                ? '시작 시점'
                : selected === 'conditions'
                  ? '실행 조건'
                  : selected === 'links'
                    ? '연결된 결과'
                    : `작업 ${stepIndex + 1}`}
            </h3>
            {selected === 'trigger' ? (
              editTrigger
            ) : selected === 'conditions' ? (
              editConditions
            ) : selected === 'links' ? (
              editLinks
            ) : step ? (
              editStep(stepIndex)
            ) : (
              <p className="muted">편집할 노드를 선택하세요.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <CardSection title="시작 시점">{editTrigger}</CardSection>
          <CardSection title="실행 조건">{editConditions}</CardSection>
          <CardSection title="실행할 작업">
            {!action.steps.length && (
              <p className="muted">위의 ‘추가할 내용’에서 상태 변경·아이템·연출 등을 연결하세요.</p>
            )}
            {action.steps.map((_, index) => (
              <DisclosureCard
                key={index}
                className="creator-card event-step"
                expanded
                title={`작업 ${index + 1}`}
                actions={
                  <div className="event-step-order">
                    <IconButton
                      title={`작업 ${index + 1} 위로`}
                      disabled={index === 0}
                      onClick={(event) => {
                        event.preventDefault();
                        reorder(index, index - 1);
                      }}
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      title={`작업 ${index + 1} 아래로`}
                      disabled={index === action.steps.length - 1}
                      onClick={(event) => {
                        event.preventDefault();
                        reorder(index, index + 1);
                      }}
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                  </div>
                }
              >
                {editStep(index)}
              </DisclosureCard>
            ))}
            <AddButton onClick={() => addStep('add')}>작업 추가</AddButton>
          </CardSection>
          {editLinks}
        </>
      )}
      <EventTest {...{ work, action }} />
    </DisclosureCard>
  );
}
