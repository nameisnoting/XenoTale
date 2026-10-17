import { DeleteAction } from '../components/DeleteAction';
import { requiresDeleteConfirmation } from '../domain/deletion';
import {
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useCanvasWheel } from '../components/useCanvasWheel';
import { CanvasToolbar } from '../components/CanvasToolbar';
import { SelectionPill } from '../components/SelectionPill';
import '../components/ScenarioCanvas.css';
import './Graphs.css';
import {
  relationGeometry,
  relationLabelWidth,
  RELATION_LABEL_HEIGHT,
} from '../domain/relationGeometry';
import { ArrowLeftRight, Expand, Eye, EyeOff, Plus } from 'lucide-react';
import type { Work } from '../domain/types';
import { id } from '../domain/types';
import { Button, IconButton, Modal, Toggle, safeUrl } from '../components/UI';

export type GraphView = { x: number; y: number; scale: number };
export type GraphViewProps = {
  view?: GraphView;
  onViewChange?: Dispatch<SetStateAction<GraphView>>;
};
type GraphProps = GraphViewProps & {
  work: Work;
  values?: Record<string, string>;
  innerValues?: Record<string, string>;
  onChange?: (w: Work) => void;
};
type RelationSelection = { kind: 'node' | 'edge'; id: string } | null;
type RelationInteraction = {
  inner: boolean;
  setInner: Dispatch<SetStateAction<boolean>>;
  showAll: boolean;
  setShowAll: Dispatch<SetStateAction<boolean>>;
  selection: RelationSelection;
  setSelection: Dispatch<SetStateAction<RelationSelection>>;
};
export function RelationGraph(props: GraphProps) {
  const [expanded, setExpanded] = useState(false);
  const [localView, setLocalView] = useState<GraphView>({ x: 0, y: 0, scale: 1 });
  const [inner, setInner] = useState(false);
  useEffect(() => {
    if (!props.work.relationSplit) setInner(false);
  }, [props.work.relationSplit]);
  const [showAll, setShowAll] = useState(false);
  const [selection, setSelection] = useState<RelationSelection>(null);
  const interaction = {
    inner: inner && !!props.work.relationSplit,
    setInner,
    showAll,
    setShowAll,
    selection,
    setSelection,
  };
  const viewProps = {
    view: props.view ?? localView,
    onViewChange: props.onViewChange ?? setLocalView,
  };
  return (
    <>
      <RelationshipCanvas
        {...props}
        {...viewProps}
        {...interaction}
        expand={() => setExpanded(true)}
      />
      {expanded && (
        <Modal title="관계도" className="graph-modal" onClose={() => setExpanded(false)}>
          <RelationshipCanvas {...props} {...viewProps} {...interaction} />
        </Modal>
      )}
    </>
  );
}
function RelationshipCanvas({
  work,
  values,
  innerValues,
  onChange,
  expand,
  view,
  onViewChange: setView,
  inner,
  setInner,
  showAll,
  setShowAll,
  selection,
  setSelection,
}: Omit<GraphProps, keyof GraphViewProps> &
  Required<GraphViewProps> &
  RelationInteraction & { expand?: () => void }) {
  const marker = useId().replaceAll(':', '');
  const svg = useRef<SVGSVGElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const source = selection?.kind === 'node' ? selection.id : null;
  const edge = selection?.kind === 'edge' ? selection.id : null;
  const labelInput = useRef<HTMLInputElement>(null);
  const focusEdge = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusEdge.current || focusEdge.current !== edge || !labelInput.current) return;
    labelInput.current.focus({ preventScroll: true });
    labelInput.current.select();
    focusEdge.current = null;
  }, [selection, work.relations]);
  const [moved, setMoved] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<{
    id: string | null;
    px: number;
    py: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const allNodes = [{ id: 'user', name: '{{user}}', image: '' }, ...work.characters];
  const visibleIds = work.relationNodeIds ?? allNodes.map((n) => n.id);
  const nodes = allNodes.filter((n) => visibleIds.includes(n.id));
  const [pendingNodes, setPendingNodes] = useState<string[]>([]);
  useCanvasWheel(svg, (delta) =>
    setView((v) => ({ ...v, scale: Math.max(0.3, Math.min(3, v.scale - delta * 0.002)) })),
  );
  const positions = Object.fromEntries(
    nodes.map((n, i) => [
      n.id,
      work.relationPositions?.[n.id] ??
        (i === 0
          ? { x: 300, y: 330 }
          : { x: i % 2 ? 165 : 435, y: 140 + Math.floor((i - 1) / 2) * 350 }),
    ]),
  );
  if (moved) positions[moved.id] = moved;
  const selectedEdge = work.relations.find((r) => r.id === edge);
  const removeSelection = () => {
    if (!onChange) return;
    if (source) onChange({ ...work, relationNodeIds: visibleIds.filter((key) => key !== source) });
    else if (selectedEdge)
      onChange({ ...work, relations: work.relations.filter((r) => r.id !== selectedEdge.id) });
    setSelection(null);
    focusEdge.current = null;
  };
  const labelFor = (r: Work['relations'][number]) =>
    inner ? (innerValues?.[r.id] ?? r.innerLabel ?? '') : (values?.[r.id] ?? r.label);
  const editLabel = (key: string, label: string) =>
    onChange?.({
      ...work,
      relations: work.relations.map((r) =>
        r.id === key ? { ...r, ...(inner ? { innerLabel: label } : { label }) } : r,
      ),
    });
  const point = (x: number, y: number) => {
    const p = svg.current!.createSVGPoint();
    p.x = x;
    p.y = y;
    return p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  const start = (e: React.PointerEvent, key: string | null) => {
    if (key && !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    const p = point(e.clientX, e.clientY);
    const origin = key ? positions[key] : view;
    drag.current = { id: key, px: p.x, py: p.y, startX: origin.x, startY: origin.y, moved: false };
  };
  const connect = (target: string) => {
    if (!onChange) {
      setSelection(source === target ? null : { kind: 'node', id: target });
      return;
    }
    if (source && source !== target) {
      const existing = work.relations.find((r) => r.from === source && r.to === target);
      const key = existing?.id ?? id();
      if (!existing)
        onChange({
          ...work,
          relations: [
            ...work.relations,
            { id: key, from: source, to: target, label: '새 관계', innerLabel: '' },
          ],
        });
      setSelection({ kind: 'edge', id: key });
      focusEdge.current = key;
    } else setSelection(source === target ? null : { kind: 'node', id: target });
  };
  const allRelationsButton = (
    <button
      className="relation-show-all"
      aria-pressed={showAll}
      title={showAll ? '전체 관계 이름 숨기기' : '전체 관계 이름 표시'}
      onClick={() => {
        setShowAll(!showAll);
        setSelection(null);
        focusEdge.current = null;
      }}
    >
      {showAll ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
      <span>전체 관계</span>
    </button>
  );
  // Reserve all name positions so selection/show-all never makes labels jump.
  const placedLabels: { x: number; y: number; width: number }[] = [];
  return (
    <div className={`relationship-editor ${inner ? 'is-inner' : ''}`}>
      {onChange && (
        <div className="section-title relationship-heading">
          <h2>관계도 맵</h2>
          <Toggle
            label="표면 / 내면 분리"
            value={!!work.relationSplit}
            onChange={(relationSplit) => {
              if (!relationSplit) setInner(false);
              onChange({ ...work, relationSplit });
            }}
          />
        </div>
      )}
      <div className={`relationship-canvas ${expand ? 'relationship-canvas--preview' : ''}`}>
        <CanvasToolbar
          ref={toolbar}
          name="관계도"
          scale={view.scale}
          min={0.3}
          max={3}
          step={0.2}
          zoomInLabel="관계도 확대 보기"
          resetLabel="관계도 위치 초기화"
          onZoom={(scale) => setView((v) => ({ ...v, scale }))}
          onReset={() => setView({ x: 0, y: 0, scale: 1 })}
          leading={
            expand && (
              <IconButton title="관계도 확대" onClick={expand}>
                <Expand size={20} />
              </IconButton>
            )
          }
        >
          {onChange && (
            <DeleteAction
              title={source ? '인물 맵에서 제외' : '관계 삭제'}
              ariaLabel="관계도 선택 항목 삭제"
              className="relation-delete"
              disabled={!source && !selectedEdge}
              needsConfirmation={
                !!selectedEdge && requiresDeleteConfirmation('relation', selectedEdge)
              }
              onDelete={removeSelection}
            />
          )}
        </CanvasToolbar>
        <div className="relation-view-actions">
          {onChange && allRelationsButton}
          {work.relationSplit && (
            <button className="relation-layer" onClick={() => setInner(!inner)}>
              <ArrowLeftRight size={16} aria-hidden="true" />
              <span>{inner ? '표면으로' : '내면으로'}</span>
            </button>
          )}
          {!onChange && allRelationsButton}
        </div>
        <svg
          ref={svg}
          viewBox="0 0 600 700"
          role="application"
          aria-label="캐릭터 관계도"
          tabIndex={0}
          onPointerDown={(e) => start(e, null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSelection(null);
              focusEdge.current = null;
            }
            if (e.key === 'Delete' && selection && onChange) {
              e.preventDefault();
              toolbar.current?.querySelector<HTMLButtonElement>('.relation-delete')?.click();
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = point(e.clientX, e.clientY);
            const dx = p.x - d.px,
              dy = p.y - d.py;
            if (Math.hypot(dx, dy) > 3) d.moved = true;
            if (d.id)
              setMoved({ id: d.id, x: d.startX + dx / view.scale, y: d.startY + dy / view.scale });
            else setView({ ...view, x: d.startX + dx, y: d.startY + dy });
          }}
          onPointerUp={() => {
            const d = drag.current;
            if (!d) return;
            if (d.id) {
              if (d.moved && moved && onChange) {
                onChange({
                  ...work,
                  relationPositions: {
                    ...work.relationPositions,
                    [d.id]: { x: moved.x, y: moved.y },
                  },
                });
              } else connect(d.id);
            } else if (!d.moved) setSelection(null);
            setMoved(null);
            drag.current = null;
          }}
          onPointerCancel={() => {
            setMoved(null);
            drag.current = null;
          }}
        >
          <defs>
            {['arrow', 'selected-arrow'].map((name) => (
              <marker
                key={name}
                id={`${marker}-${name}`}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0 0 L6 3 L0 6"
                  stroke={
                    name === 'selected-arrow' ? 'var(--hikari-yellow)' : 'var(--relation-accent)'
                  }
                  fill="none"
                />
              </marker>
            ))}
            {nodes.map((n) => (
              <clipPath key={n.id} id={`${marker}-${n.id}`} clipPathUnits="userSpaceOnUse">
                <circle r="27" />
              </clipPath>
            ))}
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {work.relations.map((r) => {
              const a = positions[r.from],
                b = positions[r.to];
              if (!a || !b) return null;
              const label = labelFor(r);
              const outgoing = edge === r.id || source === r.from;
              const incoming = source === r.to;
              const showLabel = showAll || outgoing || incoming;
              const reverse = work.relations.find((v) => v.from === r.to && v.to === r.from);
              const width = relationLabelWidth(label);
              const geometry = relationGeometry(
                a,
                b,
                width,
                reverse ? relationLabelWidth(labelFor(reverse)) : undefined,
                Object.values(positions),
                placedLabels,
              );
              const { x, y } = geometry.label;
              placedLabels.push({ x, y, width });
              const names = `${nodes.find((n) => n.id === r.from)?.name || '이름 없음'} → ${nodes.find((n) => n.id === r.to)?.name || '이름 없음'}`;
              return (
                <g
                  key={r.id}
                  className={`relation-edge ${edge === r.id ? 'is-selected' : ''} ${outgoing ? 'is-outgoing' : incoming ? 'is-incoming' : ''}`}
                  data-relation-id={r.id}
                  role="button"
                  aria-label={`${nodes.find((n) => n.id === r.from)?.name} → ${nodes.find((n) => n.id === r.to)?.name}: ${label}`}
                  tabIndex={0}
                  aria-pressed={edge === r.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSelection({ kind: 'edge', id: r.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onChange) focusEdge.current = r.id;
                      setSelection({ kind: 'edge', id: r.id });
                    }
                  }}
                >
                  <path
                    className="relation-edge-hit"
                    d={geometry.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="stroke"
                    aria-hidden="true"
                  />
                  <path
                    className="relation-edge-line"
                    d={geometry.path}
                    fill="none"
                    stroke={outgoing ? 'var(--hikari-yellow)' : 'var(--relation-accent)'}
                    strokeWidth={outgoing || incoming ? 3 : 1}
                    markerEnd={`url(#${marker}-${outgoing ? 'selected-arrow' : 'arrow'})`}
                  />
                  {showLabel && (
                    <foreignObject
                      data-relation-label={r.id}
                      x={x - width / 2}
                      y={y - RELATION_LABEL_HEIGHT / 2}
                      width={width}
                      height={RELATION_LABEL_HEIGHT}
                    >
                      {onChange ? (
                        <input
                          ref={edge === r.id ? labelInput : undefined}
                          className="relation-label-input"
                          aria-label={`${names} ${inner ? '내면' : '표면'} 관계`}
                          placeholder="관계 입력"
                          value={label}
                          onFocus={() => setSelection({ kind: 'edge', id: r.id })}
                          onChange={(e) => editLabel(r.id, e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              e.currentTarget.blur();
                              svg.current?.focus({ preventScroll: true });
                            }
                          }}
                        />
                      ) : (
                        <span className="relation-label-text" title={label}>
                          {label || '관계 입력'}
                        </span>
                      )}
                    </foreignObject>
                  )}
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = positions[n.id];
              const name = n.name || '이름 없음';
              const nameWidth = relationLabelWidth(name);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className="relation-node"
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.name} ${onChange ? '관계 연결' : '관계 보기'}`}
                  aria-pressed={source === n.id}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      connect(n.id);
                    }
                  }}
                  onPointerDown={(e) => (onChange ? start(e, n.id) : e.stopPropagation())}
                  onClick={() => !onChange && connect(n.id)}
                >
                  <circle
                    r="29"
                    fill="#2b2b2b"
                    stroke={source === n.id ? 'var(--relation-accent)' : '#838383'}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <g className="relation-node-avatar" clipPath={`url(#${marker}-${n.id})`}>
                    {n.image ? (
                      <image
                        href={safeUrl(n.image)}
                        x="-27"
                        y="-27"
                        width="54"
                        height="54"
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : (
                      <>
                        <circle cy="-8" r="13" fill="#ccc" />
                        <path d="M-23 21 A23 18 0 0 1 23 21" fill="#ccc" />
                      </>
                    )}
                  </g>
                  <foreignObject
                    className="relation-node-name-box"
                    x={-nameWidth / 2}
                    y="35"
                    width={nameWidth}
                    height="18"
                  >
                    <span className="relation-node-label" title={name}>
                      {name}
                    </span>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="graph-hint">
        {onChange
          ? '인물 클릭 → 대상 클릭: 관계 연결 · 인물 드래그: 배치 · '
          : '인물/화살표 클릭: 관계 확인 · '}
        빈 공간 드래그: 이동 · Ctrl + 휠: 확대 / 축소
      </p>
      {onChange && (
        <section className="relation-palette">
          <div className="section-title">
            <h3>관계도 미포함 캐릭터</h3>
            <Button
              disabled={!pendingNodes.length}
              onClick={() => {
                const additions = pendingNodes.filter((key) => allNodes.some((n) => n.id === key));
                onChange({ ...work, relationNodeIds: [...new Set([...visibleIds, ...additions])] });
                setPendingNodes([]);
              }}
            >
              관계도 맵에 추가
            </Button>
          </div>
          <div className="avatar-choices">
            {allNodes
              .filter((n) => !visibleIds.includes(n.id))
              .map((n) => (
                <button
                  key={n.id}
                  aria-label={n.name}
                  aria-pressed={pendingNodes.includes(n.id)}
                  onClick={() =>
                    setPendingNodes((p) =>
                      p.includes(n.id) ? p.filter((k) => k !== n.id) : [...p, n.id],
                    )
                  }
                >
                  {n.image ? (
                    <img src={safeUrl(n.image)} alt="" />
                  ) : (
                    <span className="palette-person">●</span>
                  )}
                  {n.name}
                </button>
              ))}
          </div>
          <small>인물을 제외해도 작성한 관계는 유지됩니다. 다시 추가하면 표시됩니다.</small>
        </section>
      )}
    </div>
  );
}

export function ScenarioGraph({
  work,
  onSelect,
  onAdd,
}: {
  work: Work;
  onSelect?: (id: string) => void;
  onAdd?: (parent: string) => void;
}) {
  const [root, setRoot] = useState(work.openings[0]?.id);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const validRoot = work.openings.some((o) => o.id === root) ? root : work.openings[0]?.id;
  const draw = (parent: string, seen: Set<string>): React.ReactNode => {
    const node = [...work.openings, ...work.chapters].find((n) => n.id === parent);
    if (!node) return null;
    const children = work.chapters.filter((c) => c.from === parent && !seen.has(c.id));
    return (
      <li key={parent}>
        <div className={`scenario-node ${'type' in node ? node.type : 'start'}`}>
          <button
            type="button"
            className="scenario-node-open"
            data-hover="none"
            disabled={!onSelect || !('type' in node)}
            aria-label={`${node.name || '제목 없음'}${'conditions' in node ? ` ${node.type === 'ending' ? '엔딩' : `조건 ${node.conditions.length}개`}` : ''}`}
            onClick={() => 'type' in node && onSelect?.(node.id)}
          />
          <div className="scenario-node-label" aria-hidden="true">
            <strong>{node.name || '제목 없음'}</strong>
            {'conditions' in node && (
              <small>{node.type === 'ending' ? '엔딩' : `조건 ${node.conditions.length}개`}</small>
            )}
          </div>
          {onAdd && !('type' in node && node.type === 'ending') && (
            <button
              className="node-add"
              aria-label={`${node.name} 다음 챕터 추가`}
              onClick={() => onAdd(node.id)}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        {children.length > 0 && (
          <ul>{children.map((c) => draw(c.id, new Set([...seen, c.id])))}</ul>
        )}
      </li>
    );
  };
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  useCanvasWheel(canvas, (delta, event) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - 64;
    setView((v) => {
      const scale = Math.max(0.4, Math.min(2, +(v.scale - delta * 0.002).toFixed(3)));
      const ratio = scale / v.scale;
      return { x: x - (x - v.x) * ratio, y: y - (y - v.y) * ratio, scale };
    });
  });
  const stopPan = () => {
    drag.current = null;
    setPanning(false);
  };
  return (
    <div className="scenario-editor">
      <div className="tab-pills">
        {work.openings.map((o) => (
          <SelectionPill
            key={o.id}
            name={o.name}
            selected={o.id === validRoot}
            onSelect={() => setRoot(o.id)}
          />
        ))}
      </div>
      <div
        ref={canvas}
        className={`scenario-canvas ${panning ? 'is-panning' : ''}`}
        role="application"
        aria-label="시나리오 캔버스"
        tabIndex={0}
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              x: v.x + (e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0),
              y: v.y + (e.key === 'ArrowUp' ? 24 : e.key === 'ArrowDown' ? -24 : 0),
            }));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('.scenario-node')) return;
          e.preventDefault();
          const box = canvas.current!;
          drag.current = { x: e.clientX, y: e.clientY, left: view.x, top: view.y };
          setPanning(true);
          box.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const start = drag.current;
          setView((v) => ({
            ...v,
            x: start.left + e.clientX - start.x,
            y: start.top + e.clientY - start.y,
          }));
        }}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onLostPointerCapture={stopPan}
      >
        <CanvasToolbar
          className="scenario-zoom"
          name="시나리오"
          scale={view.scale}
          min={0.4}
          max={2}
          step={0.1}
          onZoom={(scale) => setView((v) => ({ ...v, scale }))}
          onReset={() => setView({ x: 0, y: 0, scale: 1 })}
        />
        <div
          className="scenario-world"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <ul className="scenario-tree">{validRoot && draw(validRoot, new Set([validRoot]))}</ul>
        </div>
      </div>
      <p className="graph-hint">빈 공간 드래그: 이동 · Ctrl + 휠: 확대 / 축소</p>
    </div>
  );
}
