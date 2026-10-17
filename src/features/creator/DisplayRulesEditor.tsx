import { Plus } from 'lucide-react';
import type { Work } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, Area, TextInput, Toggle, Button } from '../../components/UI';
import { DisclosureCard } from '../../components/DisclosureCard';
import { DeleteAction } from '../../components/DeleteAction';
import { displayRuleProblem } from '../../domain/displayRules';

export function DisplayRulesEditor({
  work,
  onChange,
}: {
  work: Work;
  onChange: (work: Work) => void;
}) {
  const rules = work.displayRules ?? [];
  const update = (i: number, patch: Partial<(typeof rules)[number]>) =>
    onChange({ ...work, displayRules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <section>
      <h3>자동연출 · 정규식 표시</h3>
      <p className="muted">
        대화 원문과 AI에게 보내는 내용은 유지하고, 화면에서만 HTML·CSS·SVG로 바꿔 표시합니다.
        지원되는 스크립트는 격리된 화면 안에서 실행됩니다. 앱 저장소와 API 키에는 접근할 수
        없습니다.
      </p>
      {rules.map((rule, i) => (
        <DisclosureCard
          key={rule.id}
          expanded
          className="creator-card"
          title={rule.name || `자동연출 ${i + 1}`}
          actions={
            <DeleteAction
              title="자동연출 삭제"
              name={rule.name}
              needsConfirmation={!!rule.pattern || !!rule.replacement}
              onDelete={() =>
                onChange({ ...work, displayRules: rules.filter((r) => r.id !== rule.id) })
              }
            />
          }
        >
          <Toggle
            label="사용"
            value={rule.enabled}
            onChange={(enabled) => update(i, { enabled })}
          />
          <Field label="이름">
            <TextInput value={rule.name} onChange={(name) => update(i, { name })} />
          </Field>
          <Field label="찾을 정규식">
            <Area
              rows={2}
              value={rule.pattern}
              onChange={(pattern) => update(i, { pattern })}
              placeholder="예: \\[상태창\\]"
            />
          </Field>
          <Field label="옵션">
            <TextInput
              value={rule.flags}
              onChange={(flags) => update(i, { flags })}
              placeholder="g, i, m, s, u"
            />
          </Field>
          <Field label="표시할 내용">
            <Area
              rows={8}
              value={rule.replacement}
              onChange={(replacement) => update(i, { replacement })}
              placeholder="HTML·CSS·SVG 또는 Markdown. 캡처한 값은 $1, $2로 넣을 수 있습니다."
            />
          </Field>
          {rule.enabled && displayRuleProblem(rule.pattern, rule.flags) && (
            <p className="danger-text" role="alert">
              {displayRuleProblem(rule.pattern, rule.flags)}
            </p>
          )}
        </DisclosureCard>
      ))}
      <Button
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
        <Plus size={16} />
        자동연출 추가
      </Button>
    </section>
  );
}
