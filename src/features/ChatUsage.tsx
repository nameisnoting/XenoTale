import type { Room } from '../domain/types';
import { roomUsage } from '../domain/usage';
import { reportedCost } from './ChatWorkspace';
import type { CreditBalance } from '../components/useCreditBalance';
import { formatCredits } from '../engine/credits';
import { Button } from '../components/UI';
import './ChatUsage.css';
export function ChatUsage({ room, balance }: { room: Room; balance: CreditBalance }) {
  const uses = roomUsage(room);
  return (
    <section className="chat-usage" aria-label="대화 사용량">
      <div className="account-credit">
        <h3>OpenRouter 잔액</h3>
        <strong aria-live="polite">
          {!balance.hasKey
            ? '0'
            : balance.error
              ? '조회 불가'
              : balance.amount === null
                ? '조회 중…'
                : formatCredits(balance.amount)}
        </strong>
        <p className="muted">
          {!balance.hasKey
            ? 'API 키를 연결하면 계정 잔액을 조회합니다.'
            : balance.error ||
              '계정 전체 잔액입니다. 단위는 USD이며 모델마다 사용할 수 있는 토큰 수가 다릅니다.'}
        </p>
        {balance.hasKey && (
          <Button disabled={balance.loading} onClick={() => balance.refresh(true)}>
            {balance.loading ? '조회 중…' : '잔액 새로고침'}
          </Button>
        )}
      </div>
      <p className="muted">
        아래 사용량과 누적 비용은 이 대화에 저장된 모든 응답 후보와 AI 챕터 도입부의 합계입니다.
      </p>
      <dl className="stat-list">
        <dt>입력 토큰</dt>
        <dd>{uses.reduce((s, u) => s + (u.input ?? 0), 0).toLocaleString()}</dd>
        <dt>출력 토큰</dt>
        <dd>{uses.reduce((s, u) => s + (u.output ?? 0), 0).toLocaleString()}</dd>
        <dt>캐시 읽기</dt>
        <dd>{uses.reduce((s, u) => s + (u.cacheRead ?? 0), 0).toLocaleString()}</dd>
        <dt>보고된 비용</dt>
        <dd>{reportedCost(room)}</dd>
      </dl>
      <p className="muted">
        체험 모드는 API를 호출하지 않습니다. 비용 미보고 모델, 실패한 요청, 서포터·요약의 비용은 이
        합계에 포함되지 않습니다. 전체 사용량과 잔액은 OpenRouter에서 확인해 주세요.
      </p>
      <a
        className="credit-topup"
        href="https://openrouter.ai/settings/credits"
        target="_blank"
        rel="noopener noreferrer"
      >
        토큰 충전 · OpenRouter
      </a>
    </section>
  );
}
