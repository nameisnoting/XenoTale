import { useLayoutEffect, useRef, useState } from 'react';
import './SuggestionButtons.css';

export function SuggestionButtons({
  choices,
  onSelect,
}: {
  choices: string[];
  onSelect: (text: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState('wrap');
  const texts = choices.filter(Boolean);
  const key = JSON.stringify(texts);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let disposed = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const measure = () => {
      const buttons = [...node.querySelectorAll('button')];
      if (disposed || !context || buttons.length !== 3) return;
      const width = node.clientWidth;
      const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
      const widths = buttons.map((button) => {
        const style = getComputedStyle(button);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = button.textContent || '';
        return (
          context.measureText(text).width +
          (parseFloat(style.letterSpacing) || 0) * Math.max(0, text.length - 1) +
          [
            style.paddingLeft,
            style.paddingRight,
            style.borderLeftWidth,
            style.borderRightWidth,
          ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0) +
          2
        );
      });
      setLayout(
        widths.reduce((sum, value) => sum + value, gap * 2) <= width
          ? 'inline'
          : widths[1] + widths[2] + gap <= width
            ? 'split'
            : 'stack',
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [key]);
  return (
    <div className="suggestions" ref={root} data-layout={texts.length === 3 ? layout : 'wrap'}>
      {texts.map((text, i) => (
        <button key={i} onClick={() => onSelect(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}
