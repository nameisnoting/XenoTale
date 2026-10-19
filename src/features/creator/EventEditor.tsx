import { useState, type ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { DisclosureCard, CardSection } from '../../components/DisclosureCard';
import { Field, TextInput, Button, IconButton } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { DeleteAction } from '../../components/DeleteAction';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { useEventWorkshop } from './useEventWorkshop';
import { EventAddContent } from './EventAddContent';
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
  renderLibrary,
  onNavigate,
  expanded,
}: {
  action: WorkAction;
  expanded: boolean;
  onLibrary: (library: EventLibrary) => void;
  renderLibrary: (onDone: (library: EventLibrary) => void) => ReactNode;
  onNavigate?: (section: string) => void;
} & Pick<CreatorPanelState, 'work' | 'update' | 'notify'>) {
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
  const [contentKind, setContentKind] = useState('add');
  const workshop = useEventWorkshop({ work, action, change, onLibrary });
  const {
    root,
    selected,
    setSelected,
    selectNode,
    reveal,
    stepIndex,
    step,
    view,
    libraryTarget,
    openLibrary,
    finishLibrary,
    reorder,
    addStep,
    addCondition,
    clearLibrary,
  } = workshop;
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
  const libraryEditor = renderLibrary(finishLibrary);
  const libraryInStep =
    libraryTarget &&
    libraryTarget.index >= 0 &&
    action.steps[libraryTarget.index] &&
    (view === 'blocks' || stepIndex === libraryTarget.index);
  const editStep = (index: number) => (
    <>
      <EventStepEditor
        work={work}
        step={action.steps[index]}
        onLibrary={(library) => openLibrary(library, index)}
        onChange={(value) =>
          change({ steps: action.steps.map((s, i) => (i === index ? value : s)) })
        }
        onDelete={() => {
          change({ steps: action.steps.filter((_, i) => i !== index) });
          setSelected('trigger');
          clearLibrary();
        }}
      />
      {libraryInStep && libraryTarget.index === index && libraryEditor}
    </>
  );
  const addContent = (
    <EventAddContent
      value={contentKind}
      onChange={setContentKind}
      onStep={addStep}
      onCondition={addCondition}
      onLinks={() => {
        setSelected('links');
        reveal(view === 'nodes' ? 'inspector' : 'links');
      }}
    />
  );
  return (
    <div ref={root} className="event-editor-wrap">
      <DisclosureCard
        className="creator-card event-editor"
        title={action.name || '이름 없는 이벤트'}
        expanded={expanded || !!libraryEditor}
        actions={
          <DeleteAction
            title="이벤트 삭제"
            name={action.name}
            needsConfirmation={requiresDeleteConfirmation('event', action)}
            onDelete={() => {
              if (
                work.statusPanels?.some((panel) =>
                  panel.blocks?.some((block) =>
                    block.buttons.some((b) => b.actionId === action.id),
                  ),
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
        <div
          className="event-editor-tools"
          role="group"
          aria-label="공유 요소 만들기"
          data-event-edit="tools"
          tabIndex={-1}
        >
          <Button onClick={() => openLibrary('values')}>상태값 만들기·편집</Button>
          <Button onClick={() => openLibrary('items')}>아이템 만들기·편집</Button>
          <Button onClick={() => openLibrary('effects')}>연출 만들기·편집</Button>
          <Button onClick={() => openLibrary('panels')}>상태창 만들기·편집</Button>
        </div>
        {!libraryInStep && libraryEditor}
        {view === 'nodes' ? (
          <>
            <EventGraph
              {...{ work, action, selected }}
              onSelect={selectNode}
              onMove={reorder}
              addContent={addContent}
              inspector={
                <div
                  className="event-node-inspector"
                  aria-label="선택한 노드 편집"
                  data-event-edit="inspector"
                  tabIndex={-1}
                >
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
              }
            />
          </>
        ) : (
          <>
            <div className="event-component">
              <CardSection title="시작 시점">{editTrigger}</CardSection>
            </div>
            <div className="event-component" data-event-edit="conditions" tabIndex={-1}>
              <CardSection title="실행 조건">{editConditions}</CardSection>
            </div>
            <div className="event-component">
              <CardSection title="실행할 작업">
                {!action.steps.length && (
                  <p className="muted">아래에서 실행할 작업을 선택해 추가하세요.</p>
                )}
                {action.steps.map((_, index) => (
                  <div key={index} data-event-edit={`step:${index}`} tabIndex={-1}>
                    <DisclosureCard
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
                  </div>
                ))}
                {addContent}
              </CardSection>
            </div>
            <div className="event-component" data-event-edit="links" tabIndex={-1}>
              {editLinks}
            </div>
          </>
        )}
        <EventTest {...{ work, action }} />
      </DisclosureCard>
    </div>
  );
}
