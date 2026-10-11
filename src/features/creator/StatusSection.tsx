import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { nextStatusName, statusTemplateExample } from '../../domain/statusTemplate';
import { DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation, hasText } from '../../domain/deletion';
import { Select } from '../../components/Select';
import { Eye } from 'lucide-react';
import { id, clone } from '../../domain/types';
import { Field, TextInput, Area, Segmented, Button, NumberInput } from '../../components/UI';
import { RadioOptions, KeywordInput, StatusDisplay } from '../../components/DesignControls';
import { initialState } from '../../domain/engine';
import type { CreatorPanelState } from './useCreatorPanelState';

export function StatusSection({
  work,
  statusPreview,
  setStatusPreview,
  notify,
  update,
  updateStatuses,
  changeStatus,
}: Pick<
  CreatorPanelState,
  | 'work'
  | 'statusPreview'
  | 'setStatusPreview'
  | 'notify'
  | 'update'
  | 'updateStatuses'
  | 'changeStatus'
>) {
  return (
    <>
      <h2>상태값 정의</h2>
      <p className="muted">상태값은 대화와 시나리오 조건에 사용됩니다.</p>
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
                  ) || work.chapters.some((c) => c.conditions.some((k) => k.ref === s.id));
                if (refs) {
                  notify('아이템 강화나 챕터 조건에서 참조 중입니다. 연결을 먼저 해제해 주세요.');
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
      <hr />
      <h2>상태창 UI</h2>
      <div className="form-row" role="group" aria-label="상태창 예시">
        <Button
          disabled={!work.statuses.length}
          onClick={() =>
            update({ statusTemplate: statusTemplateExample(work.statuses, 'markdown') })
          }
        >
          예시 마크다운
        </Button>
        <Button
          disabled={!work.statuses.length}
          onClick={() => update({ statusTemplate: statusTemplateExample(work.statuses, 'html') })}
        >
          예시 html
        </Button>
      </div>
      <Field label="문법 입력" hint="Markdown 또는 HTML. {{상태값 이름}}으로 현재 값을 표시합니다.">
        <Area
          value={work.statusTemplate}
          onChange={(statusTemplate) => update({ statusTemplate })}
          rows={7}
        />
      </Field>
      <Button disabled={!work.statusTemplate.trim()} onClick={() => setStatusPreview(clone(work))}>
        <Eye size={15} />
        미리보기
      </Button>
      {statusPreview && (
        <StatusDisplay
          work={statusPreview}
          runtime={initialState(statusPreview, statusPreview.openings[0].id)}
          collapsible={false}
        />
      )}
    </>
  );
}
