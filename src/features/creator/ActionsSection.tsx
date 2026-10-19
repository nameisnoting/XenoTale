import { useState, type ReactNode } from 'react';
import { newEvent } from '../../domain/events';
import { EventEditor } from './EventEditor';
import type { EventLibrary } from './EventParts';
import { AddButton } from '../../components/AddButton';
import { DisclosureCard } from '../../components/DisclosureCard';
import { Field, Area } from '../../components/UI';
import type { CreatorPanelState } from './useCreatorPanelState';

export function ActionsSection({
  work,
  update,
  notify,
  onSectionSelect,
  onOpenLibrary,
  renderLibrary,
}: Pick<CreatorPanelState, 'work' | 'update' | 'notify' | 'onSectionSelect'> & {
  onOpenLibrary: (library: EventLibrary, host: string) => void;
  renderLibrary: (host: string, onDone: (kind: EventLibrary) => void) => ReactNode;
}) {
  const [created, setCreated] = useState('');
  return (
    <>
      <p className="muted">
        이벤트에 이름을 붙이고 시작 시점, 조건, 실행할 작업을 조립합니다. 상태값·아이템·연출은 작품
        전체에서 공유하며 시나리오·관계도의 조건도 같은 데이터로 연결됩니다.
      </p>
      {(work.actions ?? []).map((action, index) => (
        <EventEditor
          key={action.id}
          {...{ work, action, update, notify }}
          expanded={index === 0 || action.id === created}
          onLibrary={(kind) => onOpenLibrary(kind, action.id)}
          renderLibrary={(onDone) => renderLibrary(action.id, onDone)}
          onNavigate={onSectionSelect}
        />
      ))}
      <AddButton
        onClick={() => {
          const action = newEvent(work.actions);
          update({ actions: [...(work.actions ?? []), action] });
          setCreated(action.id);
        }}
      >
        이벤트 추가
      </AddButton>
      <DisclosureCard className="rule-help" title="계산식 도움말">
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
