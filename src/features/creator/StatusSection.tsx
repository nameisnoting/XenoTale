import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { nextStatusName } from '../../domain/statusTemplate';
import { DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation, hasText } from '../../domain/deletion';
import { Select } from '../../components/Select';
import { useState } from 'react';
import { id } from '../../domain/types';
import { Tabs } from '../../components/Tabs';
import { ActionsSection } from './ActionsSection';
import { StatusPanelsEditor } from './StatusPanelsEditor';
import { Field, TextInput, Area, Segmented, NumberInput } from '../../components/UI';
import { RadioOptions, KeywordInput } from '../../components/DesignControls';
import type { CreatorPanelState } from './useCreatorPanelState';

export function StatusRulesSection(state: CreatorPanelState) {
  const [tab, setTab] = useState<'rules' | 'panels'>('rules');
  const [panelsOpened, setPanelsOpened] = useState(false);
  return (
    <>
      <h2>상태 규칙</h2>
      <Tabs
        label="상태 규칙 설정"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === 'panels') setPanelsOpened(true);
        }}
        items={[
          { id: 'rules', label: '변경 규칙' },
          { id: 'panels', label: '표시할 상태창' },
        ]}
      />
      <div
        className="status-rule-panel"
        role="tabpanel"
        aria-label="변경 규칙"
        hidden={tab !== 'rules'}
      >
        <ActionsSection {...state} />
      </div>
      <div
        className="status-rule-panel"
        role="tabpanel"
        aria-label="표시할 상태창"
        hidden={tab !== 'panels'}
      >
        {panelsOpened && <StatusPanelsEditor {...state} />}
      </div>
    </>
  );
}

export function StatusSection({
  work,
  notify,
  updateStatuses,
  changeStatus,
}: Pick<CreatorPanelState, 'work' | 'notify' | 'updateStatuses' | 'changeStatus'>) {
  return (
    <>
      <h2>상태값</h2>
      <p className="muted">
        HP·호감도 같은 값을 만듭니다. 프롬프트와 레벨 구간 설명은 AI가 상황을 판단할 때 읽는
        지침입니다. 만든 값은 상태 규칙·시나리오·아이템·관계도에서 선택해 연결할 수 있습니다.
      </p>
      {work.statuses.map((s, i) => (
        <DisclosureCard
          className="creator-card"
          expanded
          key={s.id}
          title={s.name || `상태값 ${i + 1}`}
          actions={
            <DeleteAction
              title="상태값 삭제"
              name={s.name}
              needsConfirmation={requiresDeleteConfirmation('status', s)}
              onDelete={() => {
                const refs =
                  work.items.some(
                    (it) => it.enhancement?.currency === s.id || it.enhancement?.target === s.id,
                  ) ||
                  work.chapters.some((c) => c.conditions.some((k) => k.ref === s.id)) ||
                  work.innerUnlock?.conditions.some((k) => k.ref === s.id) ||
                  work.actions?.some(
                    (a) =>
                      a.conditions.some((k) => k.ref === s.id) ||
                      a.steps.some(
                        (step) => step.target === s.id || step.value.includes(`[${s.id}]`),
                      ),
                  );
                if (refs) {
                  notify('아이템·시나리오·변경 규칙에서 참조 중입니다. 연결을 먼저 해제해 주세요.');
                  return;
                }
                updateStatuses(work.statuses.filter((x) => x.id !== s.id));
              }}
            />
          }
        >
          <Field label="이름">
            <TextInput value={s.name} onChange={(name) => changeStatus(i, { name })} />
          </Field>
          <Field label="유형">
            <Segmented
              value={{ number: '숫자', text: '문자(주관식)', choice: '문자(객관식)' }[s.type]}
              values={['숫자', '문자(주관식)', '문자(객관식)']}
              onChange={(v) =>
                changeStatus(i, {
                  type: v === '숫자' ? 'number' : v === '문자(주관식)' ? 'text' : 'choice',
                  initial: v === '숫자' ? 0 : '',
                })
              }
            />
          </Field>
          {s.type === 'number' ? (
            <>
              <div className="form-row">
                <Field label="최솟값">
                  <NumberInput value={s.min} onChange={(min) => changeStatus(i, { min })} />
                </Field>
                <Field label="최댓값">
                  <NumberInput value={s.max} onChange={(max) => changeStatus(i, { max })} />
                </Field>
              </div>
              <Field label="표기 방식">
                <RadioOptions
                  value={s.displayMax ? '현재값 / 최댓값' : '현재값'}
                  values={['현재값', '현재값 / 최댓값']}
                  onChange={(v) => changeStatus(i, { displayMax: v === '현재값 / 최댓값' })}
                />
              </Field>
              <Field label="초기값">
                <NumberInput
                  value={Number(s.initial)}
                  onChange={(initial) => changeStatus(i, { initial })}
                />
              </Field>
              <Field label="단위">
                <TextInput value={s.unit} onChange={(unit) => changeStatus(i, { unit })} />
              </Field>
            </>
          ) : s.type === 'choice' ? (
            <>
              <Field label="선택지">
                <KeywordInput
                  label="선택지"
                  value={s.options}
                  onChange={(options) => changeStatus(i, { options })}
                />
              </Field>
              <Field label="초기값">
                <Select
                  label="초기값"
                  value={String(s.initial)}
                  onChange={(initial) => changeStatus(i, { initial })}
                  options={[
                    { value: '', label: '선택하세요' },
                    ...s.options.map((option) => ({ value: option, label: option })),
                  ]}
                />
              </Field>
            </>
          ) : (
            <Field label="초기값">
              <TextInput
                value={String(s.initial)}
                onChange={(initial) => changeStatus(i, { initial })}
              />
            </Field>
          )}
          <Field label="프롬프트">
            <Area
              value={s.prompt}
              onChange={(prompt) => changeStatus(i, { prompt })}
              placeholder="상태 설명과 증감 조건을 입력하세요."
            />
          </Field>
          {s.type === 'number' && (
            <div className="status-levels">
              <h4>레벨 구간</h4>
              {(s.levels ?? []).map((level, n) => (
                <div className="status-level" key={n}>
                  <div className="form-row">
                    <Field label="구간 최솟값">
                      <NumberInput
                        value={level.min}
                        onChange={(min) =>
                          changeStatus(i, {
                            levels: s.levels!.map((l, j) => (j === n ? { ...l, min } : l)),
                          })
                        }
                      />
                    </Field>
                    <Field label="구간 최댓값">
                      <NumberInput
                        value={level.max}
                        onChange={(max) =>
                          changeStatus(i, {
                            levels: s.levels!.map((l, j) => (j === n ? { ...l, max } : l)),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Area
                    value={level.prompt}
                    onChange={(prompt) =>
                      changeStatus(i, {
                        levels: s.levels!.map((l, j) => (j === n ? { ...l, prompt } : l)),
                      })
                    }
                    placeholder="설정한 구간의 특징을 정의해 주세요."
                  />
                  <DeleteAction
                    title="구간 삭제"
                    label="구간 삭제"
                    className="button--danger"
                    needsConfirmation={
                      hasText(level.prompt) || level.min !== s.min || level.max !== s.max
                    }
                    onDelete={() =>
                      changeStatus(i, { levels: s.levels!.filter((_, j) => j !== n) })
                    }
                  />
                </div>
              ))}
              <AddButton
                onClick={() =>
                  changeStatus(i, {
                    levels: [...(s.levels ?? []), { min: s.min, max: s.max, prompt: '' }],
                  })
                }
              >
                레벨 추가
              </AddButton>
            </div>
          )}
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() => {
          const name = nextStatusName(work.statuses);
          updateStatuses([
            ...work.statuses,
            {
              id: id(),
              name,
              defaultName: name,
              type: 'number',
              initial: 0,
              min: 0,
              max: 100,
              unit: '',
              options: [],
              prompt: '',
            },
          ]);
        }}
      >
        상태값 추가
      </AddButton>
    </>
  );
}
