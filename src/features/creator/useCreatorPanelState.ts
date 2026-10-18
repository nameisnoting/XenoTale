import { syncStatusTemplate, syncStatusPanels } from '../../domain/statusTemplate';
import { useState } from 'react';
import type { Work, Profile, Character, StatusDef, Item, Chapter } from '../../domain/types';

import { useAction, useNotify } from '../../components/UI';
import { type GraphViewProps } from '../Graphs';

export type CreatorPanelProps = {
  section: string;
  work: Work;
  onChange: (w: Work) => void;
  profile: Profile;
  selectedOpeningId: string;
  onOpeningSelect: (id: string) => void;
  selectedPersonaId: string;
  onPersonaSelect: (id: string) => void;
  relationView?: GraphViewProps;
};

// Local selections and previews follow EditorPanels' lifetime (keyed by section).
export function useCreatorPanelState({
  section,
  work,
  onChange,
  profile,
  selectedOpeningId,
  onOpeningSelect,
  selectedPersonaId,
  onPersonaSelect,
  relationView,
}: CreatorPanelProps) {
  const [tab, setTab] = useState(0);
  const [grouping, setGrouping] = useState(false);
  const [groupFilter, setGroupFilter] = useState('');
  const [saveAs, setSaveAs] = useState<'lore' | 'characters' | null>(null);
  const [saveName, setSaveName] = useState('');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [effectPreview, setEffectPreview] = useState<Work['effects'][number] | null>(null);
  const [library, setLibrary] = useState<'lore' | 'characters' | null>(null);
  const run = useAction();
  const notify = useNotify();
  const update = (patch: Partial<Work>) => onChange({ ...work, ...patch });
  const changeCharacter = (index: number, patch: Partial<Character>) =>
    update({ characters: work.characters.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const updateStatuses = (statuses: StatusDef[]) =>
    update({
      statuses,
      statusTemplate: syncStatusTemplate(work.statusTemplate, work.statuses, statuses),
      ...(work.statusPanels
        ? { statusPanels: syncStatusPanels(work.statusPanels, work.statuses, statuses) }
        : {}),
    });
  const changeStatus = (index: number, patch: Partial<StatusDef>) =>
    updateStatuses(work.statuses.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const changeItem = (index: number, patch: Partial<Item>) =>
    update({ items: work.items.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const changeChapter = (index: number, patch: Partial<Chapter>) =>
    update({ chapters: work.chapters.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const charIndex = Math.min(tab, work.characters.length - 1);
  const selectedCharacter = work.characters[charIndex];
  const character =
    !groupFilter || selectedCharacter?.group === groupFilter ? selectedCharacter : undefined;
  const characterGroupNames = [
    ...new Set(
      [
        ...(work.characterGroups ?? []).map((g) => g.name),
        ...work.characters.map((c) => c.group),
      ].filter(Boolean),
    ),
  ];
  const deleteCharacter = (target: Character) => {
    if (work.characters.length === 1) return;
    const characters = work.characters.filter((c) => c.id !== target.id);
    update({
      characters,
      quality: {
        ...work.quality,
        viewpointActorId:
          work.quality.viewpointActorId === target.id ? 'user' : work.quality.viewpointActorId,
        viewpointTargetId:
          work.quality.viewpointTargetId === target.id ? 'user' : work.quality.viewpointTargetId,
      },
      relations: work.relations.filter((r) => r.from !== target.id && r.to !== target.id),
      openings: work.openings.map((o) => ({
        ...o,
        presence: o.presence.filter((x) => x !== target.id),
      })),
      media: {
        ...work.media,
        characters: work.media.characters.filter((m) => m.characterId !== target.id),
      },
    });
    const retainedIndex = characters.findIndex((c) => c.id === character?.id);
    const nextIndex =
      retainedIndex >= 0
        ? retainedIndex
        : Math.max(
            0,
            characters.findIndex((c) => !groupFilter || c.group === groupFilter),
          );
    if (groupFilter && !characters.some((c) => c.group === groupFilter)) setGroupFilter('');
    setTab(nextIndex);
  };
  const deleteCharacterGroup = (name: string) => {
    update({
      characterGroups: (work.characterGroups ?? []).filter((g) => g.name !== name),
      characters: work.characters.map((c) => (c.group === name ? { ...c, group: '' } : c)),
    });
    if (groupFilter === name) setGroupFilter('');
  };
  const openingIndex = Math.max(
    0,
    work.openings.findIndex((o) => o.id === selectedOpeningId),
  );
  const opening = work.openings[openingIndex];
  const changeOpening = (patch: Partial<typeof opening>) =>
    update({
      openings: work.openings.map((o, i) => (i === openingIndex ? { ...o, ...patch } : o)),
    });
  return {
    section,
    work,
    onChange,
    profile,
    selectedOpeningId,
    onOpeningSelect,
    selectedPersonaId,
    onPersonaSelect,
    relationView,
    setTab,
    grouping,
    setGrouping,
    groupFilter,
    setGroupFilter,
    saveAs,
    setSaveAs,
    saveName,
    setSaveName,
    chapterId,
    setChapterId,
    effectPreview,
    setEffectPreview,
    library,
    setLibrary,
    run,
    notify,
    update,
    changeCharacter,
    updateStatuses,
    changeStatus,
    changeItem,
    changeChapter,
    charIndex,
    character,
    characterGroupNames,
    deleteCharacter,
    deleteCharacterGroup,
    openingIndex,
    opening,
    changeOpening,
  };
}

export type CreatorPanelState = ReturnType<typeof useCreatorPanelState>;
