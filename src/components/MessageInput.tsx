import { useLayoutEffect, useRef, type ComponentPropsWithRef, type RefObject } from 'react';
import { useMediaQuery } from './useMediaQuery';
import './MessageInput.css';

// All conversation inputs share two-to-eight visible lines, including wrapped text.
// Chat readers keep their position even when the footer changes height.
// The creator supporter can continue following the bottom during input resizing.
export function MessageInput({
  ref,
  value,
  className = '',
  followFooterResize,
  resetScrollAnchor,
  onSend,
  ...props
}: Omit<ComponentPropsWithRef<'textarea'>, 'onKeyDown' | 'enterKeyHint'> & {
  onSend: () => void;
  followFooterResize?: RefObject<boolean>;
  resetScrollAnchor?: RefObject<((target?: HTMLElement) => void) | null>;
}) {
  // Touch-first devices also need newline Enter in landscape or tablet layouts.
  const mobileKeyboard = useMediaQuery('(max-width: 800px), (pointer: coarse)');
  const footerPolicy = useRef(followFooterResize);
  footerPolicy.current = followFooterResize;
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
      const nextTop =
        atBottom && transcript.classList.contains('support-transcript')
          ? Math.max(0, transcript.scrollHeight - transcript.clientHeight)
          : top;
      if (Math.abs(transcript.scrollTop - nextTop) > 0.5) transcript.scrollTop = nextTop;
      anchor.current = { top: transcript.scrollTop, atBottom, height: transcript.clientHeight };
    }
  };
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const container = element.closest('.chat-main, .assistant, .creator-test');
    const transcript = container?.querySelector<HTMLElement>('.chat-scroll, .support-transcript');
    transcriptRef.current = transcript ?? null;
    const header = container?.querySelector<HTMLElement>('.chat-header');
    let headerHeight = header?.getBoundingClientRect().height ?? 0;
    let userScrollUntil = 0;
    let content: HTMLElement | null | undefined;
    let readingTarget: { element: HTMLElement; offset: number } | undefined;
    // Explicit navigation establishes a new reading position before resize
    // anchoring resumes; the old mode's viewport must not restore its position.
    const snapshot = () => {
      anchor.current = {
        top: transcript?.scrollTop ?? 0,
        atBottom:
          !transcript ||
          transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 2,
        height: transcript?.clientHeight ?? 0,
      };
    };
    snapshot();
    const remember = () => {
      if (!transcript) return;
      const userScrolling = performance.now() < userScrollUntil;
      // Scroll events continue during a touch fling after the finger lifts.
      if (userScrolling) userScrollUntil = performance.now() + 200;
      // Preserve resize anchoring, but let the reader interrupt an expanding tray
      // by scrolling upward before its next ResizeObserver notification.
      if (
        transcript.clientHeight !== anchor.current.height &&
        !userScrolling &&
        !(footerPolicy.current?.current && transcript.scrollTop < anchor.current.top - 1)
      )
        return;
      anchor.current.top = transcript.scrollTop;
      anchor.current.atBottom =
        transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop <= 2;
    };
    const viewport = new ResizeObserver(() => {
      if (!transcript) return;
      const nextHeaderHeight = header?.getBoundingClientRect().height ?? 0;
      const headerResizing = Math.abs(nextHeaderHeight - headerHeight) > 0.1;
      headerHeight = nextHeaderHeight;
      if (readingTarget) {
        if (readingTarget.element.isConnected) {
          // HTML status frames and images above the requested passage can grow
          // after navigation. Anchor to the passage, not an obsolete pixel top.
          const shift =
            readingTarget.element.getBoundingClientRect().top -
            transcript.getBoundingClientRect().top -
            readingTarget.offset;
          if (Math.abs(shift) > 0.5) transcript.scrollTop += shift;
          snapshot();
          return;
        }
        reset();
      }
      // The auto-hiding header animates while the reader is scrolling. Restoring
      // an old scrollTop here would fight wheel/touch momentum on every frame.
      // Explicit mode/chapter navigation above still anchors its target passage.
      if (
        headerResizing ||
        (performance.now() < userScrollUntil && !footerPolicy.current?.current)
      ) {
        snapshot();
        return;
      }
      if (transcript.clientHeight === anchor.current.height) return;
      anchor.current.height = transcript.clientHeight;
      if (!anchor.current.height) return;
      const nextTop =
        anchor.current.atBottom &&
        (transcript.classList.contains('support-transcript') || footerPolicy.current?.current)
          ? Math.max(0, transcript.scrollHeight - transcript.clientHeight)
          : anchor.current.top;
      if (Math.abs(transcript.scrollTop - nextTop) > 0.5) transcript.scrollTop = nextTop;
      anchor.current.top = transcript.scrollTop;
    });
    const reset = (target?: HTMLElement) => {
      if (content) viewport.unobserve(content);
      readingTarget = target
        ? {
            element: target,
            offset: parseFloat(getComputedStyle(target).scrollMarginTop) || 0,
          }
        : undefined;
      // The novel column is recreated when switching back from visual novel.
      content = target ? transcript?.querySelector<HTMLElement>(':scope > .chat-column') : null;
      if (content) viewport.observe(content);
      snapshot();
    };
    if (resetScrollAnchor) resetScrollAnchor.current = reset;
    const release = () => {
      userScrollUntil = performance.now() + 200;
      if (readingTarget) reset();
    };
    const releaseOnKey = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
        release();
    };
    if (transcript) {
      transcript.addEventListener('scroll', remember, { passive: true });
      transcript.addEventListener('wheel', release, { passive: true });
      transcript.addEventListener('touchstart', release, { passive: true });
      transcript.addEventListener('touchmove', release, { passive: true });
      transcript.addEventListener('pointerdown', release, { passive: true });
      transcript.addEventListener('keydown', releaseOnKey);
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
      if (resetScrollAnchor?.current === reset) resetScrollAnchor.current = null;
      viewport.disconnect();
      sizing.disconnect();
      manual.disconnect();
      transcript?.removeEventListener('scroll', remember);
      transcript?.removeEventListener('wheel', release);
      transcript?.removeEventListener('touchstart', release);
      transcript?.removeEventListener('touchmove', release);
      transcript?.removeEventListener('pointerdown', release);
      transcript?.removeEventListener('keydown', releaseOnKey);
    };
  }, []);
  useLayoutEffect(resize, [value]);
  return (
    <textarea
      {...props}
      rows={2}
      value={value}
      enterKeyHint={mobileKeyboard ? 'enter' : 'send'}
      onKeyDown={(event) => {
        if (
          !mobileKeyboard &&
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229
        ) {
          event.preventDefault();
          if (!props.disabled) onSend();
        }
      }}
      className={`message-input ${className}`}
      ref={(element) => {
        field.current = element;
        if (typeof ref === 'function') return ref(element);
        if (ref) ref.current = element;
      }}
    />
  );
}
