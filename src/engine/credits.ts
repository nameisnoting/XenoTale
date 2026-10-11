export class CreditsError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export async function readCredits(key: string, signal?: AbortSignal): Promise<number> {
  if (!key.trim()) return 0;
  const response = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: { Authorization: `Bearer ${key.trim()}` },
    cache: 'no-store',
    signal,
  });
  if (!response.ok)
    throw new CreditsError(
      response.status === 403
        ? '이 API 키에는 계정 잔액 조회 권한이 없습니다. OpenRouter에서 잔액을 확인해 주세요.'
        : response.status === 401
          ? 'API 키가 유효하지 않습니다. 마이페이지에서 다시 연결해 주세요.'
          : '잔액을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      response.status,
    );
  const { data } = await response.json();
  if (
    typeof data?.total_credits !== 'number' ||
    !Number.isFinite(data.total_credits) ||
    typeof data?.total_usage !== 'number' ||
    !Number.isFinite(data.total_usage)
  )
    throw new CreditsError('OpenRouter가 잔액 정보를 반환하지 않았습니다.');
  const remaining = data.total_credits - data.total_usage;
  if (!Number.isFinite(remaining)) throw new CreditsError('잔액 정보가 올바르지 않습니다.');
  return remaining;
}

export function formatCredits(value: number): string {
  if (value === 0) return '0';
  const absolute = Math.abs(value);
  if (absolute < 0.000001) return value < 0 ? '>−$0.000001' : '<$0.000001';
  const digits = absolute.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return `${value < 0 ? '−' : ''}$${digits}`;
}
