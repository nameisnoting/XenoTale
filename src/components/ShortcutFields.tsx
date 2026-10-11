import type { Shortcut } from '../domain/types';
import { Area, Field, TextInput } from './UI';
export function ShortcutFields({
  value,
  onChange,
}: {
  value: Shortcut;
  onChange: (value: Shortcut) => void;
}) {
  return (
    <>
      <Field label="이름">
        <div className="shortcut-name-input">
          <span aria-hidden="true">/</span>
          <TextInput
            value={value.name}
            placeholder="단축어를 입력해 주세요"
            onChange={(name) => onChange({ ...value, name })}
          />
        </div>
      </Field>
      <Field label="설명">
        <Area
          value={value.description}
          rows={3}
          placeholder="단축어의 용도에 대해 설명해 주세요"
          onChange={(description) => onChange({ ...value, description })}
        />
      </Field>
      <Field label="프롬프트">
        <Area
          value={value.prompt}
          rows={5}
          placeholder="단축어를 통해 전송할 프롬프트를 입력해 주세요"
          onChange={(prompt) => onChange({ ...value, prompt })}
        />
      </Field>
    </>
  );
}
