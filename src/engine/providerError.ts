const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Read explanations only, never stringify provider payloads or echoed requests. */
export function modelError(status: number, payload: unknown, apiKey = '') {
  const error = record(record(payload)?.error);
  const metadata = record(error?.metadata);
  const code = typeof error?.code === 'number' ? error.code : status;
  const summary =
    code === 401
      ? 'API 키를 다시 확인해 주세요.'
      : code === 402
        ? 'OpenRouter 잔액이 부족합니다.'
        : code === 429
          ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
          : code === 400
            ? '모델 요청에 실패했습니다 (400). 모델이 요청 형식이나 옵션을 거절했습니다.'
            : code === 200
              ? '모델이 답변 생성 중 오류를 반환했습니다.'
              : `모델 요청에 실패했습니다 (${code}).`;
  const clean = (value: unknown) => {
    if (typeof value !== 'string') return '';
    let text = value;
    if (apiKey) text = text.split(apiKey).join('[API 키 숨김]');
    return text
      .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [API 키 숨김]')
      .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[API 키 숨김]')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 800);
  };
  let raw: unknown = metadata?.raw;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = undefined;
    }
  }
  // OpenRouter often wraps Google's detailed validation error as "Provider returned error".
  const providerMessage = record(record(raw)?.error)?.message;
  const details = [...new Set([clean(error?.message), clean(providerMessage)].filter(Boolean))];
  const provider = clean(metadata?.provider_name).slice(0, 80);
  return new Error(
    [summary, details.length ? `${provider ? provider + ': ' : ''}${details.join(' · ')}` : '']
      .filter(Boolean)
      .join('\n'),
  );
}

export async function readModelError(response: Response, apiKey = '') {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
  }
  return modelError(response.status, payload, apiKey);
}
