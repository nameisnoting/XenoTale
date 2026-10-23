import type { ReactNode, RefObject } from 'react';
import { useScrollHeader } from './useScrollHeader';

// Scroll visibility belongs to the header, so toggling it never reparses the story.
export function ReadingHeader({
  scroll,
  pinned,
  visualNovel,
  hidden,
  children,
  modeSwitch,
}: {
  scroll: RefObject<HTMLElement | null>;
  pinned: boolean;
  visualNovel: boolean;
  hidden: boolean;
  children: ReactNode;
  modeSwitch: ReactNode;
}) {
  const collapsed = useScrollHeader(scroll) && !pinned && !visualNovel;
  return (
    <>
      <header
        className={`chat-header ${collapsed ? 'is-scroll-hidden' : ''}`}
        inert={hidden || collapsed}
        aria-hidden={hidden || collapsed}
      >
        {children}
      </header>
      {!visualNovel && (
        <div className={`novel-mode-switch-position ${collapsed ? 'is-scroll-hidden' : ''}`}>
          {modeSwitch}
        </div>
      )}
    </>
  );
}
