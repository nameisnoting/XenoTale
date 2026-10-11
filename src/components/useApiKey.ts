import { useEffect, useRef, useState } from 'react';
import { db, useLive } from '../persistence/db';
import { decryptCredential, saveApiKey } from '../persistence/credentials';
import { useNotify } from './UI';

export function useApiKey() {
  const [apiKey, update] = useState('');
  const [ready, setReady] = useState(false);
  const pending = useRef(0);
  const revision = useRef(0);
  const notify = useNotify();
  const saved = useLive(
    async () => ({ record: await db.credentials.get('openrouter') }),
    undefined,
  );
  useEffect(() => {
    if (!saved || pending.current) return;
    let cancelled = false;
    const version = revision.current;
    decryptCredential(saved.record)
      .then((value) => {
        if (!cancelled && revision.current === version) update(value);
      })
      .catch((error) => {
        if (!cancelled) notify(error.message);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [saved, notify]);
  const setApiKey = (value: string) => {
    update(value);
    revision.current++;
    pending.current++;
    void saveApiKey(value)
      .catch(() =>
        notify(
          'API 키를 저장하지 못했습니다. 현재 입력은 유지되지만 새로고침하면 사라질 수 있습니다.',
        ),
      )
      .finally(() => {
        pending.current--;
      });
  };
  return { apiKey, setApiKey, keyReady: ready };
}
