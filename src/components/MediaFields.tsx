import { useState, type ReactNode, type RefObject } from 'react';
import './MediaFields.css';
export function MediaCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="media-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function CodeRange({ children }: { children: ReactNode }) {
  return (
    <div className="code-range">
      <span className="code-label">코드 범위</span>
      <div className="code-pills">{children}</div>
    </div>
  );
}
export function CodePill({
  label,
  value,
  onChange,
  type = 'text',
  inputLabel = label,
}: {
  label: string;
  inputLabel?: string;
  value: string | number;
  onChange?: (value: string) => void;
  type?: 'text' | 'number';
}) {
  return (
    <label className="code-pill">
      <span>{label} =</span>
      {onChange ? (
        <input
          type={type}
          aria-label={inputLabel}
          value={value}
          min={type === 'number' ? 0 : undefined}
          max={type === 'number' ? 9999 : undefined}
          style={{ width: `${Math.max(1, String(value).length)}ch` }}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <span className="code-value">{value}</span>
      )}
    </label>
  );
}
export function TemplateInput({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [scroll, setScroll] = useState(0);
  return (
    <div className="template-input">
      <div className="template-colors" aria-hidden="true">
        <span style={{ transform: `translateX(-${scroll}px)` }}>
          {value.split(/(\{\{(?:char_code|situation_code)\}\})/).map((part, index) => (
            <span key={index} className={part.startsWith('{{') ? 'template-code' : ''}>
              {part}
            </span>
          ))}
        </span>
      </div>
      <input
        ref={inputRef}
        type="text"
        aria-label="이미지 URL"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScroll(event.currentTarget.scrollLeft)}
        placeholder="URL 입력 시 캐릭터 코드 및 상황 코드가 들어갈 자리는 하단 버튼을 통해 입력해 주세요."
      />
    </div>
  );
}
