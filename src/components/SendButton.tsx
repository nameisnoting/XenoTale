import { ArrowUp, Square } from 'lucide-react';
import './SendButton.css';

export function SendButton({
  busy = false,
  disabled = false,
  label = '전송',
  stopLabel = '생성 중단',
  title,
  onSend,
  onStop,
}: {
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  stopLabel?: string;
  title?: string;
  onSend: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      className="send-button"
      data-state={busy ? 'stop' : 'send'}
      aria-label={busy ? stopLabel : label}
      title={busy ? stopLabel : (title ?? label)}
      disabled={!busy && disabled}
      onClick={busy ? onStop : onSend}
    >
      {busy ? <Square size={16} aria-hidden="true" /> : <ArrowUp size={22} aria-hidden="true" />}
    </button>
  );
}
