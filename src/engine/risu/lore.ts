import { cbs } from './cbs';
import type { RisuCommand } from './types';
/** Keywordless, nonconstant entries remain queryable through getLoreBooks, never auto-injected. */
export function activeLore(command: RisuCommand) {
  const settings = command.config.loreSettings;
  const recent = command.chats
    .slice(-settings.scanDepth)
    .map((c) => c.data)
    .join('\n');
  let search = recent.normalize('NFKC').toLocaleLowerCase(),
    changed = true;
  const selected = new Set<number>();
  for (let pass = 0; changed && pass < 20; pass++) {
    changed = false;
    command.lore.forEach((l, i) => {
      if (selected.has(i) || !l.prompt.trim() || l.activation === 'reference') return;
      if (
        l.activation === 'always' ||
        l.keywords.some((k) => k.trim() && search.includes(k.normalize('NFKC').toLocaleLowerCase()))
      ) {
        selected.add(i);
        changed = true;
        if (settings.recursive) search += '\n' + l.prompt.toLocaleLowerCase();
      }
    });
    if (!settings.recursive) break;
  }
  let used = 0;
  return [...selected]
    .map((i) => cbs(command.lore[i].prompt, command))
    .filter((text) => {
      // Same conservative character budget used by the existing transport, not an exact tokenizer.
      const size = text.length;
      if (used + size > settings.tokenBudget) return false;
      used += size;
      return true;
    })
    .join('\n\n');
}
