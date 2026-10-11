import type { PublishedWork } from '../domain/types';

// Site-wide visibility, independent of each browser's old hideExamples setting.
export const developerCatalog = { enabled: false, workIds: [] as string[] };

// Keep old rooms/backups intact, but retire the automatically installed sample card.
export const isRetiredSample = (entry: PublishedWork) =>
  entry.id === 'example-garden' && !entry.owned;
