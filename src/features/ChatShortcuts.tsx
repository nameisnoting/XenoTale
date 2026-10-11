import { AnchoredPopover } from '../components/AnchoredPopover';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Shortcut } from '../domain/types';
import { id } from '../domain/types';
import { ShortcutFields } from '../components/ShortcutFields';
import { Button, Modal, useAction } from '../components/UI';
import './ChatShortcuts.css';
export function ChatShortcuts({
  creator,
  user,
  disabled,
  onSelect,
  onAdd,
}: {
  creator: Shortcut[];
  user: Shortcut[];
  disabled: boolean;
  onSelect: (name: string) => void;
  onAdd: (value: Shortcut) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Shortcut | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const run = useAction();
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const name = draft?.name.trim().replace(/^\/+/, '') ?? '';
  const duplicate = ['roll', ...creator.map((s) => s.name), ...user.map((s) => s.name)].some(
    (existing) => existing.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase(),
  );
  const error =
    name &&
    (/\s|\//u.test(name)
      ? '이름에 공백이나 /를 넣을 수 없습니다.'
      : name.length > 100
        ? '이름은 100자 이내로 입력해 주세요.'
        : duplicate
          ? '이미 사용 중인 단축어 이름입니다.'
          : '');
  const choose = (value: string) => {
    setOpen(false);
    onSelect(value);
  };
  const entries = (values: Shortcut[]) =>
    values
      .filter((s) => s.name.trim())
      .map((s) => (
        <button
          role="menuitem"
          type="button"
          key={s.id}
          title={s.description}
          onClick={() => choose(s.name)}
        >
          /{s.name}
          {s.description && <small>{s.description}</small>}
        </button>
      ));
  return (
    <div className="chat-shortcuts-control">
      <button
        ref={trigger}
        type="button"
        title="단축어"
        aria-label="단축어"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        /
      </button>
      {open && (
        <AnchoredPopover
          anchor={trigger}
          className="chat-shortcuts-menu"
          label="단축어 목록"
          onClose={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const target =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? buttons.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            e.preventDefault();
            buttons[target]?.focus();
          }}
        >
          <div className="chat-shortcuts-groups">
            <section>
              <h3>주사위</h3>
              <button role="menuitem" onClick={() => choose('roll')}>
                /roll
              </button>
            </section>
            {creator.some((s) => s.name.trim()) && (
              <section>
                <h3>제작자 단축어</h3>
                {entries(creator)}
              </section>
            )}
            {user.length > 0 && (
              <section>
                <h3>유저 단축어</h3>
                {entries(user)}
              </section>
            )}
          </div>
          <button
            role="menuitem"
            className="shortcut-add-link"
            onClick={() => {
              setOpen(false);
              setDraft({ id: id(), name: '', description: '', prompt: '' });
            }}
          >
            단축어 추가
          </button>
        </AnchoredPopover>
      )}
      {draft &&
        createPortal(
          <Modal
            title="단축어 추가"
            className="shortcut-modal design-ui"
            onClose={() => {
              if (!saving) setDraft(null);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name || error || !draft.prompt.trim() || saving) return;
                setSaving(true);
                run(
                  onAdd({ ...draft, name })
                    .then(() => {
                      setDraft(null);
                      trigger.current?.focus();
                    })
                    .finally(() => setSaving(false)),
                );
              }}
            >
              <fieldset disabled={saving} className="panel-fieldset">
                <ShortcutFields value={draft} onChange={setDraft} />
              </fieldset>
              {error && (
                <p role="alert" className="danger-text">
                  {error}
                </p>
              )}
              <p className="muted">
                이 대화방에 자동저장됩니다. 분기와 대화방 백업에도 포함됩니다.
              </p>
              <div className="inline-actions">
                <Button type="button" disabled={saving} onClick={() => setDraft(null)}>
                  취소
                </Button>
                <Button
                  type="submit"
                  className="primary"
                  disabled={saving || !name || !!error || !draft.prompt.trim()}
                >
                  {saving ? '저장 중…' : '저장'}
                </Button>
              </div>
            </form>
          </Modal>,
          document.body,
        )}
    </div>
  );
}
