export type DeleteKind =
  | 'note'
  | 'persona'
  | 'lore'
  | 'character'
  | 'opening'
  | 'status'
  | 'item'
  | 'chapter'
  | 'shortcut'
  | 'effect'
  | 'event'
  | 'characterGroup'
  | 'relation';

const legacyNames: Partial<Record<DeleteKind, RegExp>> = {
  event: /^(?:이벤트|규칙)\s*\d+$/,
  note: /^노트\s*\d+$/,
  persona: /^페르소나\s*\d+$/,
  lore: /^로어북\s*\d+$/,
  opening: /^도입부\s*\d+$/,
  chapter: /^챕터\s*\d+$/,
  characterGroup: /^그룹\s*\d+$/,
};
export function hasText(value: unknown): boolean {
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.some(hasText);
  if (value && typeof value === 'object') return Object.values(value).some(hasText);
  return false;
}

// Default titles are recorded at creation so renaming to another generated-looking
// title still counts as authored data, including after reload and backup restore.
export function requiresDeleteConfirmation(kind: DeleteKind, value: any): boolean {
  const name = String(value.name ?? '').trim();
  const renamed =
    !!name &&
    (value.defaultName !== undefined
      ? name !== value.defaultName.trim()
      : !legacyNames[kind]?.test(name));
  if (renamed) return true;
  switch (kind) {
    case 'note':
      return hasText(value.body);
    case 'persona':
      return hasText([value.prompt, value.image, value.gender]);
    case 'lore':
      return hasText([value.prompt, value.keywords]);
    case 'character':
      return (
        hasText([value.image, value.prompt, value.trigger, value.group]) || !!value.lore?.length
      );
    case 'opening':
      return hasText([value.body, value.suggestions, value.bgm]);
    case 'status':
      return (
        hasText([
          value.prompt,
          value.unit,
          value.options,
          typeof value.initial === 'string' ? value.initial : '',
        ]) ||
        value.type !== 'number' ||
        value.initial !== 0 ||
        value.min !== 0 ||
        value.max !== 100 ||
        !!value.displayMax ||
        !!value.levels?.length
      );
    case 'item':
      return hasText([value.image, value.prompt]) || !!value.owned || !!value.enhancement;
    case 'chapter':
      return (
        hasText([value.prologue, value.prompt]) ||
        !!value.conditions?.length ||
        value.type !== 'chapter' ||
        value.mode !== 'all' ||
        value.afterstory === false
      );
    case 'shortcut':
      return hasText([value.description, value.prompt]);
    case 'event':
      return (
        !!value.conditions?.length ||
        !!value.steps?.length ||
        value.trigger !== 'button' ||
        value.mode !== 'all' ||
        hasText(value.triggerRef) ||
        value.buttonLocation === 'screen' ||
        !!value.workspace?.chapters?.length ||
        !!value.workspace?.innerUnlock
      );
    case 'effect':
      return hasText([value.prompt, value.content]);
    case 'characterGroup':
      return hasText(value.prompt);
    case 'relation':
      return hasText([value.label, value.innerLabel]);
  }
}
