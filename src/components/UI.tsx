import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import './Toggle.css';
import './TextControls.css';
import type {
  ReactNode,
  ButtonHTMLAttributes,
  ComponentPropsWithRef,
  CSSProperties,
  Ref,
} from 'react';
import { X, Check, Loader2, UserRound, Camera, AlertCircle, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assetUrl } from '../persistence/assets';
const Notify = createContext<(message: string) => void>(() => {});
export function Notifications({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState({ text: '', sequence: 0 });
  const { text } = message;
  const notify = useCallback(
    (text: string) => setMessage((previous) => ({ text, sequence: previous.sequence + 1 })),
    [],
  );
  const [root] = useState(() => {
    const element = document.createElement('div');
    element.className = 'notification-root';
    element.style.display = 'contents';
    return element;
  });
  useLayoutEffect(() => {
    if (!text) return;
    // React keeps the toast in one portal. Move its host only after the commit,
    // when a closing dialog has been removed and the destination is connected.
    const sync = () => {
      const focused = document.activeElement?.closest<HTMLDialogElement>('dialog:modal');
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog:modal');
      const host = focused ?? dialogs[dialogs.length - 1] ?? document.body;
      const toast = root.querySelector<HTMLElement>('.toast');
      if (root.parentElement !== host) {
        if (toast?.isConnected && toast.matches(':popover-open')) toast.hidePopover();
        host.appendChild(root);
      }
      if (toast?.isConnected && !toast.matches(':popover-open')) toast.showPopover();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => {
      observer.disconnect();
      const toast = root.querySelector<HTMLElement>('.toast');
      if (toast?.isConnected && toast.matches(':popover-open')) toast.hidePopover();
      root.remove();
    };
  }, [message, root]);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => notify(''), 6000);
    return () => clearTimeout(t);
  }, [message, notify]);
  return (
    <Notify.Provider value={notify}>
      {children}
      {text && createPortal(<Toast text={text} onClose={() => notify('')} />, root)}
    </Notify.Provider>
  );
}
function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div popover="manual" className="toast" role="status">
      <AlertCircle size={17} />
      <span>{text}</span>
      <button aria-label="알림 닫기" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
export const useNotify = () => useContext(Notify);
export function useAction() {
  const notify = useNotify();
  return (p: Promise<unknown>) => {
    void p.catch((e) => notify(e instanceof Error ? e.message : '작업을 완료하지 못했습니다.'));
  };
}
export function Button({
  children,
  className = '',
  size = 'regular',
  tone = 'neutral',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'regular' | 'small';
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      {...rest}
      className={`button button--${size} ${tone === 'danger' ? 'button--danger' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
type HoverBehavior = 'surface' | 'text' | 'none';
type ActionButtonProps = ComponentPropsWithRef<'button'> & { hover?: HoverBehavior };
// Lightweight actions share hover rules without adding a filled button surface.
export function ActionButton({ hover = 'text', type = 'button', ...rest }: ActionButtonProps) {
  return <button {...rest} type={type} data-hover={hover} />;
}
export function IconButton({
  title,
  children,
  hover = 'surface',
  ...rest
}: ActionButtonProps & { title: string }) {
  return (
    <button
      type="button"
      {...rest}
      data-hover={hover}
      title={title}
      aria-label={title}
      className={`icon-button ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
  handle,
  style,
  density = 'regular',
  closeOnBackdrop = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  handle?: ReactNode;
  style?: CSSProperties;
  density?: 'regular' | 'compact';
  closeOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      d.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      style={style}
      className={`modal common-modal modal--${density} design-ui ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      {handle ?? <div className="sheet-handle" />}
      <header className="modal-header">
        <h2>{title}</h2>
        <IconButton title="닫기" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Confirm({
  title,
  children,
  onConfirm,
  onClose,
  label = '확인',
  busy = false,
  tone = 'neutral',
}: {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  label?: string;
  busy?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Modal title={title} onClose={onClose} className="confirm-modal">
      <div className="confirm-body">{children}</div>
      <div className="modal-actions">
        <Button disabled={busy} onClick={onClose}>
          취소
        </Button>
        <Button
          disabled={busy}
          tone={tone}
          className={tone === 'danger' ? '' : 'primary'}
          onClick={onConfirm}
        >
          {tone === 'danger' && <Trash2 size={16} aria-hidden="true" />}
          {label}
        </Button>
      </div>
    </Modal>
  );
}
export function Field({
  label,
  children,
  hint,
  required,
  labelAction,
  size = 'regular',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  labelAction?: ReactNode;
  size?: 'regular' | 'small';
}) {
  const labelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const controls = ref.current?.querySelectorAll(
      'input:not([type=checkbox]),textarea,select,button[role=combobox]',
    );
    if (controls?.length === 1 && !controls[0].hasAttribute('aria-label'))
      controls[0].setAttribute('aria-labelledby', labelId);
  });
  return (
    <div
      className={`field ${size === 'small' ? 'field--small' : ''}`}
      ref={ref}
      role="group"
      aria-labelledby={labelId}
    >
      {labelAction ? (
        <div className="field-header">
          <span id={labelId} className="field-label">
            {label}
            {required && <i> *</i>}
          </span>
          {labelAction}
        </div>
      ) : (
        <span id={labelId} className="field-label">
          {label}
          {required && <i> *</i>}
        </span>
      )}
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function TextInput({
  value,
  onChange,
  placeholder = '',
  maxLength,
  type = 'text',
  disabled,
  readOnly = false,
  size = 'regular',
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'regular' | 'small';
  'aria-label'?: string;
}) {
  return (
    <input
      className={`text-control text-control--${size}`}
      aria-label={ariaLabel}
      readOnly={readOnly}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
    />
  );
}
export function Area({
  value,
  onChange,
  placeholder = '자유롭게 입력하세요.',
  rows = 5,
  size = 'regular',
  ariaLabel,
  readOnly = false,
  inputRef,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  rows?: number;
  size?: 'regular' | 'small';
  ariaLabel?: string;
  readOnly?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      ref={inputRef}
      className={`text-control text-control--${size}`}
      aria-label={ariaLabel}
      readOnly={readOnly}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
    />
  );
}
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
export function Segmented<T extends string>({
  value,
  values,
  onChange,
  label,
}: {
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {values.map((v) => (
        <button
          type="button"
          key={v}
          aria-pressed={value === v}
          className={value === v ? 'selected' : ''}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
export function Toggle({
  value,
  onChange,
  label,
  displayLabel,
  disabled = false,
}: {
  value: boolean;
  onChange: (b: boolean) => void;
  label: string;
  displayLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row" data-checked={value}>
      <span className="toggle-label">{displayLabel ?? label}</span>
      <button
        type="button"
        disabled={disabled}
        className={`toggle ${value ? 'on' : ''}`}
        role="switch"
        aria-label={label}
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </label>
  );
}
export function Avatar({ src, name, size = 36 }: { src?: string; name?: string; size?: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {src && !bad ? (
        <img src={safeUrl(src)} alt={name ?? ''} onError={() => setBad(true)} />
      ) : (
        <UserRound size={size * 0.6} />
      )}
    </span>
  );
}
export function safeUrl(url: string) {
  url = assetUrl(url);
  if (url.startsWith('blob:') && url.startsWith(`blob:${location.origin}/`)) return url;
  return /^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|\/(?!\/))/.test(url) ? url : '';
}
export function ImageUpload({
  value,
  onChange,
  label = '이미지',
}: {
  value: string;
  onChange: (s: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const notify = useNotify();
  return (
    <div className="image-upload">
      <button
        aria-label={`${label} 업로드`}
        className={value ? 'has-image' : ''}
        onClick={() => input.current?.click()}
      >
        {value ? <img src={safeUrl(value)} alt={label} /> : <Camera size={28} />}
      </button>
      <input
        hidden
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)) {
            notify('PNG, JPG, WebP, GIF 이미지를 선택해 주세요.');
            return;
          }
          if (f.size > 10 * 1024 * 1024) {
            notify('이미지는 10MB 이하로 올려 주세요.');
            return;
          }
          const r = new FileReader();
          r.onload = () => onChange(String(r.result));
          r.readAsDataURL(f);
        }}
      />
      {value && (
        <button className="text-button" onClick={() => onChange('')}>
          삭제
        </button>
      )}
    </div>
  );
}
const HtmlContent = lazy(() => import('./HtmlContent').then((m) => ({ default: m.HtmlContent })));
export function Markdown({
  children,
  executeScripts = false,
  renderHtml = true,
}: {
  children: string;
  executeScripts?: boolean;
  renderHtml?: boolean;
}) {
  if (
    renderHtml &&
    /<\/?(?:div|span|img|svg|style|table|details|button|input|select|section|article|p|h[1-6]|br)\b/i.test(
      children,
    )
  )
    return (
      <Suspense fallback={<div className="muted">화면 준비 중…</div>}>
        <HtmlContent executeScripts={executeScripts}>{children}</HtmlContent>
      </Suspense>
    );
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ node, children: code }) => {
            const line = children.split('\n')[(node?.position?.start.line ?? 0) - 1] ?? '';
            const title = line.match(/^\s*(?:`{3,}|~{3,})\s*(.*?)\s*$/)?.[1];
            return (
              <pre>
                {title && <span className="code-block-title">{title}</span>}
                {code}
              </pre>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => <img src={safeUrl(src ?? '')} alt={alt ?? ''} loading="lazy" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Spinner({ text = '불러오는 중…' }: { text?: string }) {
  return (
    <div className="loading">
      <Loader2 className="spin" size={20} />
      {text}
    </div>
  );
}
export function Saved({ status }: { status: 'saving' | 'saved' | 'error' }) {
  const root = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState(false);
  const text = status === 'saving' ? '저장 중' : status === 'saved' ? '저장완료' : '저장하지 못함';
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !label.current) return;
    const measure = () => setHidden(element.scrollWidth > element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(label.current);
    measure();
    return () => observer.disconnect();
  }, [status]);
  return (
    <span ref={root} className={`saved ${status}`} role="status" aria-label={text}>
      {status === 'saving' ? (
        <Loader2 size={13} className="spin" />
      ) : status === 'saved' ? (
        <Check size={13} />
      ) : (
        <AlertCircle size={13} />
      )}
      <span ref={label} className={`saved-text ${hidden ? 'is-hidden' : ''}`} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
