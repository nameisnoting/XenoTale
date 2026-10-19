import { useLayoutEffect, useRef, type ComponentPropsWithRef } from 'react';
import './MessageInput.css';

// All conversation inputs share two-to-eight visible lines, including wrapped text.
// Chat readers keep their position even when the footer changes height.
// The creator supporter can continue following the bottom during input resizing.
export function MessageInput({
  ref,
  value,
  className = '',
  ...props
}: ComponentPropsWithRef<'textarea'>) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const anchor = useRef({ top: 0, atBottom: true, height: 0 });
  const transcriptRef = useRef<HTMLElement | null>(null);
  const resize = () => {
    const element = field.current;
    if (!element) return;
    const transcript = transcriptRef.current;
    const top = transcript?.scrollTop ?? 0;
    const atBottom = !transcript || transcript.scrollHeight - transcript.clientHeight - top <= 2;
    const style = getComputedStyle(element);
    const line = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const min = line * 2 + padding + border;
    const max = line * 8 + padding + border;
    element.style.height = '0px';
    const wanted = element.scrollHeight + border;
    element.style.height = `${Math.max(min, Math.min(max, wanted))}px`;
    element.style.overflowY = wanted > max ? 'auto' : 'hidden';
    if (transcript && transcript.clientHeight > 0) {
      transcript.scrollTop =
        atBottom && transcript.classList.contains('support-transcript')
          ? transcript.scrollHeight
          : top;
      anchor.current = { top: transcript.scrollTop, atBottom, height: transcript.clientHeight };
    }
  };
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const container = element.closest('.chat-main, .assistant, .creator-test');
    const transcript = container?.querySelector<HTMLElement>('.chat-scroll, .support-transcript');
    transcriptRef.current = transcript ?? null;
    anchor.current = {
      top: transcript?.scrollTop ?? 0,
      atBottom:
        !transcript ||
        transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 2,
      height: transcript?.clientHeight ?? 0,
    };
    const remember = () => {
      if (!transcript) return;
      // A viewport resize is restored before its resulting scroll event is remembered.
      if (transcript.clientHeight !== anchor.current.height) return;
      anchor.current.top = transcript.scrollTop;
      anchor.current.atBottom =
        transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 2;
    };
    const viewport = new ResizeObserver(() => {
      if (!transcript || transcript.clientHeight === anchor.current.height) return;
      anchor.current.height = transcript.clientHeight;
      if (!anchor.current.height) return;
      transcript.scrollTop =
        anchor.current.atBottom && transcript.classList.contains('support-transcript')
          ? transcript.scrollHeight
          : anchor.current.top;
      anchor.current.top = transcript.scrollTop;
    });
    if (transcript) {
      transcript.addEventListener('scroll', remember, { passive: true });
      viewport.observe(transcript);
    }
    let width = element.clientWidth;
    const sizing = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });
    sizing.observe(element);
    const manual = new MutationObserver(() => resize());
    const composer = element.closest('.resizable-composer');
    if (composer) manual.observe(composer, { attributes: true, attributeFilter: ['data-manual'] });
    return () => {
      viewport.disconnect();
      sizing.disconnect();
      manual.disconnect();
      transcript?.removeEventListener('scroll', remember);
    };
  }, []);
  useLayoutEffect(resize, [value]);
  return (
    <textarea
      {...props}
      rows={2}
      value={value}
      className={`message-input ${className}`}
      ref={(element) => {
        field.current = element;
        if (typeof ref === 'function') return ref(element);
        if (ref) ref.current = element;
      }}
    />
  );
}
