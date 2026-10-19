import { DisplayRulesEditor } from './DisplayRulesEditor';
import { AddButton } from '../../components/AddButton';
import { DeleteAction } from '../../components/DeleteAction';
import { insertTextWithUndo } from '../../components/textEditing';
import { DisclosureCard } from '../../components/DisclosureCard';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { ShortcutFields } from '../../components/ShortcutFields';
import { useRef, useState } from 'react';
import { CreatorTabs, useCreatorTab } from './CreatorTabs';
import { Eye } from 'lucide-react';
import type { Work } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, TextInput, Area, Button } from '../../components/UI';
import { effectExamples } from '../effectExamples';
import { PersonaLibrary } from '../Profile';
import type { CreatorPanelState } from './useCreatorPanelState';
import { CodeValidationButton } from '../../components/CodeValidationButton';

export function ShortcutsSection({ work, update }: Pick<CreatorPanelState, 'work' | 'update'>) {
  return (
    <>
      <h2>단축어 설정</h2>
      <p className="muted">/roll은 기본 제공 주사위입니다. 별도의 단축어를 추가할 수 있습니다.</p>
      {work.shortcuts.map((s, i) => (
        <DisclosureCard
          className="creator-card"
          expanded
          key={s.id}
          title={`/${s.name || `단축어 ${i + 1}`}`}
          actions={
            <DeleteAction
              title="단축어 삭제"
              name={s.name}
              needsConfirmation={requiresDeleteConfirmation('shortcut', s)}
              onDelete={() => update({ shortcuts: work.shortcuts.filter((x) => x.id !== s.id) })}
            />
          }
        >
          <ShortcutFields
            value={s}
            onChange={(value) =>
              update({
                shortcuts: work.shortcuts.map((x, j) => (j === i ? value : x)),
              })
            }
          />
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() =>
          update({
            shortcuts: [...work.shortcuts, { id: id(), name: '', description: '', prompt: '' }],
          })
        }
      >
        단축어 추가
      </AddButton>
    </>
  );
}

export function EffectsSection(
  state: Pick<CreatorPanelState, 'work' | 'setEffectPreview' | 'update'>,
) {
  const [tab, setTab] = useCreatorTab(state.work.id, 'effects', ['auto', 'manual'] as const);
  const [manualOpened, setManualOpened] = useState(tab === 'manual');
  return (
    <>
      <CreatorTabs
        label="연출 설정"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === 'manual') setManualOpened(true);
        }}
        items={[
          { id: 'auto', label: '자동연출' },
          { id: 'manual', label: '수동연출' },
        ]}
      />
      <div role="tabpanel" aria-label="자동연출" hidden={tab !== 'auto'}>
        <DisplayRulesEditor
          work={state.work}
          onChange={(work) => state.update({ displayRules: work.displayRules })}
        />
      </div>
      <div role="tabpanel" aria-label="수동연출" hidden={tab !== 'manual'}>
        {manualOpened && <ManualEffectsEditor {...state} />}
      </div>
    </>
  );
}

function ManualEffectsEditor({
  work,
  setEffectPreview,
  update,
}: Pick<CreatorPanelState, 'work' | 'setEffectPreview' | 'update'>) {
  return (
    <>
      <p className="muted">
        AI가 {'{{이름}}'}을 출력하면 보기 버튼이 나타납니다. 사용자가 누르면 화면 전체에서 연출을
        실행합니다. 연출을 추가한 뒤 예시를 선택하고 미리보기로 시작할 수 있습니다.
      </p>
      <DisclosureCard title="코드로 만드는 연출 도움말">
        <p className="muted">
          버튼을 눌러 실행합니다. XenoTale.background('1/2'), XenoTale.music(주소 또는 null),
          XenoTale.ui({'{uiType, theme}'})로 화면·음악을 바꿀 수 있습니다. XenoTale.complete 결과와
          함께 저장됩니다.
        </p>
      </DisclosureCard>
      {work.effects.map((s, i) => (
        <DisclosureCard
          className="creator-card"
          expanded
          key={s.id}
          title={s.name || `연출 ${i + 1}`}
          actions={
            <DeleteAction
              title="연출 삭제"
              name={s.name}
              needsConfirmation={requiresDeleteConfirmation('effect', s)}
              onDelete={() => update({ effects: work.effects.filter((x) => x.id !== s.id) })}
            />
          }
        >
          <Field label="이름">
            <TextInput
              value={s.name}
              onChange={(name) =>
                update({ effects: work.effects.map((x, j) => (j === i ? { ...x, name } : x)) })
              }
            />
          </Field>
          <Field label="발동 상황 프롬프트">
            <Area
              value={s.prompt}
              onChange={(prompt) =>
                update({
                  effects: work.effects.map((x, j) => (j === i ? { ...x, prompt } : x)),
                })
              }
            />
          </Field>
          <EffectCodeEditor
            value={s}
            onChange={(patch) =>
              update({
                effects: work.effects.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              })
            }
          />
          <Field label="외부 리소스 (이미지·음악 주소, 한 줄에 하나)">
            <Area
              rows={2}
              value={(s.resources ?? []).join('\n')}
              onChange={(text) =>
                update({
                  effects: work.effects.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          resources: text
                            .split('\n')
                            .map((url) => url.trim())
                            .filter(Boolean),
                          validation: undefined,
                        }
                      : x,
                  ),
                })
              }
            />
          </Field>
          <div className="form-row code-actions">
            <Button onClick={() => setEffectPreview(s)}>
              <Eye size={15} />
              미리보기
            </Button>
            <CodeValidationButton
              code={s.content}
              resources={s.resources}
              validation={s.validation}
              kind="effect"
              work={work}
              onValidated={(validation) =>
                update({
                  effects: work.effects.map((x, j) => (j === i ? { ...x, validation } : x)),
                })
              }
            />
          </div>
        </DisclosureCard>
      ))}
      <AddButton
        onClick={() =>
          update({
            effects: [...work.effects, { id: id(), name: '', prompt: '', content: '' }],
          })
        }
      >
        연출 추가
      </AddButton>
    </>
  );
}
function EffectCodeEditor({
  value,
  onChange,
}: {
  value: Work['effects'][number];
  onChange: (patch: Partial<Work['effects'][number]>) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const exampleName = useRef<string | null>(null);
  const changeContent = (content: string) =>
    onChange({
      content,
      validation: undefined,
      ...(exampleName.current && !value.name ? { name: exampleName.current } : {}),
    });
  return (
    <>
      {!value.content && (
        <div className="form-row" role="group" aria-label="연출 예시">
          {effectExamples.map((example) => (
            <Button
              key={example.name}
              onClick={() => {
                if (!input.current) return;
                exampleName.current = example.name;
                input.current.setSelectionRange(0, input.current.value.length);
                insertTextWithUndo(input.current, example.content, changeContent);
                exampleName.current = null;
              }}
            >
              {example.name} 예시
            </Button>
          ))}
        </div>
      )}
      <Field label="코드 입력">
        <Area inputRef={input} value={value.content} onChange={changeContent} />
      </Field>
    </>
  );
}

export function PersonasSection({
  work,
  update,
  selectedPersonaId,
  onPersonaSelect,
}: Pick<CreatorPanelState, 'work' | 'update' | 'selectedPersonaId' | 'onPersonaSelect'>) {
  return (
    <>
      <h2>추천 페르소나</h2>
      <PersonaLibrary
        tabs
        values={work.personas}
        onChange={(personas) => update({ personas })}
        selectedId={selectedPersonaId}
        onSelect={onPersonaSelect}
      />
    </>
  );
}
