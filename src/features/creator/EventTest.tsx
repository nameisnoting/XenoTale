import { useState } from 'react';
import { DisclosureCard } from '../../components/DisclosureCard';
import { Field, NumberInput, TextInput, Button } from '../../components/UI';
import { Select } from '../../components/Select';
import { initialState, availableChapters } from '../../domain/engine';
import { runAction, type WorkAction } from '../../domain/actions';
import { conditionsMet } from '../../domain/conditions';
import type { Work } from '../../domain/types';

export function EventTest({ work, action }: { work: Work; action: WorkAction }) {
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const refs = new Set([
    action.triggerRef,
    ...action.conditions.map((c) => c.ref),
    ...action.steps.map((s) => s.target),
    ...action.steps.flatMap((s) => [...s.value.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])),
  ]);
  return (
    <DisclosureCard title="이벤트 테스트" className="event-test">
      <p className="muted">
        테스트용 초기값으로 조건과 실행 결과를 확인합니다. 실제 작품·대화의 값은 바뀌지 않습니다.
      </p>
      <div className="event-test-inputs">
        {work.statuses
          .filter((s) => refs.has(s.id))
          .map((status) => (
            <Field key={status.id} label={`테스트 ${status.name}`}>
              {status.type === 'number' ? (
                <NumberInput
                  value={Number(values[status.id] ?? status.initial)}
                  min={status.min}
                  max={status.max}
                  onChange={(value) =>
                    setValues({
                      ...values,
                      [status.id]: Math.min(status.max, Math.max(status.min, value)),
                    })
                  }
                />
              ) : status.type === 'choice' ? (
                <Select
                  value={String(values[status.id] ?? status.initial)}
                  onChange={(value) => setValues({ ...values, [status.id]: value })}
                  options={status.options.map((option) => ({ value: option, label: option }))}
                />
              ) : (
                <TextInput
                  value={String(values[status.id] ?? status.initial)}
                  onChange={(value) => setValues({ ...values, [status.id]: value })}
                />
              )}
            </Field>
          ))}
        {work.items
          .filter((item) => refs.has(item.id))
          .map((item) => (
            <Field key={item.id} label={`테스트 ${item.name} 수량`}>
              <NumberInput
                min={0}
                max={1000000}
                value={quantities[item.id] ?? (item.owned ? (item.quantity ?? 1) : 0)}
                onChange={(value) =>
                  setQuantities({
                    ...quantities,
                    [item.id]: Math.max(0, Math.min(1000000, Math.floor(value))),
                  })
                }
              />
            </Field>
          ))}
      </div>
      <Button
        className="primary"
        onClick={() => {
          setError('');
          setResult('');
          try {
            const before = initialState(work, work.openings[0]?.id ?? '');
            for (const status of work.statuses)
              if (Object.hasOwn(values, status.id)) before.status[status.id] = values[status.id];
            for (const item of work.items)
              if (Object.hasOwn(quantities, item.id))
                before.inventory[item.id] = {
                  ...before.inventory[item.id],
                  quantity: quantities[item.id],
                  owned: quantities[item.id] > 0,
                };
            const resolved = runAction(work, before, action);
            const lines = work.statuses
              .filter((s) => resolved.state.status[s.id] !== before.status[s.id])
              .map(
                (s) =>
                  `${s.name}: ${String(before.status[s.id])} → ${String(resolved.state.status[s.id])}`,
              );
            for (const item of work.items) {
              const old = before.inventory[item.id],
                next = resolved.state.inventory[item.id];
              if (old?.quantity !== next?.quantity || old?.owned !== next?.owned)
                lines.push(
                  `${item.name}: ${old.quantity ?? (old.owned ? 1 : 0)} → ${next.quantity ?? (next.owned ? 1 : 0)}개`,
                );
            }
            for (const relation of work.relations) {
              if (before.relationships[relation.id] !== resolved.state.relationships[relation.id])
                lines.push(`관계: ${resolved.state.relationships[relation.id]}`);
              if (
                before.innerRelationships?.[relation.id] !==
                resolved.state.innerRelationships?.[relation.id]
              )
                lines.push(`내면: ${resolved.state.innerRelationships?.[relation.id]}`);
            }
            for (const event of resolved.performed)
              for (const step of event.steps) {
                if (step.kind === 'effect')
                  lines.push(
                    `${work.effects.find((e) => e.id === step.target)?.name || '연출'} 보기 버튼 표시`,
                  );
                if (step.kind === 'music') lines.push(step.value ? '음악 변경' : '음악 끄기');
                if (step.kind === 'background')
                  lines.push(
                    `배경: ${work.media.assets?.find((a) => a.id === step.value)?.name || step.value}`,
                  );
              }
            for (const chapter of availableChapters(work, resolved.state))
              lines.push(`이동 가능: ${chapter.name}`);
            if (
              work.relationsEnabled &&
              work.relationSplit &&
              conditionsMet(
                work,
                resolved.state,
                work.innerUnlock?.conditions ?? [],
                work.innerUnlock?.mode ?? 'all',
              )
            )
              lines.push('관계도 내면 확인 가능');
            if (resolved.performed.length > 1)
              lines.push(
                `연결 실행: ${resolved.performed
                  .slice(1)
                  .map((a) => a.name)
                  .join(', ')}`,
              );
            setResult(
              [`${action.name || '이벤트'} 실행 완료`, ...lines, ...resolved.problems].join('\n'),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        테스트 실행
      </Button>
      {result && (
        <p className="event-test-result" role="status">
          {result}
        </p>
      )}
      {error && (
        <p className="danger-text" role="alert">
          {error}
        </p>
      )}
    </DisclosureCard>
  );
}
