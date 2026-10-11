import { useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { Button, Confirm, IconButton, useNotify } from './UI';

export function DeleteAction({
  title,
  name,
  needsConfirmation,
  onDelete,
  label,
  description,
  disabled = false,
  className = '',
  icon = 'trash',
  ariaLabel,
}: {
  title: string;
  name?: string;
  needsConfirmation: boolean;
  onDelete: () => void | Promise<unknown>;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  icon?: 'trash' | 'close';
  ariaLabel?: string;
}) {
  const Icon = icon === 'close' ? X : Trash2;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const notify = useNotify();
  const remove = async () => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : '삭제하지 못했습니다.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const request = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (needsConfirmation) setOpen(true);
    else void remove();
  };
  return (
    <>
      {label ? (
        <Button className={className} disabled={disabled || busy} onClick={request}>
          <Icon size={16} />
          {label}
        </Button>
      ) : (
        <IconButton
          title={ariaLabel ?? title}
          className={className}
          disabled={disabled || busy}
          onClick={request}
        >
          <Icon size={16} />
        </IconButton>
      )}
      {open &&
        createPortal(
          <Confirm
            title={title}
            label="삭제"
            tone="danger"
            busy={busy}
            onClose={() => {
              if (!pending.current) setOpen(false);
            }}
            onConfirm={() => void remove()}
          >
            <p>{name?.trim() ? `‘${name}’을 삭제할까요?` : '이 항목을 삭제할까요?'}</p>
            <p>{description ?? '작성한 내용이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.'}</p>
          </Confirm>,
          document.body,
        )}
    </>
  );
}
