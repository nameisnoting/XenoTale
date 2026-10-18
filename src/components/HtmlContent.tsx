import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'dompurify';
import { codeProblems } from '../domain/codeValidation';
import { assetUrl } from '../persistence/assets';
import frameScript from './htmlFrame.js?raw';

/** Raw message HTML is display-only; registered automatic rules may run isolated scripts. */
export function HtmlContent({
  children,
  executeScripts = false,
  onRisuButton,
  preserveState = false,
  fitContent = false,
}: {
  children: string;
  executeScripts?: boolean;
  onRisuButton?: (value: string) => void;
  preserveState?: boolean;
  fitContent?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    [height, setHeight] = useState(120);
  const token = useMemo(() => crypto.randomUUID(), []);
  const persistent = preserveState && !executeScripts;
  const [ready, setReady] = useState(false);
  const buttonCallback = useRef(onRisuButton);
  buttonCallback.current = onRisuButton;
  const {
    document,
    warning,
    markup: safeMarkup,
    styles: authorStyles,
  } = useMemo(() => {
    const parsed = new DOMParser().parseFromString(
      children.replace(/asset:[a-zA-Z0-9-]+/g, assetUrl),
      'text/html',
    );
    const scripts = Array.from(parsed.querySelectorAll('script:not([src])')).map(
      (node) => node.textContent ?? '',
    );
    // Sanitize markup separately. CSS comments can contain HTML-like text that a second HTML
    // sanitizer otherwise drops. Escaping '<' keeps CSS from closing its style element.
    const styles = Array.from(parsed.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n')
      .replaceAll('<', '\\3c ');
    parsed.querySelectorAll('style').forEach((node) => node.remove());
    const handlers: { id: string; type: string; code: string }[] = [];
    parsed.querySelectorAll('*').forEach((element, index) => {
      const trigger = element.getAttribute('risu-trigger') ?? element.getAttribute('risu-btn');
      if (trigger) element.setAttribute('data-risu-trigger', trigger);
      for (const attribute of Array.from(element.attributes))
        if (/^on[a-z]+$/.test(attribute.name)) {
          const id = `handler-${index}`;
          element.setAttribute('data-xeno-handler', id);
          handlers.push({ id, type: attribute.name.slice(2), code: attribute.value });
          element.removeAttribute(attribute.name);
        }
    });
    parsed.querySelectorAll('script').forEach((node) => node.remove());
    const prepared = parsed.head.innerHTML + parsed.body.innerHTML;
    const markup = renderToStaticMarkup(
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => url}
      >
        {prepared}
      </ReactMarkdown>,
    );
    const authorCode = [...scripts, ...handlers.map((h) => h.code)].join('\n');
    const problems = executeScripts && authorCode ? codeProblems(authorCode, 'effect') : [];
    const scriptAllowed = executeScripts && !problems.length;
    const callbacks = handlers
      .map(
        (h) =>
          `document.querySelector('[data-xeno-handler="${h.id}"]')?.addEventListener(${JSON.stringify(h.type)},function(event){${h.code}\n});`,
      )
      .join('\n');
    const script = scriptAllowed
      ? `<script nonce="${token}">${(scripts.join('\n') + '\n' + callbacks).replace(/<\/script/gi, '<\\/script')}</script>`
      : '';
    const safe = DOMPurify.sanitize(markup, {
      ADD_TAGS: ['style'],
      FORBID_TAGS: [
        'script',
        'iframe',
        'object',
        'embed',
        'base',
        'meta',
        'link',
        'form',
        'foreignObject',
      ],
      FORBID_ATTR: ['action', 'formaction', 'srcdoc'],
      WHOLE_DOCUMENT: false,
      FORCE_BODY: true,
      ADD_URI_SAFE_ATTR: ['type'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|blob|data):|[#/])/i,
    });
    return {
      warning: problems.join(' '),
      markup: safe,
      styles,
      document: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:transparent;color:#fff;color-scheme:dark;font:14px/1.8 sans-serif;overflow-wrap:anywhere}*{box-sizing:border-box}img,svg,video{max-width:100%;height:auto}a{color:#5fddce}pre{white-space:pre-wrap}button,input,select{font:inherit}p:first-child{margin-top:0}${fitContent ? 'html{overflow:hidden!important}body{display:flow-root;overflow:visible!important;height:auto!important;min-height:0!important}' : ''}</style><style data-author-style>${styles}</style></head><body>${safe}${script}<script nonce="${token}" data-token="${token}" data-patch="${persistent}" data-fit="${fitContent}">${frameScript}</script></body></html>`,
    };
  }, [children, token, executeScripts, persistent, fitContent]);
  const initialDocument = useRef(document);
  useEffect(() => {
    if (persistent && ready)
      frame.current?.contentWindow?.postMessage(
        { type: 'xeno-html-update', token, markup: safeMarkup, styles: authorStyles },
        '*',
      );
  }, [persistent, ready, token, safeMarkup, authorStyles]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.token !== token ||
        !['xeno-html-height', 'xeno-risu-button'].includes(event.data?.type)
      )
        return;
      if (event.data.type === 'xeno-risu-button') {
        if (typeof event.data.value === 'string' && event.data.value.length <= 1000)
          buttonCallback.current?.(event.data.value);
        return;
      }
      const next = Number(event.data.height);
      if (Number.isFinite(next))
        setHeight(Math.min(fitContent ? 1_000_000 : 2000, Math.max(36, next)));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [token, fitContent]);
  return (
    <>
      {' '}
      <iframe
        className="story-html"
        title="대화 HTML"
        ref={frame}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
        scrolling={fitContent ? 'no' : undefined}
        srcDoc={persistent ? initialDocument.current : document}
        style={{ width: '100%', height, border: 0, display: 'block' }}
      />{' '}
      {warning && (
        <small className="muted" role="status">
          스크립트 실행 제한: {warning}
        </small>
      )}
    </>
  );
}
