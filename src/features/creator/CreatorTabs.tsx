import { Tabs } from '../../components/Tabs';
import { useState } from 'react';

export function useCreatorTab<T extends string>(
  workId: string,
  section: string,
  values: readonly T[],
) {
  const key = `xenotale.creator-tab.${workId}.${section}`;
  const [tab, setTab] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key) as T;
      if (values.includes(saved)) return saved;
    } catch {
      /* Editing works without browser preference storage. */
    }
    return values[0];
  });
  return [
    tab,
    (next: T) => {
      setTab(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* Optional preference. */
      }
    },
  ] as const;
}

/** Shared sticky navigation for creator sections with several editing views. */
export function CreatorTabs<T extends string>(props: {
  label: string;
  items: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="creator-sticky-tabs">
      <Tabs {...props} />
    </div>
  );
}
