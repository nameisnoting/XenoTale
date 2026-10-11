import { useEffect, useState } from 'react';
export function navigate(path: string, replace = false) {
  if (replace) {
    window.history.replaceState(window.history.state, '', `#${path}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  const previous = window.location.hash.slice(1) || '/';
  window.location.hash = path;
  if (previous !== path)
    window.history.replaceState({ ...window.history.state, xenotaleFrom: previous }, '');
}
export function navigateBack(fallback: string) {
  if (window.history.state?.xenotaleFrom === fallback) window.history.back();
  else navigate(fallback, true);
}
export function useRoute() {
  const [path, setPath] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const update = () => setPath(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return path;
}
