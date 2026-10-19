import { ConditionEditor } from './ConditionEditor';
import { DeleteAction } from '../../components/DeleteAction';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { Select } from '../../components/Select';
import { Plus } from 'lucide-react';
import type { Chapter } from '../../domain/types';
import { id } from '../../domain/types';
import { Field, TextInput, Area, Segmented, Button, Modal, Toggle } from '../../components/UI';
import { ScenarioGraph } from '../Graphs';
import type { CreatorPanelState } from './useCreatorPanelState';

export function ScenarioSection({
  work,
  chapterId,
  setChapterId,
  notify,
  update,
  changeChapter,
}: Pick<
  CreatorPanelState,
  'work' | 'chapterId' | 'setChapterId' | 'notify' | 'update' | 'changeChapter'
>) {
  return (
    <>
      <h2>시나리오</h2>
      <ScenarioGraph
        work={work}
        onSelect={setChapterId}
        onAdd={(parent) => {
          if (work.chapters.some((c) => c.id === parent && c.type === 'ending')) return;
          const next: Chapter = {
            id: id(),
            name: `챕터 ${work.chapters.length + 1}`,
            defaultName: `챕터 ${work.chapters.length + 1}`,
            type: 'chapter',
            from: parent,
            mode: 'all',
            conditions: [],
            prologue: '',
            prompt: '',
            afterstory: true,
          };
          update({ chapters: [...work.chapters, next] });
          setChapterId(next.id);
        }}
      />
      {work.chapters.map(
        (c, i) =>
          c.id === chapterId && (
            <Modal
              title="챕터 설정"
              key={c.id}
              closeOnBackdrop={false}
              onClose={() => setChapterId(null)}
            >
              <Field label="제목">
                <TextInput value={c.name} onChange={(name) => changeChapter(i, { name })} />
              </Field>
              <Field label="이전 노드">
                <Select
                  value={c.from}
                  onChange={(from) => changeChapter(i, { from })}
                  options={[
                    ...work.openings.map((o) => ({ id: o.id, name: o.name })),
                    ...work.chapters.filter((x) => x.id !== c.id && x.type !== 'ending'),
                  ].map((n) => ({ value: n.id, label: n.name || '이름 없음' }))}
                />
              </Field>
              <Segmented
                value={c.type === 'ending' ? '엔딩' : '챕터'}
                values={['챕터', '엔딩']}
                onChange={(v) => {
                  if (v === '엔딩' && work.chapters.some((x) => x.from === c.id)) {
                    notify(
                      '연결된 다음 챕터를 삭제하거나 이전 노드를 변경한 뒤 엔딩으로 바꿔 주세요.',
                    );
                    return;
                  }
                  changeChapter(i, { type: v === '엔딩' ? 'ending' : 'chapter' });
                }}
              />
              <Field label="이동 조건">
                <Segmented
                  value={c.mode === 'all' ? 'AND · 모두 충족' : 'OR · 하나라도 충족'}
                  values={['AND · 모두 충족', 'OR · 하나라도 충족']}
                  onChange={(v) => changeChapter(i, { mode: v.startsWith('AND') ? 'all' : 'any' })}
                />
              </Field>
              {!c.conditions.length && (
                <p className="muted">조건 없음 · 연결된 챕터에서 자유롭게 이동 가능</p>
              )}
              {c.conditions.map((cond, j) => (
                <ConditionEditor
                  key={cond.id}
                  value={cond}
                  work={work}
                  onChange={(v) =>
                    changeChapter(i, {
                      conditions: c.conditions.map((x, k) => (k === j ? v : x)),
                    })
                  }
                  onDelete={() =>
                    changeChapter(i, {
                      conditions: c.conditions.filter((x) => x.id !== cond.id),
                    })
                  }
                />
              ))}
              <Button
                onClick={() =>
                  changeChapter(i, {
                    conditions: [
                      ...c.conditions,
                      {
                        id: id(),
                        kind: 'number',
                        ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
                        op: 'gte',
                        value: 0,
                      },
                    ],
                  })
                }
              >
                <Plus size={15} />
                조건 추가
              </Button>
              <Field label={c.type === 'ending' ? '엔딩 장면' : '프롤로그'}>
                <Area value={c.prologue} onChange={(prologue) => changeChapter(i, { prologue })} />
              </Field>
              <Field label="추가 프롬프트">
                <Area value={c.prompt} onChange={(prompt) => changeChapter(i, { prompt })} />
              </Field>
              {c.type === 'ending' && (
                <Toggle
                  label="후일담 허용"
                  value={c.afterstory}
                  onChange={(afterstory) => changeChapter(i, { afterstory })}
                />
              )}
              <Field label="BGM 주소 (비워 두면 음악 끄기)">
                <TextInput
                  value={c.bgm ?? ''}
                  onChange={(bgm) => changeChapter(i, { bgm })}
                  placeholder="이전 노드의 음악을 이어서 재생 중"
                />
                {c.bgm !== undefined && (
                  <Button onClick={() => changeChapter(i, { bgm: undefined })}>
                    이전 노드 음악 사용
                  </Button>
                )}
              </Field>
              <DeleteAction
                title="챕터 삭제"
                label="챕터 삭제"
                className="button--danger"
                name={c.name}
                needsConfirmation={
                  work.chapters.some((x) => x.from === c.id) ||
                  requiresDeleteConfirmation('chapter', c)
                }
                description={
                  work.chapters.some((x) => x.from === c.id)
                    ? `다음 챕터 ${work.chapters.filter((x) => x.from === c.id).length}개가 이전 노드에 자동 연결됩니다. 삭제할 챕터의 조건과 내용은 제거되며, 다른 챕터의 조건과 내용은 그대로 유지됩니다.`
                    : '이 챕터의 조건과 내용이 삭제됩니다. 다른 챕터의 조건과 내용은 그대로 유지됩니다.'
                }
                onDelete={() => {
                  update({
                    actions: work.actions?.map((a) =>
                      a.workspace?.chapters?.includes(c.id)
                        ? {
                            ...a,
                            workspace: {
                              ...a.workspace,
                              chapters: a.workspace.chapters.filter((key) => key !== c.id),
                            },
                          }
                        : a,
                    ),
                    chapters: work.chapters
                      .filter((x) => x.id !== c.id)
                      .map((x) => (x.from === c.id ? { ...x, from: c.from } : x)),
                  });
                  setChapterId(null);
                }}
              />
              <Button className="primary full" onClick={() => setChapterId(null)}>
                완료
              </Button>
            </Modal>
          ),
      )}
    </>
  );
}
