import { AuthoredContent } from './DesignControls';
import './PlayGuide.css';

export function PlayGuide({
  content,
  className = '',
  label,
}: {
  content: string;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`play-guide ${className}`}
      role={label ? 'region' : undefined}
      aria-label={label}
    >
      <AuthoredContent content={content} title="플레이가이드" unframed />
    </div>
  );
}
