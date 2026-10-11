import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { EffectResult, Runtime, Work } from '../domain/types';
import { effectResultSchema } from '../domain/effects';
import { IconButton, Markdown } from './UI';
import { effectDocument } from './effectDocument';
import './EffectPlayer.css';

type Effect = Work['effects'][number];
export function EffectPlayer({
  effect,
  context,
  preview = false,
  readOnly = false,
  onResult,
  onClose,
}: {
  effect: Effect;
  context?: {
    personaName: string;
    status: Runtime['status'];
    inventory: Runtime['inventory'];
    nodeId: string;
  };
  preview?: boolean;
  readOnly?: boolean;
  onResult?: (result: EffectResult) => Promise<unknown>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const loads = useRef(0);
  const saving = useRef(false);
  const completed = useRef(false);
  const screenTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbacks = useRef({ onResult, onClose, context, readOnly });
  callbacks.current = { onResult, onClose, context, readOnly };
  const [message, setMessage] = useState(readOnly ? '다시 보기 · 결과는 변경되지 않습니다.' : '');
  const [pending, setPending] = useState(false);
  const runId = useMemo(() => crypto.randomUUID(), []);
  const html = /<[a-z][\s\S]*>/i.test(effect.content);
  const srcDoc = useMemo(() => effectDocument(effect.content, runId), [effect.content, runId]);
  const close = () => {
    if (!saving.current) callbacks.current.onClose();
  };

  useLayoutEffect(() => {
    const element = dialog.current!;
    const focused = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    const initialize = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== 'xenotale-effect-ready' ||
        event.data?.runId !== runId ||
        port.current
      )
        return;
      connect();
      window.removeEventListener('message', initialize);
    };
    window.addEventListener('message', initialize);
    return () => {
      window.removeEventListener('message', initialize);
      port.current?.close();
      clearTimeout(screenTimer.current);
      document.getElementById('root')?.removeAttribute('data-effect-screen');
      element.close();
      document.body.style.overflow = previous;
      focused?.focus();
    };
  }, []);
  useEffect(() => {
    // Loss of the source passage while an overlay is open is handled again at commit time.
    if (readOnly && !completed.current) setMessage('다시 보기 · 결과는 변경되지 않습니다.');
  }, [readOnly]);

  const connect = () => {
    port.current?.close();
    const channel = new MessageChannel();
    port.current = channel.port1;
    channel.port1.onmessage = async (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'close') {
        close();
        return;
      }
      if (typeof data.requestId !== 'string' || data.requestId.length > 100) return;
      const reply = (ok: boolean, result?: unknown, error?: string) =>
        channel.port1.postMessage({ requestId: data.requestId, ok, result, error });
      try {
        if (JSON.stringify(data).length > 16000) throw new Error('연출 결과가 너무 큽니다.');
        if (data.type === 'screen') {
          const { name, duration } = data.payload ?? {};
          if (
            !['shake', 'glitch'].includes(name) ||
            typeof duration !== 'number' ||
            !Number.isFinite(duration)
          )
            throw new Error('지원하지 않는 화면 효과입니다.');
          clearTimeout(screenTimer.current);
          const root = document.getElementById('root');
          root?.setAttribute('data-effect-screen', name);
          screenTimer.current = setTimeout(
            () => root?.removeAttribute('data-effect-screen'),
            Math.max(100, Math.min(3000, duration)),
          );
          reply(true);
        } else if (data.type === 'complete') {
          if (saving.current) throw new Error('결과를 저장하고 있습니다.');
          if (completed.current || callbacks.current.readOnly)
            throw new Error('이미 결과를 반영했거나 이전 장면입니다. 결과를 변경할 수 없습니다.');
          const parsed = effectResultSchema.safeParse(data.payload);
          if (!parsed.success)
            throw new Error(
              '결과에는 1~2000자의 summary가 필요합니다. outcome, score, data만 추가할 수 있습니다.',
            );
          saving.current = true;
          setPending(true);
          try {
            if (!preview && !callbacks.current.onResult)
              throw new Error('결과를 저장할 수 없습니다.');
            await callbacks.current.onResult?.(parsed.data);
            completed.current = true;
            setMessage(`${preview ? '미리보기 결과' : '결과 저장완료'} · ${parsed.data.summary}`);
            reply(true, parsed.data);
          } finally {
            saving.current = false;
            setPending(false);
          }
        } else throw new Error('지원하지 않는 연출 요청입니다.');
      } catch (error) {
        const text = error instanceof Error ? error.message : '연출 요청에 실패했습니다.';
        setMessage(text);
        reply(false, undefined, text);
      }
    };
    channel.port1.start();
    // srcdoc has an opaque origin. Transfer a private port to this exact frame only;
    // result messages never pass through a global window message listener.
    frame.current?.contentWindow?.postMessage(
      {
        type: 'xenotale-effect-init',
        runId,
        context: {
          ...(callbacks.current.context ?? {}),
          preview,
          readOnly: callbacks.current.readOnly,
        },
      },
      '*',
      [channel.port2],
    );
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="effect-player"
      aria-label={`${effect.name || '연출'}${preview ? ' 미리보기' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="effect-toolbar">
        <span>
          {effect.name || '연출'}
          {preview ? ' · 미리보기' : ''}
        </span>
        <IconButton title="연출 닫기" disabled={pending} onClick={close}>
          <X size={24} />
        </IconButton>
      </header>
      {html ? (
        <iframe
          ref={frame}
          title="연출 실행 화면"
          className="effect-frame"
          sandbox="allow-scripts"
          allow="autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'; fullscreen 'none'; payment 'none'"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          onLoad={() => {
            if (++loads.current > 1) {
              port.current?.close();
              setMessage('연출 화면이 이동되어 결과 전달을 종료했습니다. 닫고 다시 실행해 주세요.');
            }
          }}
        />
      ) : (
        <div className="effect-markdown">
          <Markdown>{effect.content || '연출 내용을 작성해 주세요.'}</Markdown>
        </div>
      )}
      {(pending || message) && (
        <div className="effect-feedback" role="status">
          {pending ? '결과 저장 중…' : message}
        </div>
      )}
    </dialog>,
    document.body,
  );
}
