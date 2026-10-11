import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditsError, readCredits } from '../engine/credits';

export type CreditBalance = {
  amount: number | null;
  loading: boolean;
  error: string;
  hasKey: boolean;
  refresh: (force?: boolean) => void;
};

export function useCreditBalance(apiKey: string): CreditBalance {
  const hasKey = !!apiKey.trim();
  const [state, setState] = useState({
    amount: hasKey ? null : (0 as number | null),
    loading: hasKey,
    error: '',
  });
  const request = useRef<(force?: boolean) => void>(() => {});
  const refresh = useCallback((force = false) => request.current(force), []);
  useEffect(() => {
    let disposed = false,
      active: AbortController | null = null,
      queued = false,
      denied = false;
    setState({ amount: hasKey ? null : 0, loading: hasKey, error: '' });
    const load = async (force = false) => {
      if (!hasKey || disposed || (denied && !force)) return;
      if (active) {
        queued = true;
        return;
      }
      const controller = new AbortController();
      active = controller;
      const timer = window.setTimeout(() => controller.abort(), 10000);
      setState((previous) => ({ ...previous, loading: true }));
      try {
        const amount = await readCredits(apiKey, controller.signal);
        if (!disposed) {
          denied = false;
          setState({ amount, loading: false, error: '' });
        }
      } catch (error) {
        if (!disposed) {
          denied = error instanceof CreditsError && [401, 403].includes(error.status ?? 0);
          setState({
            amount: null,
            loading: false,
            error: controller.signal.aborted
              ? '잔액 조회 시간이 초과되었습니다. 다시 시도해 주세요.'
              : error instanceof CreditsError
                ? error.message
                : '잔액을 조회하지 못했습니다. 연결을 확인해 주세요.',
          });
        }
      } finally {
        window.clearTimeout(timer);
        active = null;
        if (queued && !disposed) {
          queued = false;
          void load();
        }
      }
    };
    request.current = (force) => {
      void load(force);
    };
    void load();
    const visible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = hasKey ? window.setInterval(visible, 60000) : undefined;
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      active?.abort();
      request.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [apiKey, hasKey]);
  return { ...state, hasKey, refresh };
}
