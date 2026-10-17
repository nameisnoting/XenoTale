import type { Character, Work } from './types';

export const hasCharacterContent = (c: Character) =>
  !!(c.name.trim() || c.prompt.trim() || c.trigger.trim() || c.image || c.lore.length);

/** Empty editor placeholders are never published or sent to a model. */
export function cleanWork(work: Work): Work {
  const characters = work.characters.filter(hasCharacterContent);
  const blankIds = new Set(work.characters.filter((c) => !hasCharacterContent(c)).map((c) => c.id));
  const { guide, chatUi, ...base } = work;
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
