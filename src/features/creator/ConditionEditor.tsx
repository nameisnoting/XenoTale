import { Select } from '../../components/Select';
import { NumberInput } from '../../components/UI';
import { DeleteAction } from '../../components/DeleteAction';
import { hasText } from '../../domain/deletion';
import type { Condition, Work } from '../../domain/types';
export function ConditionEditor({
  value: c,
  work,
  onChange,
  onDelete,
}: {
  value: Condition;
  work: Work;
  onChange: (v: Condition) => void;
  onDelete: () => void;
}) {
  const refs =
    c.kind === 'number'
      ? work.statuses.filter((s) => s.type === 'number')
      : c.kind === 'choice'
        ? work.statuses.filter((s) => s.type === 'choice')
        : work.items.filter((i) => c.kind !== 'level' || i.enhancement);
  return (
    <div className="condition-row">
      <Select
        label="조건 유형"
        value={c.kind}
        onChange={(kind) =>
          onChange({
            ...c,
            kind: kind as Condition['kind'],
            ref: '',
            value: kind === 'item' ? true : kind === 'choice' ? '' : 0,
            op: ['choice', 'item'].includes(kind) ? 'eq' : 'gte',
          })
        }
        options={[
          { value: 'number', label: '숫자 상태' },
          { value: 'choice', label: '객관식 상태' },
          { value: 'item', label: '아이템 보유' },
          { value: 'quantity', label: '아이템 수량' },
          { value: 'level', label: '강화 단계' },
        ]}
      />
      <Select
        label="조건 대상"
        value={c.ref}
        onChange={(ref) => onChange({ ...c, ref })}
        options={[
          { value: '', label: '선택하세요' },
          ...refs.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      {c.kind === 'item' ? (
        <Select
          label="보유 조건"
          value={String(c.value)}
          onChange={(value) => onChange({ ...c, value: value === 'true' })}
          options={[
            { value: 'true', label: '보유' },
            { value: 'false', label: '미보유' },
          ]}
        />
      ) : c.kind === 'choice' ? (
        <Select
          label="조건 선택지"
          value={String(c.value)}
          onChange={(value) => onChange({ ...c, value })}
          options={[
            { value: '', label: '선택하세요' },
            ...(work.statuses
              .find((s) => s.id === c.ref)
              ?.options.map((value) => ({ value, label: value })) ?? []),
          ]}
        />
      ) : (
        <NumberInput value={Number(c.value)} onChange={(value) => onChange({ ...c, value })} />
      )}
      <Select
        label="조건 비교"
        value={c.op}
        onChange={(op) => onChange({ ...c, op: op as Condition['op'] })}
        options={[
          ...(['number', 'level', 'quantity'].includes(c.kind)
            ? [
                { value: 'gte', label: '이상' },
                { value: 'lte', label: '이하' },
              ]
            : []),
          { value: 'eq', label: '같음' },
          { value: 'ne', label: '다름' },
        ]}
      />
      <DeleteAction
        title="조건 삭제"
        needsConfirmation={hasText(c.ref) || c.value !== 0}
        onDelete={onDelete}
      />
    </div>
  );
}
