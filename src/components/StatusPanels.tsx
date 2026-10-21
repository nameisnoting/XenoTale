import type { Runtime, Work } from '../domain/types';
import { panelStatuses, statusPanels } from '../domain/statusTemplate';
import { conditionsMet } from '../domain/conditions';
import { GamePanel } from './GamePanels';
import { StatusPanelDisplay, StatusSummary } from './DesignControls';
import './StatusPanels.css';

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
  const panels = statusPanels(work)
    .map((panel) => ({
      panel,
      information: !!panel.template.trim() || panelStatuses(panel, work.statuses).length > 0,
      interactive: !!panel.blocks?.some((block) =>
        conditionsMet(work, runtime, block.conditions, block.mode),
      ),
    }))
    .filter((entry) => entry.information || entry.interactive);
  if (!panels.length) return null;
  const title = work.statusPanels
    ? panels.map(({ panel }) => panel.name || '상태창').join(' / ')
    : undefined;
  return (
    <details
      className={`status-display status-panels ${title ? 'status-display--named' : ''}`}
      open={expanded}
    >
      <StatusSummary title={title} />
      <div className="status-content">
        {panels.map(({ panel, information, interactive }) => (
          <section
            className="status-panel-section"
            aria-label={panel.name || '상태창'}
            key={panel.id}
          >
            {interactive && (
              <GamePanel {...{ panel, work, runtime, busy, onAction }} showTitle={false} />
            )}
            {information && (
              <StatusPanelDisplay
                {...{ panel, work, runtime, expanded, demo }}
                collapsible={false}
              />
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
