import type { Turn } from '../domain/types';

export function CandidatePager({
  turn,
  candidateId,
  disabled,
  onChoose,
}: {
  turn: Turn;
  candidateId: string;
  disabled: boolean;
  onChoose: (index: number) => void;
}) {
  if (turn.candidates.length < 2) return null;
  const index = turn.candidates.findIndex((candidate) => candidate.id === candidateId);
  return (
    <div className="candidate-pager">
      <button
        aria-label="이전 응답"
        disabled={disabled || index <= 0}
        onClick={() => onChoose(index - 1)}
      >
        <img src="/icons/chevron-left.png" alt="" />
      </button>
      <span>
        {index + 1} / {turn.candidates.length}
      </span>
      <button
        aria-label="다음 응답"
        disabled={disabled || index >= turn.candidates.length - 1}
        onClick={() => onChoose(index + 1)}
      >
        <img src="/icons/chevron-right.png" alt="" />
      </button>
    </div>
  );
}
