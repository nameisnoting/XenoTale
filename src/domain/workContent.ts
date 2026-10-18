import type { Character, Work } from './types';

export const hasCharacterContent = (c: Character) =>
  !!(c.name.trim() || c.prompt.trim() || c.trigger.trim() || c.image || c.lore.length);

/** Early Risu imports stored folder markers as empty lore. Keep any edited content or mode. */
export function repairLegacyRisuLore(work: Work): Work {
  const lore = work.lore.filter(
    (entry) =>
      entry.activation !== undefined ||
      !!entry.prompt.trim() ||
      entry.keywords.length !== 1 ||
      !/^folder:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.keywords[0]),
  );
  return lore.length === work.lore.length ? work : { ...work, lore };
}

/** Empty editor placeholders are never published or sent to a model. */
export function cleanWork(work: Work): Work {
  const characters = work.characters.filter(hasCharacterContent);
  const blankIds = new Set(work.characters.filter((c) => !hasCharacterContent(c)).map((c) => c.id));
  const { guide, chatUi, ...base } = repairLegacyRisuLore(work);
  void chatUi;
  return {
    ...base,
    characters,
    openings: work.openings.map((o) => ({
      ...o,
      presence: characters.length ? o.presence.filter((id) => !blankIds.has(id)) : [],
    })),
    ...(guide ? { description: [work.description, guide].filter(Boolean).join('\n\n') } : {}),
  };
}

export const relationsEnabled = (work: Work) => work.relationsEnabled ?? work.relations.length > 0;
