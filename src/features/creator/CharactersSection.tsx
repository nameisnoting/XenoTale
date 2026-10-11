import { SelectionPill } from '../../components/SelectionPill';
import { requiresDeleteConfirmation } from '../../domain/deletion';
import { Plus } from 'lucide-react';
import { id } from '../../domain/types';
import { Field, TextInput, Area, Button, ImageUpload } from '../../components/UI';
import { RadioOptions } from '../../components/DesignControls';
import type { CreatorPanelState } from './useCreatorPanelState';
import { LoreEditor } from './LoreEditor';

export function CharactersSection({
  work,
  setTab,
  setGrouping,
  groupFilter,
  setGroupFilter,
  setSaveAs,
  setSaveName,
  setLibrary,
  update,
  changeCharacter,
  charIndex,
  character,
  characterGroupNames,
  deleteCharacter,
  deleteCharacterGroup,
}: Pick<
  CreatorPanelState,
  | 'work'
  | 'setTab'
  | 'setGrouping'
  | 'groupFilter'
  | 'setGroupFilter'
  | 'setSaveAs'
  | 'setSaveName'
  | 'setLibrary'
  | 'update'
  | 'changeCharacter'
  | 'charIndex'
  | 'character'
  | 'characterGroupNames'
  | 'deleteCharacter'
  | 'deleteCharacterGroup'
>) {
  return (
    <>
      <div className="section-title">
        <h2>캐릭터</h2>
        <div className="inline-actions">
          <Button className="outline-gold" onClick={() => setGrouping(true)}>
            캐릭터 그룹화
          </Button>
          <Button className="outline-gold" onClick={() => setLibrary('characters')}>
            캐릭터 불러오기
          </Button>
          <Button
            className="outline-gold"
            onClick={() => {
              setSaveName(work.title || '캐릭터 모음');
              setSaveAs('characters');
            }}
          >
            마이 캐릭터에 저장
          </Button>
        </div>
      </div>
      {!!characterGroupNames.length && (
        <div className="group-filter">
          <SelectionPill
            name="전체"
            shape="round"
            selected={!groupFilter}
            onSelect={() => setGroupFilter('')}
          />
          {characterGroupNames.map((g) => (
            <SelectionPill
              key={g}
              name={g}
              shape="round"
              selected={g === groupFilter}
              deletion={{
                title: '그룹 삭제',
                ariaLabel: `${g} 그룹 삭제`,
                name: g,
                needsConfirmation:
                  requiresDeleteConfirmation(
                    'characterGroup',
                    work.characterGroups?.find((entry) => entry.name === g) ?? { name: g },
                  ) || work.characters.some((c) => c.group === g),
                description: '그룹 설정을 삭제합니다. 소속 캐릭터는 유지되며 그룹에서 해제됩니다.',
                onDelete: () => deleteCharacterGroup(g),
              }}
              onSelect={() => {
                setGroupFilter(g);
                setTab(
                  Math.max(
                    0,
                    work.characters.findIndex((c) => c.group === g),
                  ),
                );
              }}
            />
          ))}
        </div>
      )}
      <div className="tab-pills">
        {work.characters.map(
          (c, i) =>
            (!groupFilter || c.group === groupFilter) && (
              <SelectionPill
                key={c.id}
                name={c.name || `캐릭터 ${i + 1}`}
                selected={i === charIndex}
                onSelect={() => setTab(i)}
                deletion={
                  work.characters.length === 1
                    ? undefined
                    : {
                        title: '캐릭터 삭제',
                        ariaLabel: `${c.name || `캐릭터 ${i + 1}`} 삭제`,
                        name: c.name,
                        needsConfirmation:
                          requiresDeleteConfirmation('character', c) ||
                          work.relations.some((r) => r.from === c.id || r.to === c.id),
                        description:
                          '캐릭터와 연결된 관계·도입부 등장 정보·미디어 연결도 함께 제거됩니다.',
                        onDelete: () => deleteCharacter(c),
                      }
                }
              />
            ),
        )}
        <Button
          onClick={() => {
            update({
              characters: [
                ...work.characters,
                {
                  id: id(),
                  name: '',
                  role: 'supporting',
                  image: '',
                  trigger: '',
                  prompt: '',
                  lore: [],
                  group: '',
                },
              ],
            });
            setGroupFilter('');
            setTab(work.characters.length);
          }}
        >
          <Plus size={16} />
          추가
        </Button>
      </div>
      {character && (
        <>
          <div className="character-identity">
            <div className="character-portrait">
              <span className="field-label">프로필 이미지</span>
              <ImageUpload
                value={character.image}
                onChange={(image) => changeCharacter(charIndex, { image })}
                label="캐릭터 이미지"
              />
            </div>
            <div className="character-identity-fields">
              <Field label="이름" required>
                <TextInput
                  value={character.name}
                  placeholder="이름을 입력하세요"
                  onChange={(name) => changeCharacter(charIndex, { name })}
                />
              </Field>
              <Field label="역할">
                <RadioOptions
                  value={{ main: '주연', supporting: '조연', extra: '엑스트라' }[character.role]}
                  values={['주연', '조연', '엑스트라']}
                  onChange={(v) =>
                    changeCharacter(charIndex, {
                      role: v === '주연' ? 'main' : v === '조연' ? 'supporting' : 'extra',
                    })
                  }
                />
              </Field>
            </div>
          </div>
          {character.role !== 'main' && (
            <Field
              label="트리거 프롬프트"
              required
              hint="항상 전달됩니다. 이 인물이 어떤 상황에 등장하는지 적어 주세요."
            >
              <Area
                value={character.trigger}
                onChange={(trigger) => changeCharacter(charIndex, { trigger })}
              />
            </Field>
          )}
          <div className="character-prompt">
            <Field
              label={character.role === 'main' ? '캐릭터 프롬프트' : '전체 프롬프트'}
              required={character.role === 'main'}
            >
              <Area
                value={character.prompt}
                onChange={(prompt) => changeCharacter(charIndex, { prompt })}
                rows={9}
              />
            </Field>
          </div>
          <hr className="character-lore-divider" />
          <h2 className="character-lore-title">캐릭터별 설정집</h2>
          <LoreEditor
            entries={character.lore}
            onChange={(lore) => changeCharacter(charIndex, { lore })}
          />
        </>
      )}
    </>
  );
}
