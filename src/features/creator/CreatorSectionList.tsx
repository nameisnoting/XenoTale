import { ChevronDown } from 'lucide-react';
import { basicSections, extraSections } from './sections';

export function CreatorSectionList({
  section,
  onSelect,
  expanded,
  onToggle,
  tabbed = false,
}: {
  section: string;
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
  tabbed?: boolean;
}) {
  const render = (item: (typeof basicSections)[number]) => (
    <button
      role={tabbed ? 'tab' : undefined}
      aria-selected={tabbed ? section === item.id : undefined}
      key={item.id}
      className={section === item.id ? 'active' : ''}
      onClick={() => onSelect(item.id)}
    >
      {item.name}
      {'required' in item && item.required && <i> *</i>}
    </button>
  );
  return (
    <div
      className="creator-sections"
      role={tabbed ? 'tablist' : undefined}
      aria-label={tabbed ? '제작 단계' : undefined}
    >
      {basicSections.map(render)}
      <button className="creator-extras-toggle" aria-expanded={expanded} onClick={onToggle}>
        추가 요소{' '}
        <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && extraSections.map(render)}
    </div>
  );
}
