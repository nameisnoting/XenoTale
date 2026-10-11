const scriptJSON = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');

/** The authored code only sees this bridge and public play context, never app references or keys. */
export function effectDocument(content: string, runId: string) {
  const bridge = `(() => {
    'use strict';
    const runId = ${scriptJSON(runId)};
    let port, context;
    const pending = new Map();
    let counter = 0, resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    function freeze(value) {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    }
    function initialize(event) {
      if (event.source !== parent || event.data?.type !== 'xenotale-effect-init' ||
          event.data?.runId !== runId || !event.ports[0] || port) return;
      port = event.ports[0];
      context = freeze(event.data.context);
      window.removeEventListener('message', initialize);
      port.onmessage = event => {
        const message = event.data;
        const request = pending.get(message?.requestId);
        if (!request) return;
        pending.delete(message.requestId);
        clearTimeout(request.timer);
        if (message.ok) request.resolve(message.result);
        else request.reject(new Error(message.error || '요청을 처리하지 못했습니다.'));
      };
      port.start();
      resolveReady(context);
    }
    window.addEventListener('message', initialize);
    parent.postMessage({ type: 'xenotale-effect-ready', runId }, '*');
    async function request(type, payload) {
      await ready;
      const requestId = String(++counter);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('요청 시간이 초과되었습니다.')); }, 30000);
        pending.set(requestId, { resolve, reject, timer });
        port.postMessage({ type, requestId, payload });
      });
    }
    Object.defineProperty(window, 'XenoTale', { value: Object.freeze({
      ready,
      get context() { return context; },
      complete: result => request('complete', result),
      close: async () => { await ready; port.postMessage({ type: 'close' }); },
      screen: (name, duration = 800) => request('screen', { name, duration })
    }), writable: false, configurable: false });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); ready.then(() => port.postMessage({ type: 'close' })); }
    }, true);
  })();`;
  // The policy precedes all author markup. No same-origin privilege, external scripts, fetch,
  // child frames, workers, forms or popup permissions. HTTPS/data media are deliberately allowed.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; media-src https: data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; font-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<style>html,body{margin:0;min-height:100%;background:transparent;color:#fff;font:16px/1.6 sans-serif}*{box-sizing:border-box}img,video{max-width:100%}button{cursor:pointer}a{color:#5fddce}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}</style>
<script>${bridge}</script></head><body>${content}</body></html>`;
}
