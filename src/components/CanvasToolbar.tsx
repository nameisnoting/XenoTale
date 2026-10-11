import type { ReactNode, Ref } from 'react';
import { Minus, Plus, RefreshCw } from 'lucide-react';
import { IconButton } from './UI';
import './CanvasToolbar.css';

export function CanvasToolbar({
  name,
  scale,
  min,
  max,
  step,
  onZoom,
  onReset,
  children,
  leading,
  zoomInLabel = `${name} 확대`,
  resetLabel = `${name} 보기 초기화`,
  className = '',
  ref,
}: {
  name: string;
  scale: number;
  min: number;
  max: number;
  step: number;
  onZoom: (scale: number) => void;
  onReset: () => void;
  children?: ReactNode;
  leading?: ReactNode;
  zoomInLabel?: string;
  resetLabel?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className={`graph-toolbar ${className}`}
      ref={ref}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {leading}
      <IconButton
        title={`${name} 축소`}
        disabled={scale <= min}
        onClick={() => onZoom(Math.max(min, +(scale - step).toFixed(3)))}
      >
        <Minus size={16} />
      </IconButton>
      <output aria-label={`${name} 배율`}>{Math.round(scale * 100)}%</output>
      <IconButton
        title={zoomInLabel}
        disabled={scale >= max}
        onClick={() => onZoom(Math.min(max, +(scale + step).toFixed(3)))}
      >
        <Plus size={16} />
      </IconButton>
      <IconButton title={resetLabel} onClick={onReset}>
        <RefreshCw size={16} />
      </IconButton>
      {children}
    </div>
  );
}
