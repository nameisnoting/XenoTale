import { formatCredits } from '../engine/credits';
import type { CreditBalance } from './useCreditBalance';

export function CreditBalanceButton({
  balance,
  onClick,
  actionLabel = '사용량 보기',
}: {
  balance: CreditBalance;
  onClick: () => void;
  actionLabel?: string;
}) {
  const label = !balance.hasKey
    ? '0'
    : balance.error
      ? '조회 불가'
      : balance.amount === null
        ? '…'
        : formatCredits(balance.amount);
  return (
    <button
      className="chat-cost"
      aria-label={actionLabel}
      aria-busy={balance.loading}
      title={balance.error || `OpenRouter 잔액 (USD) · ${actionLabel}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
