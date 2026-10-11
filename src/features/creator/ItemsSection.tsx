import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { CardSection, DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { Select } from '../../components/Select';
import type { StatusDef, Item } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, TextInput, Area, ImageUpload, NumberInput } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import type { CreatorPanelState } from './useCreatorPanelState';

export function ItemsSection({
  work,
  notify,
  update,
  changeItem,
}: Pick<CreatorPanelState, 'work' | 'notify' | 'update' | 'changeItem'>) {
  return (
    <>
      <h2>아이템 설정</h2>
      {work.items.map((item, i) => (
        <DisclosureCard
          className="creator-card"
          expanded
          key={item.id}
          title={item.name || `아이템 ${i + 1}`}
          actions={
            <DeleteAction
              title="아이템 삭제"
              name={item.name}
              needsConfirmation={requiresDeleteConfirmation('item', item)}
              onDelete={() => {
                if (work.chapters.some((c) => c.conditions.some((k) => k.ref === item.id))) {
                  notify('챕터 조건의 참조를 먼저 해제해 주세요.');
                  return;
                }
                update({ items: work.items.filter((x) => x.id !== item.id) });
              }}
            />
          }
        >
          <div className="basic-info">
            <Field label="이미지" size="small">
              <ImageUpload value={item.image} onChange={(image) => changeItem(i, { image })} />
            </Field>
            <div>
              <Field label="이름">
                <TextInput value={item.name} onChange={(name) => changeItem(i, { name })} />
              </Field>
              <Field label="초기 상태">
                <RadioOptions
                  value={item.owned ? '소지' : '미소지'}
                  values={['소지', '미소지']}
                  onChange={(v) => changeItem(i, { owned: v === '소지' })}
                />
              </Field>
              <Field label="유형">
                <RadioOptions
                  value={item.enhancement ? '강화 가능' : '일반'}
                  values={['일반', '강화 가능']}
                  onChange={(v) =>
                    changeItem(i, {
                      enhancement:
                        v === '일반'
                          ? null
                          : {
                              currency: '',
                              target: '',
                              costBase: 10,
                              costStep: 10,
                              gainBase: 10,
                              gainStep: 10,
                              probabilities: [
                                1, 1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1,
                                0.08, 0.05, 0.03, 0.02, 0.01, 0.005,
                              ],
                              keepWeight: 7,
                              resetWeight: 3,
                            },
                    })
                  }
                />
              </Field>
            </div>
          </div>
          <Field label="프롬프트">
            <Area
              value={item.prompt}
              onChange={(prompt) => changeItem(i, { prompt })}
              placeholder="아이템 설명과 획득·유실 조건을 입력하세요."
            />
          </Field>
          {item.enhancement && (
            <EnhancementEditor
              value={item.enhancement}
              statuses={work.statuses}
              onChange={(enhancement) => changeItem(i, { enhancement })}
            />
          )}
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() =>
          update({
            items: [
              ...work.items,
              { id: id(), name: '', image: '', owned: false, prompt: '', enhancement: null },
            ],
          })
        }
      >
        아이템 추가
      </AddButton>
    </>
  );
}
function EnhancementEditor({
  value,
  statuses,
  onChange,
}: {
  value: NonNullable<Item['enhancement']>;
  statuses: StatusDef[];
  onChange: (v: NonNullable<Item['enhancement']>) => void;
}) {
  return (
    <div className="enhancement-editor">
      <CardSection title="강화 설정">
        <div className="form-row">
          {(['currency', 'target'] as const).map((key, i) => (
            <Field key={key} label={i === 0 ? '소모할 상태값' : '강화할 상태값'}>
              <Select
                label={i === 0 ? '소모할 상태값' : '강화할 상태값'}
                value={value[key]}
                onChange={(next) => onChange({ ...value, [key]: next })}
                options={[
                  { value: '', label: '선택하세요' },
                  ...statuses
                    .filter((s) => s.type === 'number')
                    .map((s) => ({ value: s.id, label: s.name || '이름 없음' })),
                ]}
              />
            </Field>
          ))}
        </div>
        <div className="form-row">
          {(['costBase', 'costStep', 'gainBase', 'gainStep'] as const).map((key, i) => (
            <Field
              key={key}
              label={['최초 비용', '비용 상승폭', '최초 상승값', '상승값 증가폭'][i]}
            >
              <NumberInput
                value={value[key]}
                min={0}
                onChange={(n) => onChange({ ...value, [key]: n })}
              />
            </Field>
          ))}
        </div>
      </CardSection>
      <CardSection title="강화 성공 확률">
        <div className="probabilities">
          {value.probabilities.map((p, i) => (
            <label key={i}>
              <span className="enhancement-level">+{i + 1}</span>
              <input
                aria-label={`강화 ${i + 1}단계 확률`}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={Number((p * 100).toFixed(2))}
                onChange={(e) =>
                  onChange({
                    ...value,
                    probabilities: value.probabilities.map((v, j) =>
                      j === i ? Math.max(0, Math.min(100, Number(e.target.value))) / 100 : v,
                    ),
                  })
                }
              />
              <span className="enhancement-percent">%</span>
            </label>
          ))}
        </div>
      </CardSection>
      <CardSection title="강화 실패 확률">
        <div className="form-row">
          <Field label="유지 비율">
            <NumberInput
              value={value.keepWeight}
              min={0}
              onChange={(keepWeight) => onChange({ ...value, keepWeight })}
            />
          </Field>
          <Field label="초기화 비율">
            <NumberInput
              value={value.resetWeight}
              min={0}
              onChange={(resetWeight) => onChange({ ...value, resetWeight })}
            />
          </Field>
        </div>
        <p className="enhancement-failure-hint">
          실패 확률은 100% − 성공 확률입니다. 이 확률을 위 유지 : 초기화 비율로 나눕니다.
          <br />
          예: 성공 80%, 유지 7 : 초기화 3 → 유지 14%, 초기화 6%
        </p>
      </CardSection>
    </div>
  );
}
