import type { ButtonHTMLAttributes } from 'react';
import { RotateCcw } from 'lucide-react';
import { ActionButton } from './UI';
import './ResetButton.css';

export function ResetButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ActionButton {...props} className={`prompt-reset ${className}`}>
      <RotateCcw size={16} />
      초기화
    </ActionButton>
  );
}
