import narratorPrompt from '../engine/prompts/narrator_default_v2.txt?raw';
import legacyNarratorPrompt from '../engine/prompts/narrator_legacy_v2.txt?raw';
import plainNarratorPrompt from '../engine/prompts/narrator_plain_v2.txt?raw';
import type { Work } from './types';

export const SYSTEM_PROMPT = narratorPrompt;
export const effectiveSystemPrompt = (work: Pick<Work, 'systemMode' | 'customSystem'>) =>
  work.systemMode === 'custom' ? work.customSystem : SYSTEM_PROMPT;

// Refresh only a verbatim copy of the old provided default, never edited prompts.
// This helper is applied to library works/drafts, not frozen room definitions.
export function upgradeProvidedSystemPrompt<T extends Pick<Work, 'systemMode' | 'customSystem'>>(
  work: T,
): T {
  const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim();
  return work.systemMode === 'custom' &&
    [legacyNarratorPrompt, plainNarratorPrompt].some(
      (previous) => normalize(work.customSystem) === normalize(previous),
    )
    ? { ...work, customSystem: SYSTEM_PROMPT }
    : work;
}
