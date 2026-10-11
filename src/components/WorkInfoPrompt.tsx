import { Info } from 'lucide-react';
import { ActionButton } from './UI';
import './WorkInfoPrompt.css';

export function WorkInfoPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <ActionButton className="work-info-prompt" hover="none" onClick={onOpen}>
      <Info size={24} strokeWidth={1.75} aria-hidden="true" />
      <span>작품 정보 확인</span>
    </ActionButton>
  );
}
