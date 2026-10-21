import { Fragment } from 'react';
import type { Runtime, Work } from '../domain/types';
import { statusPanels } from '../domain/statusTemplate';
import { GamePanels } from './GamePanels';
import { StatusDisplay } from './DesignControls';

// One authored order for both interactive blocks and ordinary status templates.
export function StatusPanels({
  work,
  runtime,
  expanded = true,
  demo = false,
  busy = false,
  onAction,
}: {
  work: Work;
  runtime: Runtime;
  expanded?: boolean;
  demo?: boolean;
  busy?: boolean;
  onAction?: (id: string) => Promise<unknown> | void;
}) {
  return (
    <>
      {statusPanels(work).map((panel) => (
        <Fragment key={panel.id}>
          <GamePanels {...{ work, runtime, busy, onAction }} panelId={panel.id} />
          <StatusDisplay {...{ work, runtime, expanded, demo }} panelId={panel.id} />
        </Fragment>
      ))}
    </>
  );
}
