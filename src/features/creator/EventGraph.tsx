import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { IconButton } from '../../components/UI';
import { eventTriggers, stepTitle, conditionTitle, eventConnections } from '../../domain/events';
import type { Work } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';

export function EventGraph({
  work,
  action,
  selected,
  onSelect,
  onMove,
  addContent,
  inspector,
}: {
  work: Work;
  action: WorkAction;
  selected: string;
  onSelect: (key: string) => void;
  onMove: (from: number, to: number) => void;
  addContent: ReactNode;
  inspector: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measuredWidth = useRef(0);
  const [reservedHeight, setReservedHeight] = useState(0);
  useLayoutEffect(() => setReservedHeight(0), [action.steps.length]);
  const arrow = useId().replace(/:/g, '');
  const [drawing, setDrawing] = useState({ width: 1, height: 1, paths: [] as string[] });
  const connected = eventConnections(work, action);
  const nodes: { id: string; kind: string; title: string; index?: number }[] = [
    {
      id: 'trigger',
      kind: '시작',
      title: eventTriggers.find((t) => t.value === action.trigger)?.label ?? '시작 시점',
    },
    {
      id: 'conditions',
      kind: '조건',
      title: action.conditions.length
        ? `${action.mode === 'all' ? '모두' : '하나라도'} 충족 · ${action.conditions.length}개`
        : '조건 없이 실행',
    },
    ...action.steps.map((step, index) => ({
      id: `step:${index}`,
      kind: `작업 ${index + 1}`,
      title: stepTitle(work, step),
      index,
    })),
    {
      id: 'links',
      kind: '연결된 결과',
      title: `시나리오 ${connected.chapters.length}개${connected.inner ? ' · 내면 해금' : ''}`,
    },
  ];
  useLayoutEffect(() => {
    const canvas = root.current;
    if (!canvas) return;
    const draw = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      if (measuredWidth.current && Math.abs(measuredWidth.current - box.width) > 1)
        setReservedHeight(0);
      measuredWidth.current = box.width;
      const elements = [...canvas.querySelectorAll<HTMLElement>('[data-event-node]')];
      const paths = elements.slice(1).map((element, index) => {
        const a = elements[index].getBoundingClientRect(),
          b = element.getBoundingClientRect();
        const sameRow = Math.abs(a.top - b.top) < 8;
        const x = (sameRow ? a.right : a.left + a.width / 2) - box.left;
        const y = (sameRow ? a.top + a.height / 2 : a.bottom) - box.top;
        const tx = (sameRow ? b.left : b.left + b.width / 2) - box.left;
        const ty = (sameRow ? b.top + b.height / 2 : b.top) - box.top;
        const middle = (y + ty) / 2;
        return sameRow
          ? `M${x} ${y} L${tx} ${ty}`
          : `M${x} ${y} C${x} ${middle} ${tx} ${middle} ${tx} ${ty}`;
      });
      setDrawing((previous) =>
        previous.width === box.width &&
        previous.height === box.height &&
        previous.paths.join() === paths.join()
          ? previous
          : { width: box.width, height: box.height, paths },
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    canvas.querySelectorAll('[data-event-node]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [action, work, selected]);
  return (
    <>
      <p className="muted event-graph-hint">
        노드를 누르면 그 자리에서 편집할 수 있습니다. 조건을 통과하면 작업을 순서대로 실행합니다.
        작업의 위·아래 화살표로 순서를 바꾸세요. 선은 현재 실행 순서를 보여줍니다.
      </p>
      <div
        ref={root}
        className="event-canvas"
        style={{ minHeight: reservedHeight }}
        aria-label="이벤트 노드 작업공간"
      >
        <svg
          className="event-wires"
          viewBox={`0 0 ${drawing.width} ${drawing.height}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id={arrow}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8" fill="currentColor" />
            </marker>
          </defs>
          {drawing.paths.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd={`url(#${arrow})`}
            />
          ))}
        </svg>
        <div className="event-node-grid">
          {nodes.map((node) => (
            <div
              key={node.id}
              data-event-node={node.id}
              className={`event-node-card ${selected === node.id ? 'selected' : ''}`}
            >
              <button
                type="button"
                className="event-node"
                aria-pressed={selected === node.id}
                aria-label={`${node.kind} 편집: ${node.title}`}
                onClick={() => {
                  // Keep the canvas height while switching editors: a shorter panel must
                  // not shrink the scroll range and push the viewport upward.
                  setReservedHeight(Math.ceil(root.current?.getBoundingClientRect().height ?? 0));
                  onSelect(node.id);
                }}
              >
                <span className="event-node-kind">{node.kind}</span>
                <span className="event-node-edit-label">
                  {selected === node.id ? '편집 중' : '눌러서 편집'}
                </span>
                <span>{node.title}</span>
                {node.id === 'conditions' && action.conditions.length > 0 && (
                  <span className="event-node-detail">
                    {conditionTitle(work, action.conditions[0])}
                    {action.conditions.length > 1 ? ' 외' : ''}
                  </span>
                )}
              </button>
              {node.index !== undefined && (
                <div className="event-node-order">
                  <span className="muted">실행 순서</span>
                  <IconButton
                    title={`작업 ${node.index + 1} 위로`}
                    disabled={node.index === 0}
                    onClick={() => onMove(node.index!, node.index! - 1)}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                  <IconButton
                    title={`작업 ${node.index + 1} 아래로`}
                    disabled={node.index === action.steps.length - 1}
                    onClick={() => onMove(node.index!, node.index! + 1)}
                  >
                    <ArrowDown size={16} />
                  </IconButton>
                </div>
              )}
              {selected === node.id && inspector}
            </div>
          ))}
        </div>
      </div>
      {addContent}
    </>
  );
}
