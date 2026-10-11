import { DeleteAction } from '../components/DeleteAction';
import { requiresDeleteConfirmation } from '../domain/deletion';
import { useRef, useState } from 'react';
import { MediaCard, CodePill, CodeRange, TemplateInput } from '../components/MediaFields';
import { MediaPreview } from './MediaPreview';
import { Plus, X } from 'lucide-react';
import type { Work } from '../domain/types';
import { clone, id } from '../domain/types';
import {
  Area,
  Avatar,
  Button,
  Field,
  IconButton,
  Modal,
  NumberInput,
  TextInput,
  safeUrl,
} from '../components/UI';

export function ViewpointActors({ work, onChange }: { work: Work; onChange: (w: Work) => void }) {
  const q = work.quality;
  const options = [{ id: 'user', name: '{{user}}', image: '' }, ...work.characters];
  const row = (label: string, key: 'viewpointActorId' | 'viewpointTargetId') => (
    <Field label={label}>
      <div className="avatar-choices">
        {options.map((c) => (
          <button
            key={c.id}
            aria-pressed={(q[key] ?? 'user') === c.id}
            onClick={() => onChange({ ...work, quality: { ...q, [key]: c.id } })}
          >
            <Avatar src={c.image} size={48} />
            {c.name || '이름 없음'}
          </button>
        ))}
      </div>
    </Field>
  );
  return q.viewpoint === '전지적 작가' ? null : (
    <div className="viewpoint-selectors">
      {q.viewpoint.startsWith('1인칭') &&
        row(q.viewpoint === '1인칭 주인공' ? '주인공' : '관찰자', 'viewpointActorId')}
      {q.viewpoint.endsWith('관찰자') && row('관찰 대상', 'viewpointTargetId')}
    </div>
  );
}

export function CharacterGroups({
  work,
  onChange,
  onClose,
}: {
  work: Work;
  onChange: (w: Work) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => clone(work));
  const [tab, setTab] = useState(0);
  const groups = draft.characterGroups ?? [];
  const group = groups[Math.min(tab, groups.length - 1)];
  const update = (patch: Partial<NonNullable<Work['characterGroups']>[number]>) => {
    if (!group) return;
    setDraft({
      ...draft,
      characterGroups: groups.map((g) => (g.id === group.id ? { ...g, ...patch } : g)),
      characters:
        patch.name === undefined
          ? draft.characters
          : draft.characters.map((c) =>
              c.group === group.name ? { ...c, group: patch.name! } : c,
            ),
    });
  };
  return (
    <Modal title="캐릭터 그룹화" onClose={onClose}>
      <div className="tab-pills">
        {groups.map((g, i) => (
          <button
            key={g.id}
            className={g.id === group?.id ? 'active' : ''}
            onClick={() => setTab(i)}
          >
            {g.name}
          </button>
        ))}
        <Button
          onClick={() => {
            setDraft({
              ...draft,
              characterGroups: [
                ...groups,
                {
                  id: id(),
                  name: `그룹 ${groups.length + 1}`,
                  defaultName: `그룹 ${groups.length + 1}`,
                  prompt: '',
                },
              ],
            });
            setTab(groups.length);
          }}
        >
          <Plus size={16} />
          추가
        </Button>
      </div>
      {group && (
        <>
          <Field label="그룹 이름" required>
            <TextInput value={group.name} onChange={(name) => update({ name })} />
          </Field>
          <Field label="소속 캐릭터" required>
            <div className="avatar-choices">
              {draft.characters.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={c.group === group.name}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      characters: draft.characters.map((v) =>
                        v.id === c.id
                          ? { ...v, group: v.group === group.name ? '' : group.name }
                          : v,
                      ),
                    })
                  }
                >
                  <Avatar src={c.image} size={60} />
                  {c.name}
                  <small>{c.group || '무소속'}</small>
                </button>
              ))}
            </div>
          </Field>
          <Field label="그룹 프롬프트">
            <Area value={group.prompt} onChange={(prompt) => update({ prompt })} rows={9} />
          </Field>
          <DeleteAction
            title="그룹 삭제"
            label="그룹 삭제"
            name={group.name}
            needsConfirmation={
              requiresDeleteConfirmation('characterGroup', group) ||
              draft.characters.some((c) => c.group === group.name)
            }
            description="그룹 설정을 삭제합니다. 소속 캐릭터는 유지되며 그룹에서 해제됩니다."
            onDelete={() =>
              setDraft({
                ...draft,
                characterGroups: groups.filter((g) => g.id !== group.id),
                characters: draft.characters.map((c) =>
                  c.group === group.name ? { ...c, group: '' } : c,
                ),
              })
            }
          />
        </>
      )}
      <Button
        className="primary full"
        disabled={
          groups.some((g) => !g.name.trim()) ||
          new Set(groups.map((g) => g.name.trim())).size !== groups.length
        }
        onClick={() => {
          onChange(draft);
          onClose();
        }}
      >
        완료
      </Button>
    </Modal>
  );
}

export function MediaEditor({ work, onChange }: { work: Work; onChange: (w: Work) => void }) {
  const media = work.media;
  const input = useRef<HTMLInputElement>(null);
  const min = media.rangeMin ?? Number(media.situations[0]?.code ?? 1);
  const max = media.rangeMax ?? Number(media.situations.at(-1)?.code ?? 999);
  const names = media.situationNames ?? media.situations.map((s) => s.name).join('\n');
  const [error, setError] = useState('');
  const namesList = names
    .split(/\n|,/)
    .map((n) => n.trim())
    .filter(Boolean);
  const usedCodes = new Set(media.characters.map((entry) => entry.code));
  const characters = work.characters.map((character) => {
    const existing = media.characters.find((entry) => entry.characterId === character.id);
    if (existing) return existing;
    let next = 1;
    while (usedCodes.has(String(next))) next++;
    usedCodes.add(String(next));
    return { characterId: character.id, code: String(next) };
  });
  const validation =
    !/^https:\/\//.test(media.template) ||
    !media.template.includes('{{char_code}}') ||
    !media.template.includes('{{situation_code}}')
      ? 'HTTPS URL에 캐릭터 코드와 상황 코드를 모두 넣어 주세요.'
      : !Number.isInteger(min) ||
          !Number.isInteger(max) ||
          min < 0 ||
          max > 9999 ||
          max < min ||
          !namesList.length ||
          namesList.length !== max - min + 1
        ? '코드 범위와 상황 이름 개수가 일치하지 않습니다.'
        : new Set(characters.map((entry) => entry.code.trim())).size !== characters.length ||
            characters.some(
              (entry) =>
                !/^\d+$/.test(entry.code) || Number(entry.code) < 1 || Number(entry.code) > 9999,
            )
          ? '캐릭터 코드는 1~9999의 중복되지 않는 숫자로 입력해 주세요. 0은 공용 코드입니다.'
          : '';
  const registered =
    (media.registered ?? (!!media.template && !!media.situations.length)) && !validation;
  const update = (patch: Partial<Work['media']>) => {
    onChange({
      ...work,
      media: { ...media, rangeMin: min, rangeMax: max, ...patch, registered: false },
    });
    setError('');
  };
  const register = () => {
    if (validation) {
      setError(validation);
      return;
    }
    onChange({
      ...work,
      media: {
        ...media,
        characters,
        rangeMin: min,
        rangeMax: max,
        situationNames: names,
        registered: true,
        situations: namesList.map((name, i) => ({ code: String(min + i), name })),
      },
    });
    setError('');
  };
  return (
    <div className="media-editor">
      <h2>이미지</h2>
      <MediaCard title="이미지 URL">
        <TemplateInput
          inputRef={input}
          value={media.template}
          onChange={(template) => update({ template })}
        />
        <div className="keyword-pills">
          {['{{char_code}}', '{{situation_code}}'].map((code) => (
            <Button
              key={code}
              onClick={() => {
                const start = input.current?.selectionStart ?? media.template.length;
                const end = input.current?.selectionEnd ?? start;
                update({
                  template: media.template.slice(0, start) + code + media.template.slice(end),
                });
                requestAnimationFrame(() => {
                  input.current?.focus();
                  input.current?.setSelectionRange(start + code.length, start + code.length);
                });
              }}
            >
              {code}
            </Button>
          ))}
        </div>
      </MediaCard>
      <MediaCard title="캐릭터 코드">
        <div className="code-pills">
          <CodePill label="공용" value="0" />
          {work.characters.map((c, i) => (
            <CodePill
              key={c.id}
              label={c.name || `캐릭터 ${i + 1}`}
              inputLabel={`${c.name || `캐릭터 ${i + 1}`} 코드`}
              value={characters.find((entry) => entry.characterId === c.id)!.code}
              onChange={(code) =>
                update({
                  characters: characters.map((entry) =>
                    entry.characterId === c.id ? { ...entry, code } : entry,
                  ),
                })
              }
            />
          ))}
        </div>
      </MediaCard>
      <MediaCard title="상황 코드">
        <div className="situation-code-fields">
          <CodeRange>
            <CodePill
              label="최솟값"
              type="number"
              value={min}
              onChange={(value) => update({ rangeMin: Number(value) })}
            />
            <CodePill
              label="최댓값"
              type="number"
              value={max}
              onChange={(value) => update({ rangeMax: Number(value) })}
            />
          </CodeRange>
          <Field label="상황 이름 정의" hint="쉼표 또는 줄바꿈으로 구분해 주세요.">
            <Area
              value={names}
              onChange={(v) => {
                update({
                  situationNames: v,
                  situations: v
                    .split(/\n|,/)
                    .map((name) => name.trim())
                    .filter(Boolean)
                    .map((name, i) => ({ code: String(min + i), name })),
                });
              }}
              rows={10}
              placeholder={
                '코드에 맞는 상황 이름을 아래 방식 중 하나로 작성해 주세요.\n\n[예시1] - 콤마로 구분\n상황이름1,상황이름2,상황이름3\n\n[예시2] - 줄바꿈으로 구분\n상황이름1\n상황이름2\n상황이름3'
              }
            />
          </Field>
        </div>
      </MediaCard>
      <Button
        className="full media-register"
        disabled={registered || !!validation}
        onClick={register}
      >
        {registered ? '등록 완료' : '이미지 등록'}
      </Button>
      {(error || (!registered && validation && (media.template || names))) && (
        <p className="danger-text" role="alert">
          {error || validation}
        </p>
      )}
      <hr />
      <h3>등록 이미지 확인</h3>
      {registered ? (
        <MediaPreview media={media} characters={work.characters} />
      ) : (
        <p className="muted">이미지 등록을 먼저 진행해 주세요.</p>
      )}
    </div>
  );
}
