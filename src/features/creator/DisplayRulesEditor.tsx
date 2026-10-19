import { useState } from 'react';
import type { Work } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, Area, TextInput, Toggle } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { AddButton } from '../../components/AddButton';
import { DisclosureCard } from '../../components/DisclosureCard';
import { DeleteAction } from '../../components/DeleteAction';
import { displayRuleProblem } from '../../domain/displayRules';
import { displayPattern, readDisplayMatch, type DisplayMatchMode } from '../../domain/displayMatch';

type DisplayRule = NonNullable<Work['displayRules']>[number];
const matchLabels = { marker: '표식 찾기', text: '문자 찾기', regex: '정규식' } as const;

export function DisplayRulesEditor({
  work,
  onChange,
}: {
  work: Work;
  onChange: (work: Work) => void;
}) {
  const rules = work.displayRules ?? [];
  return (
    <section>
      <p className="muted">
        AI가 출력한 표식이나 문자를 찾아 화면에서 바꿔 보여줍니다. 표식 이름만 입력하면 중괄호와
        정규식은 자동으로 처리합니다. 대화 원문은 유지됩니다.
      </p>
      {rules.map((rule, i) => (
        <DisplayRuleEditor
          key={rule.id}
          rule={rule}
          index={i}
          imported={!!work.risu?.rules.some((r) => r.id === rule.id)}
          onChange={(patch) =>
            onChange({
              ...work,
              displayRules: rules.map((r) => (r.id === rule.id ? { ...r, ...patch } : r)),
            })
          }
          onDelete={() =>
            onChange({ ...work, displayRules: rules.filter((r) => r.id !== rule.id) })
          }
        />
      ))}
      <AddButton
        onClick={() =>
          onChange({
            ...work,
            displayRules: [
              ...rules,
              {
                id: id(),
                name: `자동연출 ${rules.length + 1}`,
                pattern: '',
                flags: 'g',
                replacement: '',
                enabled: false,
              },
            ],
          })
        }
      >
        자동연출 추가
      </AddButton>
    </section>
  );
}

function DisplayRuleEditor({
  rule,
  index,
  imported,
  onChange,
  onDelete,
}: {
  rule: DisplayRule;
  index: number;
  imported: boolean;
  onChange: (patch: Partial<DisplayRule>) => void;
  onDelete: () => void;
}) {
  const inferred = readDisplayMatch(rule.pattern, rule.flags);
  const [choice, setChoice] = useState<DisplayMatchMode | null>(null);
  const mode =
    inferred.mode === 'regex' ? 'regex' : (choice ?? (imported ? 'regex' : inferred.mode));
  const text = mode === 'regex' ? rule.pattern : inferred.text;
  const problem =
    mode !== 'regex' && !rule.pattern
      ? '찾을 표식이나 문자를 입력해 주세요.'
      : displayRuleProblem(rule.pattern, rule.flags);
  return (
    <DisclosureCard
      className="creator-card"
      expanded
      title={rule.name || `자동연출 ${index + 1}`}
      actions={
        <DeleteAction
          title="자동연출 삭제"
          name={rule.name}
          needsConfirmation={!!rule.pattern || !!rule.replacement}
          onDelete={onDelete}
        />
      }
    >
      <Toggle label="사용" value={rule.enabled} onChange={(enabled) => onChange({ enabled })} />
      <Field label="이름">
        <TextInput value={rule.name} onChange={(name) => onChange({ name })} />
      </Field>
      <Field label="무엇을 찾을까요?">
        <RadioOptions
          value={matchLabels[mode]}
          values={Object.values(matchLabels)}
          onChange={(label) => {
            const next = (Object.keys(matchLabels) as DisplayMatchMode[]).find(
              (key) => matchLabels[key] === label,
            )!;
            setChoice(next);
            if (next !== mode)
              onChange({
                pattern: next === 'regex' ? rule.pattern : displayPattern(next, inferred.text),
                flags: next === 'regex' ? rule.flags : 'g',
              });
          }}
        />
      </Field>
      {mode === 'regex' ? (
        <>
          <Field label="찾을 정규식">
            <Area
              rows={2}
              value={rule.pattern}
              onChange={(pattern) => onChange({ pattern })}
              placeholder="예: 체력: ([0-9]+)"
            />
          </Field>
          <Field
            label="옵션"
            hint="g: 일치하는 모든 부분, i: 대소문자 무시, m: 여러 줄, s: 줄바꿈도 포함, u: 유니코드 정규식"
          >
            <TextInput
              value={rule.flags}
              onChange={(flags) => onChange({ flags })}
              placeholder="g, i, m, s, u"
            />
          </Field>
        </>
      ) : (
        <Field
          label={mode === 'marker' ? '찾을 표식' : '찾을 문자'}
          hint={
            mode === 'marker'
              ? `AI가 {{${text || '표식 이름'}}}을 출력하면 적용됩니다. 이름만 입력하세요.`
              : '입력한 문자를 그대로 찾아 모든 일치 부분에 적용합니다.'
          }
        >
          <TextInput
            value={text}
            onChange={(value) => onChange({ pattern: displayPattern(mode, value), flags: 'g' })}
            placeholder={mode === 'marker' ? '예: 웃음' : '예: 체력이 부족합니다'}
          />
        </Field>
      )}
      <Field
        label="무엇으로 보여줄까요?"
        hint={
          mode === 'regex'
            ? '텍스트·Markdown·HTML·SVG. 정규식으로 찾은 값은 $1, $2로 넣을 수 있습니다.'
            : '텍스트·Markdown·HTML·SVG를 입력할 수 있습니다.'
        }
      >
        <Area
          rows={8}
          value={rule.replacement}
          onChange={(replacement) => onChange({ replacement })}
          placeholder="예: ❤️ 회복했습니다!"
        />
      </Field>
      {rule.enabled && problem && (
        <p className="danger-text" role="alert">
          {problem}
        </p>
      )}
    </DisclosureCard>
  );
}
