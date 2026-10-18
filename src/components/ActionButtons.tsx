import type { Room } from '../domain/types';
import { actionAvailable } from '../domain/actions';
import { Button } from './UI';
export function ActionButtons({
  room,
  busy,
  onAction,
}: {
  room: Room;
  busy: boolean;
  onAction: (id: string) => void;
}) {
  const actions = room.work.actions?.filter((a) => a.trigger === 'button');
  if (!actions?.length) return null;
  return (
    <div className="action-buttons" aria-label="작품 행동">
      {actions.map((action) => (
        <Button
          key={action.id}
          disabled={busy || !actionAvailable(room.work, room.current.runtime, action)}
          onClick={() => onAction(action.id)}
        >
          {action.name || '행동'}
        </Button>
      ))}
    </div>
  );
}
