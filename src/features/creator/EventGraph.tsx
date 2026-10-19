import { useId, useLayoutEffect, useRef, useState } from 'react';
import { eventTriggers, stepTitle, conditionTitle, eventConnections } from '../../domain/events';
import type { Work } from '../../domain/types';
import type { WorkAction } from '../../domain/actions';

export function EventGraph({
  work,
  action,
  selected,
  onSelect,
  onConnect,
}: {
  work: Work;
  action: WorkAction;
  selected: string;
  onSelect: (key: string) => void;
  onConnect: (source: number, target: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const arrow = useId().replace(/:/g, '');
  const [source, setSource] = useState<number | null>(null);
  const [drawing, setDrawing] = useState({ width: 1, height: 1, paths: [] as string[] });
  const connected = eventConnections(work, action);
  const nodes: { id: string; kind: string; title: string; input?: number; output?: number }[] = [
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
      output: -1,
    },
    ...action.steps.map((step, index) => ({
      id: `step:${index}`,
      kind: `작업 ${index + 1}`,
      title: stepTitle(work, step),
      input: index,
      output: index,
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
        노드를 눌러 내용을 편집하세요. 작업의 출력과 입력을 연결하면 실행 순서가 바뀝니다. 조건을
        통과하면 작업을 위에서 아래로 실행합니다.
      </p>
      <div ref={root} className="event-canvas" aria-label="이벤트 노드 작업공간">
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
                onClick={() => onSelect(node.id)}
              >
                <span className="event-node-kind">{node.kind}</span>
                <span>{node.title}</span>
                {node.id === 'conditions' && action.conditions.length > 0 && (
                  <span className="event-node-detail">
                    {conditionTitle(work, action.conditions[0])}
                    {action.conditions.length > 1 ? ' 외' : ''}
                  </span>
                )}
              </button>
              {(node.input !== undefined || node.output !== undefined) && (
                <div className="event-node-ports">
                  {node.input !== undefined && (
                    <button
                      type="button"
                      aria-label={`작업 ${node.input + 1} 입력`}
                      onClick={() => {
                        if (source === null) {
                          onSelect(node.id);
                          return;
                        }
                        onConnect(source, node.input!);
                        setSource(null);
                      }}
                    >
                      입력
                    </button>
                  )}
                  {node.output !== undefined && (
                    <button
                      type="button"
                      className="event-output"
                      aria-label={`${node.kind} 출력`}
                      aria-pressed={source === node.output}
                      onClick={() => setSource(source === node.output ? null : node.output!)}
                    >
                      출력
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {source !== null && (
        <p className="event-link-hint" role="status">
          다음에 실행할 작업의 입력을 선택하세요.{' '}
          <button type="button" onClick={() => setSource(null)}>
            연결 취소
          </button>
        </p>
      )}
    </>
  );
}
