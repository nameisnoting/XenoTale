import { useEffect, useRef, useState } from 'react';
import { newEventStep, moveEventStep, type EventStep } from '../../domain/events';
import { id, type Work } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';
import type { EventLibrary } from './EventParts';

export function useEventWorkshop({
  work,
  action,
  change,
  onLibrary,
}: {
  work: Work;
  action: WorkAction;
  change: (patch: Partial<WorkAction>) => void;
  onLibrary: (library: EventLibrary) => void;
}) {
  const [selected, setSelected] = useState('trigger');
  const root = useRef<HTMLDivElement>(null);
  const addControl = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{ target: string } | null>(null);
  const [libraryTarget, setLibraryTarget] = useState<{
    index: number;
    kind: string;
    target: string;
    ids: string[];
  } | null>(null);
  const reveal = (target: string) => setPending({ target });
  useEffect(() => {
    if (!pending) return;
    const frame = requestAnimationFrame(() => {
      const element = [
        ...(root.current?.querySelectorAll<HTMLElement>('[data-event-edit]') ?? []),
      ].find((el) => el.dataset.eventEdit === pending.target);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [pending]);
  const stepIndex = selected.startsWith('step:') ? Number(selected.slice(5)) : -1;
  const step = action.steps[stepIndex];
  const view = action.workspace?.view ?? 'blocks';
  const entries = (library: EventLibrary) =>
    library === 'values'
      ? work.statuses
      : library === 'items'
        ? work.items
        : library === 'effects'
          ? work.effects
          : (work.statusPanels ?? []);
  const openLibrary = (library: EventLibrary, index = -1) => {
    const current = action.steps[index];
    setLibraryTarget({
      index,
      kind: current?.kind ?? '',
      target: current?.target ?? '',
      ids: entries(library).map((entry) => entry.id),
    });
    onLibrary(library);
    reveal('resource');
  };
  const finishLibrary = (library: EventLibrary) => {
    const current = action.steps[libraryTarget?.index ?? -1];
    const created = entries(library).filter((entry) => !libraryTarget?.ids.includes(entry.id));
    const candidate = created[0];
    const status = work.statuses.find((entry) => entry.id === candidate?.id);
    const compatible =
      current &&
      (library === 'items'
        ? ['gain', 'consume'].includes(current.kind)
        : library === 'effects'
          ? current.kind === 'effect'
          : library === 'values' &&
            ['add', 'set', 'text'].includes(current.kind) &&
            status &&
            (current.kind === 'text' ? status.type !== 'number' : status.type === 'number'));
    if (
      created.length === 1 &&
      compatible &&
      current.kind === libraryTarget?.kind &&
      current.target === libraryTarget.target
    )
      change({
        steps: action.steps.map((value, index) =>
          index === libraryTarget.index ? { ...value, target: candidate.id } : value,
        ),
      });
    setLibraryTarget(null);
    reveal(
      view === 'nodes'
        ? 'inspector'
        : libraryTarget && libraryTarget.index >= 0
          ? `step:${libraryTarget.index}`
          : 'tools',
    );
  };
  const reorder = (from: number, to: number) => {
    change({ steps: moveEventStep(action, from, to) });
    setLibraryTarget((target) =>
      target
        ? {
            ...target,
            index:
              target.index === from
                ? to
                : from < to && target.index > from && target.index <= to
                  ? target.index - 1
                  : to < from && target.index >= to && target.index < from
                    ? target.index + 1
                    : target.index,
          }
        : null,
    );
    setSelected(`step:${to}`);
    reveal(view === 'nodes' ? 'inspector' : `step:${to}`);
  };
  const addStep = (kind: EventStep['kind']) => {
    change({ steps: [...action.steps, newEventStep(work, kind)] });
    setSelected(`step:${action.steps.length}`);
    reveal(view === 'nodes' ? 'inspector' : `step:${action.steps.length}`);
  };
  const addCondition = () => {
    change({
      conditions: [
        ...action.conditions,
        {
          id: id(),
          kind: 'number',
          ref: work.statuses.find((s) => s.type === 'number')?.id ?? '',
          op: 'gte',
          value: 0,
        },
      ],
    });
    setSelected('conditions');
    reveal(view === 'nodes' ? 'inspector' : 'conditions');
  };
  return {
    root,
    addControl,
    selected,
    setSelected,
    reveal,
    stepIndex,
    step,
    view,
    libraryTarget,
    openLibrary,
    finishLibrary,
    reorder,
    addStep,
    addCondition,
    clearLibrary: () => setLibraryTarget(null),
  };
}
