import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RisuContext } from './RisuContext';
import type { Room, Checkpoint } from '../domain/types';
import { risuChatEntries } from '../domain/risuState';
import { HtmlContent } from './HtmlContent';
import { Markdown } from './UI';
import { risuCommand, runRisu } from '../engine/risu/client';
type Props = {
  room: Room;
  checkpoint?: Checkpoint;
  body: string;
  index?: number;
  interactive?: boolean;
  disabled?: boolean;
};
export function RisuText(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Start lazily, then retain the frame. Expanding an earlier card must not unload
    // this message or repeatedly move the reader as frame heights settle.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root}>
      {visible ? (
        <ActiveRisuText {...props} />
      ) : (
        <div style={{ height: 180 }} aria-label="이전 메시지" />
      )}
    </div>
  );
}
function ActiveRisuText({
  room,
  checkpoint: snapshot = room.current,
  body,
  index = -1,
  interactive = true,
  disabled = false,
}: Props) {
  const actions = useContext(RisuContext),
    lock = useRef(false);
  const latest = index === risuChatEntries(room).length - 1;
  const checkpoint = latest && interactive ? room.current : snapshot;
  const command = useMemo(() => {
    const command = risuCommand(room, checkpoint);
    const originals = command.config.rules.filter((r) => r.type !== 'editdisplay');
    const display = (room.work.displayRules ?? [])
      .filter((r) => r.enabled)
      .map((r) => ({
        ...command.config.rules.find((x) => x.id === r.id),
        ...r,
        type: 'editdisplay' as const,
        flags: r.flags || 'g',
      }));
    command.config = { ...command.config, rules: [...originals, ...display] };
    return { ...command, text: body, index };
  }, [
    room.work.risu,
    room.work.displayRules,
    room.work.lore,
    room.timeline,
    checkpoint.runtime.risu,
    checkpoint.context.persona.name,
    room.work.title,
    body,
    index,
  ]);
  const key = useMemo(() => JSON.stringify(command), [command]);
  const [rendered, setRendered] = useState({ key: '', text: '', error: '' });
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    let live = true;
    runRisu(room.id, command).then(
      (result) => {
        if (live) setRendered({ key, text: result.text, error: '' });
      },
      (error) => {
        if (live) setRendered({ key, text: body, error: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [key]);
  const click = async (button: string) => {
    if (!actions || actions.busy || disabled || lock.current || !latest || !interactive) return;
    lock.current = true;
    actions.setActionBusy(true);
    setActionError('');
    try {
      const result = await runRisu(room.id, {
        ...command,
        action: 'button',
        button,
        state: room.current.runtime.risu,
      });
      await actions.commit(result, room);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      lock.current = false;
      actions.setActionBusy(false);
    }
  };
  return (
    <div className="risu-message" aria-busy={rendered.key !== key}>
      {!rendered.key ? (
        <p role="status" className="muted">
          작품 화면 준비 중…
        </p>
      ) : rendered.error ? (
        <Markdown>{body}</Markdown>
      ) : (
        <HtmlContent
          preserveState
          fitContent
          onRisuButton={latest && interactive ? (button) => void click(button) : undefined}
        >
          {command.config.styles + '\n' + rendered.text}
        </HtmlContent>
      )}
      {rendered.error && (
        <p role="alert" className="danger-text">
          작품 실행: {rendered.error}
        </p>
      )}
      {(actionError || checkpoint.runtime.risu?._xenotale_error) && (
        <p role="alert" className="danger-text">
          {actionError || checkpoint.runtime.risu?._xenotale_error}
        </p>
      )}
    </div>
  );
}
