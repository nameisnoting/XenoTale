import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { Area } from './UI';
import { insertTextWithUndo } from './textEditing';

export function SnippetArea({
  snippets,
  ...props
}: ComponentProps<typeof Area> & {
  snippets: { key?: string; label: string; text: string; cursorOffset?: number }[];
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (cursor.current === null || !input.current) return;
    input.current.focus({ preventScroll: true });
    input.current.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  }, [props.value]);
  return (
    <>
      <Area {...props} inputRef={input} />
      <div className="tab-pills snippet-actions">
        {snippets.map(({ key, label, text, cursorOffset }) => (
          <button
            key={key ?? label}
            type="button"
            disabled={props.readOnly}
            onClick={() => {
              const area = input.current;
              if (!area) return;
              const start = area.selectionStart;
              const end = area.selectionEnd;
              cursor.current = start + (cursorOffset ?? text.length);
              const next = props.value.slice(0, start) + text + props.value.slice(end);
              area.focus({ preventScroll: true });
              area.setSelectionRange(start, end);
              if (next === props.value) {
                area.setSelectionRange(cursor.current, cursor.current);
                cursor.current = null;
                return;
              }
              insertTextWithUndo(area, text, props.onChange);
              if (area.value === next && cursor.current !== null) {
                area.setSelectionRange(cursor.current, cursor.current);
                cursor.current = null;
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
