import { CardSection } from '../../components/DisclosureCard';
import { Plus } from 'lucide-react';
import { Field, Toggle, Button } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import { RelationGraph, type GraphViewProps } from '../Graphs';
import { ConditionEditor } from './ConditionEditor';
import { relationsEnabled } from '../../domain/workContent';
import { id, type Work } from '../../domain/types';

export function RelationsSection({
  work,
  onChange,
  relationView,
}: {
  work: Work;
  onChange: (w: Work) => void;
  relationView?: GraphViewProps;
}) {
  const enabled = relationsEnabled(work),
    unlock = work.innerUnlock ?? { mode: 'all' as const, conditions: [] };
  return (
    <>
      <div className="feature-heading">
        <h2>관계도</h2>
        <Toggle
          label="관계도 사용"
          value={enabled}
          onChange={(relationsEnabled) => onChange({ ...work, relationsEnabled })}
        />
      </div>
      {enabled && (
        <fieldset className="optional-feature">
          <RelationGraph {...relationView} work={work} onChange={onChange} />
          {work.relationSplit && (
            <div className="inner-unlock-settings edit-card-typography">
              <CardSection title="내면 해금 조건">
                <p className="muted">조건이 없으면 처음부터 내면을 확인할 수 있습니다.</p>
                <Field label="조건 충족 방식">
                  <RadioOptions
                    value={unlock.mode === 'all' ? '모두 충족' : '하나라도 충족'}
                    values={['모두 충족', '하나라도 충족']}
                    onChange={(value) =>
                      onChange({
                        ...work,
                        innerUnlock: { ...unlock, mode: value === '모두 충족' ? 'all' : 'any' },
                      })
                    }
                  />
                </Field>
                {unlock.conditions.map((condition, i) => (
                  <ConditionEditor
                    key={condition.id}
                    work={work}
                    value={condition}
                    onChange={(value) =>
                      onChange({
                        ...work,
                        innerUnlock: {
                          ...unlock,
                          conditions: unlock.conditions.map((c, j) => (j === i ? value : c)),
                        },
                      })
                    }
                    onDelete={() =>
                      onChange({
                        ...work,
                        innerUnlock: {
                          ...unlock,
                          conditions: unlock.conditions.filter((c) => c.id !== condition.id),
                        },
                      })
                    }
                  />
                ))}
                <Button
                  onClick={() =>
                    onChange({
                      ...work,
                      innerUnlock: {
                        ...unlock,
                        conditions: [
                          ...unlock.conditions,
                          {
                            id: id(),
                            kind: 'item',
                            ref: work.items[0]?.id ?? '',
                            op: 'eq',
                            value: true,
                          },
                        ],
                      },
                    })
                  }
                >
                  <Plus size={15} />
                  조건 추가
                </Button>
              </CardSection>
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}
