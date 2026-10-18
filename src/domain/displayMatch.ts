export type DisplayMatchMode = 'marker' | 'text' | 'regex';

export const escapeDisplayLiteral = (text: string) => text.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');

export function displayPattern(mode: DisplayMatchMode, text: string) {
  if (mode === 'regex' || !text) return text;
  return escapeDisplayLiteral(
    mode === 'marker' ? '{{' + text.replace(/^\{\{([\s\S]*)\}\}$/, '$1') + '}}' : text,
  );
}

/** Only exact, lossless literal expressions are offered as simple inputs. No schema migration. */
export function readDisplayMatch(
  pattern: string,
  flags: string,
): { mode: DisplayMatchMode; text: string } {
  if (!pattern && flags === 'g') return { mode: 'marker', text: '' };
  if (flags !== 'g') return { mode: 'regex', text: pattern };
  const text = pattern.replace(/\\([.*+?^$()|[\]{}\\])/g, '$1');
  if (escapeDisplayLiteral(text) !== pattern) return { mode: 'regex', text: pattern };
  if (text.startsWith('{{') && text.endsWith('}}') && text.length > 4)
    return { mode: 'marker', text: text.slice(2, -2) };
  return { mode: 'text', text };
}
