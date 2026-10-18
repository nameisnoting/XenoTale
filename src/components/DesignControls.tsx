import { useId, useState } from 'react';
import './Stepper.css';
import { Minus, Plus, X, Camera } from 'lucide-react';
import type { Persona, Work, Runtime } from '../domain/types';
import { effectiveStatus } from '../domain/engine';
import { Area, Field, ImageUpload, TextInput, Markdown, safeUrl } from './UI';
import './PersonaFields.css';
import { AuthoredHtml } from './AuthoredHtml';
import { demoStatusContent } from '../domain/demo';
import { panelStatuses, statusPanels } from '../domain/statusTemplate';
import type { StatusPanel } from '../domain/types';

export function RadioOptions<T extends string>({
  value,
  values,
  onChange,
  disabled = false,
}: {
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div className="radio-options">
      {values.map((v) => (
        <label key={v}>
          <input
            type="radio"
            name={name}
            disabled={disabled}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span>{v}</span>
        </label>
      ))}
    </div>
  );
}
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <output>
          {value}
          {unit}
        </output>
        <button
          aria-label={`${label} 줄이기`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
        >
          <Minus size={18} />
        </button>
        <button
          aria-label={`${label} 늘리기`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
export function KeywordInput({
  value,
  onChange,
  label = '키워드',
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim();
    if (next) onChange([...new Set([...value, next])]);
    setDraft('');
  };
  return (
    <div className="keyword-editor">
      <input
        aria-label={label}
        placeholder={`${label} 입력 후 Enter`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
      />
      <div className="keyword-pills">
        {value.filter(Boolean).map((v, i) => (
          <span key={`${v}-${i}`}>
            {v}
            <button
              aria-label={`${v} 삭제`}
              onClick={() => onChange(value.filter((_, j) => i !== j))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
export function PersonaFields({
  value,
  onChange,
  readOnly = false,
}: {
  value: Persona;
  onChange: (p: Partial<Persona>) => void;
  readOnly?: boolean;
}) {
  const custom = value.gender !== '남성' && value.gender !== '여성';
  return (
    <div className="persona-fields">
      <div className="persona-image">
        {readOnly ? (
          <div className="persona-image-preview">
            {value.image ? (
              <img src={safeUrl(value.image)} alt="페르소나 이미지" />
            ) : (
              <Camera size={28} aria-label="페르소나 이미지 없음" />
            )}
          </div>
        ) : (
          <ImageUpload
            value={value.image}
            onChange={(image) => onChange({ image })}
            label="페르소나 이미지"
          />
        )}
      </div>
      <Field label="이름">
        <TextInput
          size="small"
          readOnly={readOnly}
          value={value.name}
          onChange={(name) => onChange({ name })}
          placeholder="이름을 입력하세요"
        />
      </Field>
      <Field label="성별">
        <RadioOptions
          disabled={readOnly}
          value={custom ? '직접 입력' : value.gender!}
          values={['남성', '여성', '직접 입력']}
          onChange={(gender) => onChange({ gender: gender === '직접 입력' ? '' : gender })}
        />
        {custom && (
          <TextInput
            size="small"
            readOnly={readOnly}
            value={value.gender ?? ''}
            placeholder="성별을 입력하세요 (선택)"
            onChange={(gender) => onChange({ gender })}
          />
        )}
      </Field>
      <Field label="프롬프트">
        <Area
          size="small"
          readOnly={readOnly}
          value={value.prompt}
          onChange={(prompt) => onChange({ prompt })}
          placeholder="자유롭게 작성해 주세요"
          rows={7}
        />
      </Field>
    </div>
  );
}

// Authored scripts and app storage access are blocked. HTTPS images are allowed.
export function AuthoredContent({
  content,
  title = '미리보기',
  unframed = false,
}: {
  content: string;
  title?: string;
  unframed?: boolean;
}) {
  // HTML inside a fenced code block is source text, not an HTML preview.
  const outsideCode = content.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
  if (!/<[a-z][\s\S]*>/i.test(outsideCode))
    return <Markdown renderHtml={false}>{content}</Markdown>;
  if (unframed) return <AuthoredHtml content={content} title={title} />;
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:16px;background:#000;color:#fff;font:14px/1.8 sans-serif;overflow-wrap:anywhere}img{max-width:100%}a{color:#5fddce}</style></head><body>${content}</body></html>`;
  return (
    <iframe
      className="authored-preview"
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={document}
    />
  );
}
export function StatusDisplay({
  work,
  runtime,
  expanded = true,
  collapsible = true,
  demo = false,
  panelId,
}: {
  work: Work;
  runtime: Runtime;
  expanded?: boolean;
  collapsible?: boolean;
  demo?: boolean;
  panelId?: string;
}) {
  return (
    <>
      {statusPanels(work)
        .filter(
          (panel) =>
            (!panelId || panel.id === panelId) &&
            (panel.template.trim() || panelStatuses(panel, work.statuses).length),
        )
        .map((panel) => (
          <StatusPanelDisplay
            key={panel.id}
            panel={panel}
            work={work}
            runtime={runtime}
            expanded={expanded}
            collapsible={collapsible}
            demo={demo}
          />
        ))}
    </>
  );
}

function StatusPanelDisplay({
  work,
  runtime,
  panel,
  expanded,
  collapsible,
  demo,
}: {
  work: Work;
  runtime: Runtime;
  panel: StatusPanel;
  expanded: boolean;
  collapsible: boolean;
  demo: boolean;
}) {
  const statuses = panelStatuses(panel, work.statuses);
  const content = work.statuses.reduce(
    (text, s) =>
      text
        .replaceAll(`{{${s.id}}}`, String(effectiveStatus(work, runtime, s.id)))
        .replaceAll(`{{${s.name}}}`, String(effectiveStatus(work, runtime, s.id))),
    panel.template,
  );
  const fallback = statuses
    .map(
      (s) =>
        `${s.name}: ${effectiveStatus(work, runtime, s.id)}${s.displayMax && s.type === 'number' ? ` / ${s.max}` : ''}${s.unit}`,
    )
    .join('\n');
  const body = (
    <AuthoredContent
      content={
        demo
          ? demoStatusContent(statuses.length)
          : content.trim()
            ? content
            : `\`\`\`\n${fallback}\n\`\`\``
      }
      title={panel.name || '상태창'}
      unframed
    />
  );
  if (!collapsible) return <div className="status-preview">{body}</div>;
  return (
    <details
      className={`status-display ${work.statusPanels ? 'status-display--named' : ''}`}
      open={expanded}
    >
      <summary
        aria-label={`${panel.name || '상태창'} 접기/펼치기`}
        title={`${panel.name || '상태창'} 접기/펼치기`}
      >
        <span className="status-toggle-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M5 3 L11 8 L5 13 Z" fill="currentColor" />
          </svg>
        </span>
        {work.statusPanels ? (
          <span className="status-panel-name">{panel.name || '상태창'}</span>
        ) : (
          <span className="status-expand-label">상태창 펼치기</span>
        )}
      </summary>
      <div className="status-content">{body}</div>
    </details>
  );
}
