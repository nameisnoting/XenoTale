import type { ReactNode } from 'react';
import {
  Wrench,
  List,
  GraduationCap,
  BookOpen,
  CirclePlus,
  FilePenLine,
  Image,
  Network,
  Settings,
  SlidersHorizontal,
  VenetianMask,
  ShoppingBag,
} from 'lucide-react';
import './IconRail.css';

// Raster artwork remains available for icons that are already rendered at their native size.
const vectorIcons: Record<string, ReactNode> = {
  wrench: <Wrench strokeWidth={1.75} />,
  list: <List strokeWidth={1.75} />,
  'graduation-cap': <GraduationCap strokeWidth={1.75} />,
  'book-open': <BookOpen strokeWidth={1.75} />,
  'venetian-mask': <VenetianMask strokeWidth={1.75} />,
  image: <Image strokeWidth={1.75} />,
  'circum_bag-1': <ShoppingBag strokeWidth={1.75} />,
  network: <Network strokeWidth={1.75} />,
  settings: <Settings strokeWidth={1.75} />,
  'settings-2': <SlidersHorizontal strokeWidth={1.75} />,
  'file-signature': <FilePenLine strokeWidth={1.75} />,
  'plus-circle': <CirclePlus strokeWidth={1.75} />,
  'mdi_relation-one-or-many-to-zero-or-one': (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3v8m4-8v8M2 3l4 4-4 4M6 7h6v10h1m4 0h5m-3-4v8" />
      <circle cx="15" cy="17" r="2" />
    </svg>
  ),
  'ic_outline-sd-storage': (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6zm2 2v4m3-4v4m3-4v4" />
    </svg>
  ),
};

export type RailItem = {
  id: string;
  label: string;
  icon: string | ReactNode;
  active?: boolean;
  className?: string;
  onClick: () => void;
};

// Both workspaces use the same icon size, selected background, and label layout.
export function IconRail({
  items,
  label,
  className = '',
}: {
  items: RailItem[];
  label: string;
  className?: string;
}) {
  return (
    <nav className={`icon-rail ${className}`} aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          aria-label={item.label}
          aria-pressed={item.active === undefined ? undefined : item.active}
          className={`${item.active ? 'active' : ''} ${item.className ?? ''}`}
          onClick={item.onClick}
        >
          <span className="rail-icon">
            {typeof item.icon === 'string'
              ? (vectorIcons[item.icon] ?? <img src={`/icons/chat/${item.icon}.png`} alt="" />)
              : item.icon}
          </span>
          <span className="rail-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
