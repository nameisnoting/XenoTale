import { formatCredits } from '../engine/credits';
import type { CreditBalance } from './useCreditBalance';

export function CreditBalanceButton({
  balance,
  onClick,
}: {
  balance: CreditBalance;
  onClick: () => void;
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
      aria-label="사용량 보기"
      aria-busy={balance.loading}
      title={balance.error || 'OpenRouter 잔액 (USD) · 사용량 보기'}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
