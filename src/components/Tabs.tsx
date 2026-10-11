import { useEffect, useRef, type ReactNode } from 'react';
import './Tabs.css';

export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  scrollable = false,
}: {
  label: string;
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  scrollable?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollable) return;
    const strip = root.current;
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!strip || !selected) return;
    // Move only this horizontal viewport; scrollIntoView can also scroll the page.
    const view = strip.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    if (tab.left < view.left) strip.scrollLeft += tab.left - view.left;
    else if (tab.right > view.right) strip.scrollLeft += tab.right - view.right;
  }, [value, scrollable]);
  return (
    <div
      ref={root}
      className={`work-info-tabs ${scrollable ? 'scrollable-tabs' : ''}`}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
            onChange(items[next].id);
            root.current
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus({ preventScroll: true });
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
