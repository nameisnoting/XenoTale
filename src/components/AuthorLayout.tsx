import { useEffect, useMemo, useRef } from 'react';
import { authoredDocument, readLayoutReport, type LayoutReport } from './authoredDocument';

export function AuthorLayout({
  code,
  uiType,
  resources,
  onReport,
  composerHeight,
}: {
  code: string;
  uiType: string;
  resources?: string[];
  onReport: (report: LayoutReport) => void;
  composerHeight: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onReport);
  callback.current = onReport;
  const portRef = useRef<MessagePort | null>(null);
  const metrics = useRef({ composerHeight, uiType });
  metrics.current = { composerHeight, uiType };
  const resourcesKey = JSON.stringify(resources ?? []);
  const runId = useMemo(() => crypto.randomUUID(), [code, resourcesKey]);
  const srcDoc = useMemo(
    () => authoredDocument(code, runId, uiType, resources),
    [code, runId, resourcesKey],
  );
  useEffect(() => {
    let port: MessagePort | undefined;
    const timeout = setTimeout(
      () => callback.current({ slots: {}, errors: ['제작자 UI가 응답하지 않습니다.'] }),
      4000,
    );
    const init = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'xenotale-layout-ready' ||
        event.data?.runId !== runId ||
        port
      )
        return;
      const channel = new MessageChannel();
      port = channel.port1;
      portRef.current = port;
      port.onmessage = (e) => {
        const data = e.data;
        if (!data || typeof data !== 'object' || !Array.isArray(data.errors) || !data.slots) return;
        clearTimeout(timeout);
        callback.current(
          readLayoutReport(
            data,
            frame.current?.clientWidth ?? 0,
            frame.current?.clientHeight ?? 0,
            metrics.current.uiType,
          ),
        );
      };
      port.start();
      frame.current?.contentWindow?.postMessage(
        { type: 'xenotale-layout-init', runId, metrics: metrics.current },
        '*',
        [channel.port2],
      );
    };
    window.addEventListener('message', init);
    return () => {
      clearTimeout(timeout);
      port?.close();
      portRef.current = null;
      window.removeEventListener('message', init);
    };
  }, [runId]);
  useEffect(() => {
    portRef.current?.postMessage({ composerHeight, uiType });
  }, [composerHeight, uiType]);
  return (
    <iframe
      className="author-layout-frame"
      title="제작자 UI 레이아웃"
      sandbox="allow-scripts"
      allow="autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; payment 'none'"
      referrerPolicy="no-referrer"
      ref={frame}
      srcDoc={srcDoc}
    />
  );
}
