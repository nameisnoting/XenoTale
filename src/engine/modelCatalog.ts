import type { Model } from '../domain/types';

// Cancelling one send must not cancel the catalog shared by other screens.
export function waitForCatalog(request: Promise<Model[]>, signal?: AbortSignal) {
  if (!signal) return request;
  return new Promise<Model[]>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    request.then(
      (models) => {
        signal.removeEventListener('abort', abort);
        resolve(models);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
