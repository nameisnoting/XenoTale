import { useEffect, useMemo, useRef, useState } from 'react';
import './AuthoredHtml.css';

// Only the app's nonce-bearing resize script runs. Authored scripts, event handlers,
// top-level navigation, and access to the parent's origin remain blocked.
export function AuthoredHtml({ content, title }: { content: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const document = useMemo(() => {
    const token = crypto.randomUUID().replaceAll('-', '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; img-src data: https:; font-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:transparent;color:#fff;font:14px/1.8 sans-serif;overflow-wrap:anywhere}#authored-content{display:flow-root}img{max-width:100%}a{color:#5fddce}</style></head><body><div id="authored-content">${content}</div><script nonce="${token}">(()=>{const content=document.getElementById('authored-content');let scheduled=false;const measure=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;parent.postMessage({kind:'authored-size',token:'${token}',height:Math.ceil(Math.max(content.getBoundingClientRect().height,content.scrollHeight))},'*')})};new ResizeObserver(measure).observe(content);document.addEventListener('load',measure,true);measure()})();</script></body></html>`;
    return { token, html };
  }, [content]);
  useEffect(() => {
    setHeight(0);
    const resize = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.kind !== 'authored-size' ||
        event.data?.token !== document.token
      )
        return;
      const next = event.data.height;
      if (typeof next === 'number' && Number.isFinite(next) && next >= 0)
        setHeight(Math.min(Math.ceil(next), 32768));
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, [document]);
  return (
    <iframe
      ref={frame}
      className="authored-html"
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={document.html}
      style={{ height }}
    />
  );
}
