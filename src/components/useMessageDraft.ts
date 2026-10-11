import { useEffect, useRef, useState, type SetStateAction } from 'react';

// Save synchronously so navigation or refresh immediately after typing keeps the draft.
// Drafts are UI state; they do not change room revisions or enter the AI conversation.
export function useMessageDraft(key: string, fallback = '') {
  const storageKey = `xenotale.message-draft.${key}`;
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const current = useRef(value);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const setDraft = (update: SetStateAction<string>) => {
    const next = typeof update === 'function' ? update(current.current) : update;
    current.current = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Typing remains available if the browser disallows local storage.
    }
    setValue(next);
  };
  const beginSend = () => {
    const text = current.current;
    current.current = '';
    setValue('');
    // Keep the saved copy until completion so refresh during a request recovers it.
    // Typing a new draft replaces that copy and must survive either outcome.
    return {
      text,
      complete: () => {
        if (mounted.current) setDraft(current.current);
      },
      restore: () => {
        if (mounted.current) setDraft((value) => value || text);
      },
    };
  };
  return [value, setDraft, beginSend] as const;
}
