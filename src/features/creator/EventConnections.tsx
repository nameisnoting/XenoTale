import { useState } from 'react';
import { DisclosureCard } from '../../components/DisclosureCard';
import { Field, TextInput, Button, Toggle } from '../../components/UI';
import { Select } from '../../components/Select';
import { EventConditions } from './EventParts';
import { eventConnections } from '../../domain/events';
import type { Work, Chapter } from '../../domain/types';
import { id } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';

export function EventConnections({
  work,
  action,
  update,
  change,
  onNavigate,
}: {
  work: Work;
  action: WorkAction;
  update: (patch: Partial<Work>) => void;
  change: (patch: Partial<WorkAction>) => void;
  onNavigate?: (section: string) => void;
}) {
  const { chapters, inner } = eventConnections(work, action);
  const [expanded, setExpanded] = useState<string | null>(null);
  const unlock = work.innerUnlock ?? { mode: 'all' as const, conditions: [] };
  const patchChapter = (key: string, patch: Partial<Chapter>) =>
    update({
      chapters: work.chapters.map((chapter) =>
        chapter.id === key ? { ...chapter, ...patch } : chapter,
      ),
    });
  const link = (key: string) => {
    change({
      workspace: {
        view: action.workspace?.view ?? 'blocks',
        ...action.workspace,
        chapters: [...new Set([...(action.workspace?.chapters ?? []), key])],
      },
    });
    setExpanded(key);
  };
  return (
    <section className="event-connections" aria-label="시나리오·관계도 연결">
      <h3>시나리오·관계도 연결</h3>
      <p className="muted">
        이 이벤트에서 변경하는 상태값·아이템을 조건으로 사용하는 곳이 함께 표시됩니다. 여기서 고친
        조건은 기존 시나리오·관계도에도 그대로 반영됩니다.
      </p>
      <Field label="시나리오 연결">
        <Select
          label="연결할 시나리오"
          value=""
          onChange={(key) => key && link(key)}
          options={[
            { value: '', label: '기존 챕터·엔딩 선택' },
            ...work.chapters
              .filter((c) => !chapters.some((p) => p.id === c.id))
              .map((c) => ({ value: c.id, label: c.name || '이름 없음' })),
          ]}
        />
      </Field>
      {chapters.map((chapter) => (
        <DisclosureCard
          key={chapter.id}
          title={`시나리오 · ${chapter.name || '이름 없음'}`}
          expanded={expanded === chapter.id}
          className="creator-card"
        >
          <Field label="연결된 시나리오 이름">
            <TextInput
              value={chapter.name}
              onChange={(name) => patchChapter(chapter.id, { name })}
            />
          </Field>
          <EventConditions
            work={work}
            conditions={chapter.conditions}
            mode={chapter.mode}
            onChange={(conditions, mode) => patchChapter(chapter.id, { conditions, mode })}
          />
          <p className="muted">
            이 조건을 만족하고 이전 장면에 도착하면 이동할 수 있습니다. 자동으로 장면을 이동시키지는
            않습니다.
          </p>
          {action.workspace?.chapters?.includes(chapter.id) && (
            <Button
              onClick={() =>
                change({
                  workspace: {
                    ...action.workspace!,
                    chapters: action.workspace!.chapters!.filter((key) => key !== chapter.id),
                  },
                })
              }
            >
              수동 연결 해제
            </Button>
          )}
        </DisclosureCard>
      ))}
      <div className="event-editor-tools">
        <Button
          onClick={() => {
            const chapter: Chapter = {
              id: id(),
              name: `챕터 ${work.chapters.length + 1}`,
              type: 'chapter',
              from: work.openings[0]?.id ?? '',
              mode: 'all',
              conditions: [],
              prologue: '',
              prologueMode: 'ai',
              prompt: '',
              afterstory: true,
            };
            update({
              chapters: [...work.chapters, chapter],
              actions: work.actions?.map((a) =>
                a.id === action.id
                  ? {
                      ...a,
                      workspace: {
                        view: a.workspace?.view ?? 'blocks',
                        ...a.workspace,
                        chapters: [...(a.workspace?.chapters ?? []), chapter.id],
                      },
                    }
                  : a,
              ),
            });
            setExpanded(chapter.id);
          }}
        >
          새 시나리오 연결
        </Button>
        {onNavigate && <Button onClick={() => onNavigate('scenarios')}>시나리오에서 편집</Button>}
        {!inner && (
          <Button
            onClick={() =>
              change({
                workspace: {
                  view: action.workspace?.view ?? 'blocks',
                  ...action.workspace,
                  innerUnlock: true,
                },
              })
            }
          >
            내면 해금 조건 연결
          </Button>
        )}
      </div>
      {inner && (
        <DisclosureCard title="관계도 · 내면 해금 조건" expanded className="creator-card">
          <Toggle
            label="관계도 사용"
            value={work.relationsEnabled ?? !!work.relations.length}
            onChange={(relationsEnabled) => update({ relationsEnabled })}
          />
          <Toggle
            label="표면 / 내면 분리"
            value={!!work.relationSplit}
            onChange={(relationSplit) => update({ relationSplit })}
          />
          <EventConditions
            work={work}
            conditions={unlock.conditions}
            mode={unlock.mode}
            onChange={(conditions, mode) => update({ innerUnlock: { conditions, mode } })}
          />
          <p className="muted">
            관계도와 같은 해금 조건입니다. 조건이 없으면 처음부터 내면을 볼 수 있습니다.
          </p>
          {(!(work.relationsEnabled ?? !!work.relations.length) || !work.relationSplit) && (
            <p className="muted">내면을 표시하려면 관계도 사용과 표면 / 내면 분리를 켜 주세요.</p>
          )}
        </DisclosureCard>
      )}
      {onNavigate && <Button onClick={() => onNavigate('relations')}>관계도에서 편집</Button>}
    </section>
  );
}
