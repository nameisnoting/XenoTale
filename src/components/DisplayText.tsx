import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Work } from '../domain/types';
import { Markdown } from './UI';

// Running a user regex in a worker keeps pathological expressions from freezing the app.
export function DisplayText({
  children,
  rules,
  render,
}: {
  children: string;
  rules?: Work['displayRules'];
  render?: (text: string, executeScripts: boolean) => ReactNode;
}) {
  const source = JSON.stringify(rules?.filter((r) => r.enabled) ?? []);
  const input = useMemo(() => {
    if (!/<script\b|\son[a-z]+\s*=/i.test(children)) return children;
    const parsed = new DOMParser().parseFromString(children, 'text/html');
    parsed.querySelectorAll('script').forEach((node) => node.remove());
    parsed.querySelectorAll('*').forEach((node) => {
      for (const attribute of Array.from(node.attributes))
        if (/^on[a-z]+$/i.test(attribute.name)) node.removeAttribute(attribute.name);
    });
    return parsed.head.innerHTML + parsed.body.innerHTML;
  }, [children]);
  const [result, setResult] = useState({ input: '', source: '', text: children, error: '' });
  useEffect(() => {
    if (source === '[]') return;
    const worker = new Worker(new URL('./displayWorker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => {
      worker.terminate();
      setResult({
        input: children,
        source,
        text: children,
        error: '자동연출 처리 시간을 초과해 원문을 표시합니다.',
      });
    }, 1500);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      setResult({ input: children, source, ...event.data });
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      setResult({
        input: children,
        source,
        text: children,
        error: '자동연출을 표시하지 못해 원문을 표시합니다.',
      });
      worker.terminate();
    };
    worker.postMessage({ text: input, rules: JSON.parse(source) });
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [children, input, source]);
  const active = source !== '[]' && result.input === children && result.source === source;
  const text = active ? result.text : children;
  const scripts = active && !result.error && result.text !== input;
  return (
    <>
      {render ? render(text, scripts) : <Markdown executeScripts={scripts}>{text}</Markdown>}
      {active && result.error && (
        <small className="muted" role="status">
          {result.error}
        </small>
      )}
    </>
  );
}
