import type { ReactNode } from 'react';
import './StoryIntro.css';

// Openings and chapter prologues share the same narrative heading and body layout.
export function StoryIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="story-intro">
        <h2>{title}</h2>
      </div>
      {children}
    </>
  );
}
