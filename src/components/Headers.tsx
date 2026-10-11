import type { ReactNode } from 'react';
import { ChevronLeft, PanelRightOpen } from 'lucide-react';
import { IconButton } from './UI';
import './Headers.css';

export function PageHeader({
  title,
  onBack,
  backLabel = '메인으로',
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <header className="page-header">
      <IconButton title={backLabel} hover="text" onClick={onBack}>
        <ChevronLeft />
      </IconButton>
      <h1>{title}</h1>
    </header>
  );
}
export function PanelHeader({
  title,
  leading,
  children,
  className = '',
}: {
  title: string;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`panel-header ${className}`}>
      {leading}
      <h2>{title}</h2>
      {children}
    </header>
  );
}
// Kept outside the hidden panel so reopening never depends on hidden controls.
export function CollapsedPanel({
  title,
  onExpand,
  children,
}: {
  title: string;
  onExpand: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="collapsed-panel" aria-label={`${title} 접힘`}>
      <strong>{title}</strong>
      {children}
      <IconButton title={`${title} 펼치기`} aria-expanded={false} onClick={onExpand}>
        <PanelRightOpen size={19} />
      </IconButton>
    </div>
  );
}
