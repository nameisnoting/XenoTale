// Native input preserves the textarea undo history for edits initiated by buttons.
export function insertTextWithUndo(
  area: HTMLTextAreaElement,
  text: string,
  fallback: (value: string) => void,
) {
  const start = area.selectionStart;
  const end = area.selectionEnd;
  const next = area.value.slice(0, start) + text + area.value.slice(end);
  area.focus({ preventScroll: true });
  area.setSelectionRange(start, end);
  let changed = false;
  const onInput = () => {
    changed = true;
  };
  area.addEventListener('input', onInput);
  try {
    area.ownerDocument.execCommand('insertText', false, text);
  } catch {
    // Older browsers retain insertion support through the controlled value.
  } finally {
    area.removeEventListener('input', onInput);
  }
  if (!changed) fallback(next);
}
