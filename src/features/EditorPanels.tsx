import './CharacterEditor.css';
import './StatusEditor.css';
import './ChatShortcuts.css';
import { MediaEditor } from './CreatorExtras';
import { ChatUiSection } from './creator/ChatUiSection';
import { RelationGraph } from './Graphs';
import { OverviewSection } from './creator/OverviewSection';
import { CharactersSection } from './creator/CharactersSection';
import { OpeningsSection } from './creator/OpeningsSection';
import { StatusSection } from './creator/StatusSection';
import { ItemsSection } from './creator/ItemsSection';
import { ScenarioSection } from './creator/ScenarioSection';
import {
  ShortcutsSection,
  EffectsSection,
  PersonasSection,
  GuideSection,
} from './creator/ExtraSections';
import { CreatorPanelDialogs } from './creator/CreatorPanelDialogs';
import { useCreatorPanelState, type CreatorPanelProps } from './creator/useCreatorPanelState';

export function EditorPanels(props: CreatorPanelProps) {
  const state = useCreatorPanelState(props);
  const { section, work, onChange, relationView } = state;
  return (
    <div className={`editor-form ${section}-form`}>
      {section === 'overview' && <OverviewSection {...state} />}
      {section === 'characters' && <CharactersSection {...state} />}
      {section === 'openings' && <OpeningsSection {...state} />}
      {section === 'statuses' && <StatusSection {...state} />}
      {section === 'chatUi' && <ChatUiSection {...state} />}
      {section === 'items' && <ItemsSection {...state} />}
      {section === 'scenarios' && <ScenarioSection {...state} />}
      {section === 'shortcuts' && <ShortcutsSection {...state} />}
      {section === 'effects' && <EffectsSection {...state} />}
      {section === 'personas' && <PersonasSection {...state} />}
      {section === 'guide' && <GuideSection {...state} />}
      {section === 'media' && <MediaEditor work={work} onChange={onChange} />}
      {section === 'relations' && (
        <RelationGraph {...relationView} work={work} onChange={onChange} />
      )}
      <CreatorPanelDialogs {...state} />
    </div>
  );
}
