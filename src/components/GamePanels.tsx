import { useState } from 'react';
import type { Work, Runtime, StatusPanel } from '../domain/types';
import { conditionsMet } from '../domain/conditions';
import { actionAvailable } from '../domain/actions';
import { actionSelected, gameText } from '../domain/gamePanels';
import { Button } from './UI';
import './GamePanels.css';

export function GamePanels({
  work,
  runtime,
  busy = false,
  onAction,
  panelId,
}: {
  work: Work;
  runtime: Runtime;
  busy?: boolean;
  onAction?: (id: string) => Promise<unknown> | void;
  panelId?: string;
}) {
  return (
    <>
      {work.statusPanels
        ?.filter((panel) => panel.blocks?.length && (!panelId || panel.id === panelId))
        .map((panel) => (
          <GamePanel key={panel.id} {...{ panel, work, runtime, busy, onAction }} />
        ))}
    </>
  );
}

export function GamePanel({
  panel,
  work,
  runtime,
  busy,
  onAction,
  showTitle = true,
}: {
  panel: StatusPanel;
  work: Work;
  runtime: Runtime;
  busy: boolean;
  onAction?: (id: string) => Promise<unknown> | void;
  showTitle?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const blocks = panel.blocks?.filter((block) =>
    conditionsMet(work, runtime, block.conditions, block.mode),
  );
  if (!blocks?.length) return null;
  return (
    <section className="game-panel" aria-label={panel.name || '게임 화면'}>
      {showTitle && <h3>{panel.name || '게임 화면'}</h3>}
      {blocks.map((block) => (
        <section className="game-block" key={block.id} aria-label={block.title || '선택 버튼'}>
          {block.title && <h4>{gameText(block.title, work, runtime)}</h4>}
          {block.description && <p>{gameText(block.description, work, runtime)}</p>}
          {!!block.buttons.length && (
            <div className={`game-buttons game-buttons--${block.columns}`}>
              {block.buttons.map((button) => {
                const action = work.actions?.find(
                  (a) => a.id === button.actionId && a.trigger === 'button',
                );
                const selected = action ? actionSelected(action, runtime) : false;
                return (
                  <Button
                    key={button.id}
                    aria-pressed={selected}
                    disabled={
                      !onAction ||
                      busy ||
                      pending ||
                      !action ||
                      !actionAvailable(work, runtime, action)
                    }
                    onClick={async () => {
                      if (!onAction || pending) return;
                      setPending(true);
                      setError('');
                      try {
                        await onAction(button.actionId);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    {button.label || action?.name || '이벤트 실행'}
                  </Button>
                );
              })}
            </div>
          )}
        </section>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
