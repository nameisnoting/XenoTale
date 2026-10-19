import type { WorkAction } from '../../domain/actions';
import { id } from '../../domain/types';
import { Field, TextInput, Area } from '../../components/UI';
import { Select } from '../../components/Select';
import { DisclosureCard } from '../../components/DisclosureCard';
import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { ActionValueEditor } from './ActionValueEditor';
import { ConditionEditor } from './ConditionEditor';
import type { CreatorPanelState } from './useCreatorPanelState';

export function ActionsSection({ work, update }: Pick<CreatorPanelState, 'work' | 'update'>) {
  const actions = work.actions ?? [];
  const change = (i: number, patch: Partial<WorkAction>) =>
    update({ actions: actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <>
      <p className="muted">
        상태값의 변경 조건을 상세하게 규정합니다. 규정하지 않으면 프롬프트에 따라 AI가 직접 증감을
        판단합니다.
      </p>
      {actions.map((action, i) => (
        <DisclosureCard
          key={action.id}
          expanded
          className="creator-card"
          title={`{{${action.name || `규칙${i + 1}`}}}`}
          actions={
            <DeleteAction
              title="규칙 삭제"
              name={action.name}
              needsConfirmation={!!action.steps.length || !!action.conditions.length}
              onDelete={() => update({ actions: actions.filter((a) => a.id !== action.id) })}
            />
          }
        >
          <Field label="규칙 이름">
            <TextInput value={action.name} onChange={(name) => change(i, { name })} />
          </Field>
          <Field label="언제">
            <Select
              label="규칙 실행 시점"
              value={action.trigger}
              onChange={(trigger) => change(i, { trigger: trigger as WorkAction['trigger'] })}
              options={[
                { value: 'button', label: '플레이어가 버튼을 누르면' },
                { value: 'after-response', label: 'AI 응답이 완료되면' },
              ]}
            />
          </Field>
          {action.trigger === 'button' && (
            <p className="muted rule-button-hint">
              대화 입력창 위에 ‘{action.name || '규칙'}’ 버튼이 자동으로 표시됩니다. 버튼을 누르면
              아래 조건을 확인한 뒤 작업을 실행합니다. 대화 테스트에서도 사용할 수 있습니다.
            </p>
          )}
          <Field label="실행 조건">
            <Select
              label="규칙 조건 결합"
              value={action.mode}
              onChange={(mode) => change(i, { mode: mode as 'all' | 'any' })}
              options={[
                { value: 'all', label: '조건을 모두 충족' },
                { value: 'any', label: '하나 이상 충족' },
              ]}
            />
          </Field>
          {action.conditions.map((condition, c) => (
            <ConditionEditor
              key={condition.id}
              value={condition}
              work={work}
              onChange={(value) =>
                change(i, { conditions: action.conditions.map((x, j) => (j === c ? value : x)) })
              }
              onDelete={() =>
                change(i, { conditions: action.conditions.filter((x) => x.id !== condition.id) })
              }
            />
          ))}
          <AddButton
            onClick={() =>
              change(i, {
                conditions: [
                  ...action.conditions,
                  { id: id(), kind: 'number', ref: '', op: 'gte', value: 0 },
                ],
              })
            }
          >
            조건 추가
          </AddButton>
          <h3>실행할 작업</h3>
          {action.steps.map((step, s) => {
            const patch = (value: Partial<typeof step>) =>
              change(i, { steps: action.steps.map((x, j) => (j === s ? { ...x, ...value } : x)) });
            const refs =
              step.kind === 'effect'
                ? work.effects
                : ['gain', 'consume'].includes(step.kind)
                  ? work.items
                  : step.kind === 'background'
                    ? (work.media.assets ?? [])
                    : work.statuses.filter((x) =>
                        step.kind === 'text' ? x.type !== 'number' : x.type === 'number',
                      );
            return (
              <DisclosureCard
                title={`작업 ${s + 1}`}
                className="creator-card"
                expanded
                key={s}
                actions={
                  <DeleteAction
                    title="작업 삭제"
                    needsConfirmation={false}
                    onDelete={() => change(i, { steps: action.steps.filter((_, j) => j !== s) })}
                  />
                }
              >
                <Field label={`작업 ${s + 1}`}>
                  <Select
                    label="작업 종류"
                    value={step.kind}
                    onChange={(kind) =>
                      patch({
                        kind: kind as typeof step.kind,
                        target: '',
                        value: ['gain', 'consume'].includes(kind)
                          ? '1'
                          : kind === 'text' || kind === 'music' || kind === 'background'
                            ? ''
                            : '0',
                      })
                    }
                    options={[
                      { value: 'add', label: '숫자 상태 증감' },
                      { value: 'set', label: '숫자 상태 설정' },
                      { value: 'text', label: '문자·객관식 상태 설정' },
                      { value: 'gain', label: '아이템 획득' },
                      { value: 'consume', label: '아이템 소비' },
                      { value: 'background', label: '배경 이미지 변경' },
                      { value: 'music', label: '음악 변경' },
                      { value: 'effect', label: '연출 보기 버튼 추가' },
                    ]}
                  />
                </Field>
                {step.kind !== 'music' && (
                  <Field label="대상">
                    <Select
                      label="작업 대상"
                      value={step.kind === 'background' ? step.value : step.target}
                      onChange={(target) =>
                        patch(step.kind === 'background' ? { value: target } : { target })
                      }
                      options={[
                        { value: '', label: '선택하세요' },
                        ...refs.map((x) => ({ value: x.id, label: x.name })),
                      ]}
                    />
                  </Field>
                )}
                <ActionValueEditor
                  key={step.kind}
                  step={step}
                  work={work}
                  onChange={(value) => patch({ value })}
                />
              </DisclosureCard>
            );
          })}
          <AddButton
            onClick={() =>
              change(i, {
                steps: [
                  ...action.steps,
                  {
                    kind: 'add',
                    target: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                    value: '0',
                  },
                ],
              })
            }
          >
            작업 추가
          </AddButton>
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() => {
          let number = 1;
          while (actions.some((action) => action.name === `규칙${number}`)) number++;
          update({
            actions: [
              ...actions,
              {
                id: id(),
                name: `규칙${number}`,
                trigger: 'button',
                mode: 'all',
                conditions: [],
                steps: [],
              },
            ],
          });
        }}
      >
        규칙 추가
      </AddButton>
      <DisclosureCard title="계산식 도움말">
        <p className="muted">
          계산식: + − * / %, 괄호, min·max·floor·ceil·abs를 사용할 수 있습니다. dice(1, 20)은 20면
          주사위 1개입니다. 작업은 위에서 아래로 실행합니다.
        </p>
      </DisclosureCard>
      {work.risu && (
        <DisclosureCard className="creator-card" title="가져온 Risu 실행 설정 (고급)">
          <p className="muted">
            원본 계산과 버튼 처리를 보관합니다. 화면 정규식은 연출의 자동연출에서 수정할 수
            있습니다. 스크립트는 격리 실행기에서 동작합니다.
          </p>
          {work.risu.scripts.map((script) => (
            <DisclosureCard
              key={script.id}
              className="creator-card"
              title={`${script.name} · Lua 코드`}
            >
              <Area
                rows={12}
                value={script.code}
                onChange={(code) =>
                  update({
                    risu: {
                      ...work.risu!,
                      scripts: work.risu!.scripts.map((s) =>
                        s.id === script.id ? { ...s, code } : s,
                      ),
                    },
                  })
                }
              />
            </DisclosureCard>
          ))}
          <DisclosureCard className="creator-card" title="원본 화면 스타일">
            <Area
              rows={10}
              value={work.risu.styles}
              onChange={(styles) => update({ risu: { ...work.risu!, styles } })}
            />
          </DisclosureCard>
          <DisclosureCard className="creator-card" title="요청·응답 처리 규칙">
            {work.risu.rules
              .filter((r) => r.type !== 'editdisplay')
              .map((rule) => (
                <div key={rule.id}>
                  <h4>{rule.name}</h4>
                  <p className="muted">{rule.type}</p>
                  <Field label="찾을 정규식">
                    <Area
                      rows={2}
                      value={rule.pattern}
                      onChange={(pattern) =>
                        update({
                          risu: {
                            ...work.risu!,
                            rules: work.risu!.rules.map((r) =>
                              r.id === rule.id ? { ...r, pattern } : r,
                            ),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="치환할 내용">
                    <Area
                      rows={2}
                      value={rule.replacement}
                      onChange={(replacement) =>
                        update({
                          risu: {
                            ...work.risu!,
                            rules: work.risu!.rules.map((r) =>
                              r.id === rule.id ? { ...r, replacement } : r,
                            ),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
          </DisclosureCard>
        </DisclosureCard>
      )}
    </>
  );
}
