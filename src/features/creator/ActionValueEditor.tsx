import { useState } from 'react';
import type { Work } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';
import { Field, TextInput, NumberInput } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { Select } from '../../components/Select';

export function ActionValueEditor({
  step,
  work,
  onChange,
}: {
  step: WorkAction['steps'][number];
  work: Work;
  onChange: (value: string) => void;
}) {
  const [formulaMode, setFormula] = useState(() => !/^-?\d+(?:\.\d+)?$/.test(step.value));
  const formula = formulaMode || !/^-?\d+(?:\.\d+)?$/.test(step.value);
  if (['background', 'effect'].includes(step.kind)) return null;
  const choice =
    step.kind === 'text'
      ? work.statuses.find((s) => s.id === step.target && s.type === 'choice')
      : undefined;
  if (choice)
    return (
      <Field label="저장할 선택지">
        <Select
          value={step.value}
          onChange={onChange}
          options={[
            { value: '', label: '선택하세요' },
            ...choice.options.map((value) => ({ value, label: value })),
          ]}
        />
      </Field>
    );
  if (['music', 'text', 'relation', 'inner-relation'].includes(step.kind))
    return (
      <Field label={step.kind === 'music' ? '음악 HTTPS 주소 (비우면 끄기)' : '저장할 내용'}>
        <TextInput value={step.value} onChange={onChange} />
      </Field>
    );
  return (
    <>
      <Field label="값을 정하는 방법">
        <RadioOptions
          value={formula ? '계산식 사용' : '숫자 입력'}
          values={['숫자 입력', '계산식 사용']}
          onChange={(value) => {
            setFormula(value === '계산식 사용');
            if (value === '숫자 입력' && !/^-?\d+(?:\.\d+)?$/.test(step.value)) onChange('0');
          }}
        />
      </Field>
      {formula ? (
        <>
          <Field
            label="계산식"
            hint="예: {{HP}} * 0.1 또는 dice(1, 6). 아래 목록에서 사용할 상태값을 넣을 수 있습니다."
          >
            <TextInput
              value={step.value.replace(/\[([^\]]+)\]/g, (token, key) => {
                const field = work.statuses.find((s) => s.id === key);
                return field ? `{{${field.name}}}` : token;
              })}
              onChange={(value) =>
                onChange(
                  value.replace(/\{\{([^{}]+)\}\}|\[([^\]]+)\]/g, (token, name, legacyName) => {
                    const fields = work.statuses.filter(
                      (s) => s.name === (name ?? legacyName) || s.id === (name ?? legacyName),
                    );
                    return fields.length === 1 ? `[${fields[0].id}]` : token;
                  }),
                )
              }
            />
          </Field>
          <Select
            label="계산식에 상태 넣기"
            value=""
            onChange={(value) =>
              value && onChange(step.value === '0' ? `[${value}]` : step.value + ` + [${value}]`)
            }
            options={[
              { value: '', label: '계산식에 넣을 상태값 선택' },
              ...work.statuses
                .filter((s) => s.type === 'number')
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </>
      ) : (
        <Field
          label={
            ['gain', 'consume'].includes(step.kind)
              ? '수량'
              : step.kind === 'set'
                ? '설정할 값'
                : '변경할 값'
          }
          hint={step.kind === 'add' ? '20은 20 증가, -10은 10 감소합니다.' : undefined}
        >
          <NumberInput value={Number(step.value)} onChange={(value) => onChange(String(value))} />
        </Field>
      )}
    </>
  );
}
