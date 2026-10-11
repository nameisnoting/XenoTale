import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

export type SelectOption = { value: string; label: string };
export function Select({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typing = useRef({ text: '', time: 0 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const close = () => setOpen(false);
  const choose = (index: number) => {
    if (!options[index]) return;
    onChange(options[index].value);
    close();
    anchor.current?.focus();
  };
  const show = () => {
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const element = list.current;
    // The browser's top layer works inside a modal dialog too, without escaping its focus scope.
    element.showPopover();
    const update = () => {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 16;
      const top = (viewport?.offsetTop ?? 0) + 16;
      const right = left + (viewport?.width ?? innerWidth) - 32;
      const bottom = top + (viewport?.height ?? innerHeight) - 32;
      const above = Math.max(0, rect.top - top - 8);
      const below = Math.max(0, bottom - rect.bottom - 8);
      const down = below >= 120 || below >= above;
      const height = Math.min(240, down ? below : above);
      const width = Math.min(Math.max(rect.width, 180), right - left);
      element.style.width = `${width}px`;
      element.style.maxHeight = `${height}px`;
      element.style.left = `${Math.max(left, Math.min(rect.left, right - width))}px`;
      element.style.top = `${down ? rect.bottom + 8 : Math.max(top, rect.top - 8 - Math.min(element.scrollHeight + 2, height))}px`;
    };
    const outside = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as Node) &&
        !element.contains(event.target as Node)
      )
        close();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (anchor.current) observer.observe(anchor.current);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open)
      list.current
        ?.querySelector(`#${CSS.escape(`${listId}-${active}`)}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      setActive((index) =>
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : Math.max(
                0,
                Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
      );
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text =
        (now - typing.current.time < 600 ? typing.current.text : '') +
        event.key.toLocaleLowerCase();
      typing.current = { text, time: now };
      const index = options.findIndex((option) =>
        option.label.toLocaleLowerCase().startsWith(text),
      );
      if (index >= 0) {
        if (!open) setOpen(true);
        setActive(index);
      }
    }
  };
  return (
    <div className="design-select">
      <button
        ref={anchor}
        type="button"
        className="design-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={keyboard}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget as Node)) close();
        }}
      >
        <span>{options[selectedIndex]?.label ?? '선택하세요'}</span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      <div
        ref={list}
        id={listId}
        className="design-select-list"
        role="listbox"
        aria-label={label}
        aria-labelledby={
          label ? undefined : (anchor.current?.getAttribute('aria-labelledby') ?? undefined)
        }
        popover="manual"
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={value === option.value}
            className={active === index ? 'is-active' : ''}
            onPointerMove={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>{option.label}</span>
            {value === option.value && <Check size={16} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}
