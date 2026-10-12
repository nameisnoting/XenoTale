import { id, clone } from '../../domain/types';
import { changeProfile } from '../../persistence/db';
import { Field, TextInput, Button, Modal, Empty } from '../../components/UI';
import { CharacterGroups } from '../CreatorExtras';
import { initialState } from '../../domain/engine';
import { EffectPlayer } from '../../components/EffectPlayer';
import type { CreatorPanelState } from './useCreatorPanelState';

export function CreatorPanelDialogs({
  work,
  onChange,
  profile,
  grouping,
  setGrouping,
  saveAs,
  setSaveAs,
  saveName,
  setSaveName,
  effectPreview,
  setEffectPreview,
  library,
  setLibrary,
  run,
  update,
}: Pick<
  CreatorPanelState,
  | 'work'
  | 'onChange'
  | 'profile'
  | 'grouping'
  | 'setGrouping'
  | 'saveAs'
  | 'setSaveAs'
  | 'saveName'
  | 'setSaveName'
  | 'effectPreview'
  | 'setEffectPreview'
  | 'library'
  | 'setLibrary'
  | 'run'
  | 'update'
>) {
  return (
    <>
      {grouping && (
        <CharacterGroups work={work} onChange={onChange} onClose={() => setGrouping(false)} />
      )}
      {saveAs && (
        <Modal
          title={saveAs === 'lore' ? '로어북 저장' : '캐릭터 저장'}
          onClose={() => setSaveAs(null)}
        >
          <Field label="제목">
            <TextInput value={saveName} onChange={setSaveName} />
          </Field>
          <Button
            className="primary full"
            disabled={!saveName.trim()}
            onClick={() => {
              run(
                changeProfile((p) => {
                  if (saveAs === 'lore')
                    p.savedLore.push({
                      id: id(),
                      name: saveName.trim(),
                      entries: clone(work.lore),
                    });
                  else
                    p.savedCharacters.push({
                      id: id(),
                      name: saveName.trim(),
                      characters: clone(work.characters),
                    });
                }),
              );
              setSaveAs(null);
            }}
          >
            완료
          </Button>
        </Modal>
      )}
      {effectPreview && (
        <EffectPlayer
          work={work}
          effect={effectPreview}
          preview
          context={{
            personaName: '{{user}}',
            status: initialState(work, work.openings[0].id).status,
            inventory: initialState(work, work.openings[0].id).inventory,
            nodeId: work.openings[0].id,
          }}
          onClose={() => setEffectPreview(null)}
        />
      )}
      {library && (
        <Modal
          title={library === 'lore' ? '로어북 불러오기' : '캐릭터 불러오기'}
          onClose={() => setLibrary(null)}
        >
          {(library === 'lore' ? profile.savedLore : profile.savedCharacters).length === 0 && (
            <Empty>저장한 자료가 없습니다.</Empty>
          )}
          {library === 'lore'
            ? profile.savedLore.map((l) => (
                <Button
                  className="full"
                  key={l.id}
                  onClick={() => {
                    update({
                      lore: [...work.lore, ...clone(l.entries).map((e) => ({ ...e, id: id() }))],
                    });
                    setLibrary(null);
                  }}
                >
                  {l.name}
                </Button>
              ))
            : profile.savedCharacters.map((l) => (
                <Button
                  className="full"
                  key={l.id}
                  onClick={() => {
                    update({
                      characters: [
                        ...work.characters,
                        ...clone(l.characters).map((c) => ({
                          ...c,
                          id: id(),
                          lore: c.lore.map((x) => ({ ...x, id: id() })),
                        })),
                      ],
                    });
                    setLibrary(null);
                  }}
                >
                  {l.name}
                </Button>
              ))}
        </Modal>
      )}
    </>
  );
}
