import { Field, Button } from '../../components/UI';
import { Select } from '../../components/Select';
import { eventOperations, type EventStep } from '../../domain/events';

export function EventAddContent({
  value,
  onChange,
  onStep,
  onCondition,
  onLinks,
}: {
  value: string;
  onChange: (value: string) => void;
  onStep: (kind: EventStep['kind']) => void;
  onCondition: () => void;
  onLinks: () => void;
}) {
  return (
    <div className="event-add-content" data-event-edit="add" tabIndex={-1}>
      <Field label="추가할 내용">
        <Select
          label="이벤트에 추가할 내용"
          value={value}
          onChange={onChange}
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
          if (value === 'condition') onCondition();
          else if (value === 'links') onLinks();
          else onStep(value as EventStep['kind']);
        }}
      >
        {value === 'links' ? '연결 조건 편집' : '선택한 내용 추가'}
      </Button>
    </div>
  );
}
