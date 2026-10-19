import { useState, type Ref } from 'react';
import { Field, Button } from '../../components/UI';
import { Select } from '../../components/Select';
import { eventOperations, type EventStep } from '../../domain/events';

export function EventAddContent({
  ref,
  onStep,
  onCondition,
  onLinks,
}: {
  ref: Ref<HTMLDivElement>;
  onStep: (kind: EventStep['kind']) => void;
  onCondition: () => void;
  onLinks: () => void;
}) {
  const [addition, setAddition] = useState('add');
  return (
    <div ref={ref} className="event-add-content" data-event-edit="add" tabIndex={-1}>
      <Field label="추가할 내용">
        <Select
          label="이벤트에 추가할 내용"
          value={addition}
          onChange={setAddition}
          options={[
            { value: 'condition', label: '실행 조건' },
            ...eventOperations,
            { value: 'links', label: '시나리오·내면 해금 조건 연결' },
          ]}
        />
      </Field>
      <Button
        className="primary"
        onClick={() => {
          if (addition === 'condition') onCondition();
          else if (addition === 'links') onLinks();
          else onStep(addition as EventStep['kind']);
        }}
      >
        {addition === 'links' ? '연결 조건 편집' : '선택한 내용 추가'}
      </Button>
    </div>
  );
}
