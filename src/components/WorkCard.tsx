import { useId } from 'react';
import { Download, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { DismissibleMenu } from './DismissibleMenu';
import type { PublishedWork } from '../domain/types';
import { Avatar, IconButton, safeUrl } from './UI';

export function WorkCard({
  entry,
  menuOpen,
  onToggleMenu,
  onStart,
  onEdit,
  onCopy,
  onExport,
  onDelete,
  onDismissMenu,
  selection,
}: {
  entry: PublishedWork;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onStart: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
  onDismissMenu?: () => void;
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const menuId = useId();
  return (
    <article
      className={`work-card ${selection ? 'work-card--selectable' : ''} ${selection?.selected ? 'is-selected' : ''}`}
      draggable={!selection}
      onDragStart={(e) => {
        e.dataTransfer.setData('workId', entry.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button
        className="work-art"
        aria-label={`${entry.work.title} ${selection ? '선택' : '대화 시작'}`}
        aria-pressed={selection?.selected}
        onClick={selection?.onToggle ?? onStart}
      >
        {entry.work.cover ? (
          <img src={safeUrl(entry.work.cover)} alt="" />
        ) : (
          <span className="cover-placeholder">{entry.work.title.slice(0, 1) || 'X'}</span>
        )}
      </button>
      <div className="work-caption">
        <button onClick={selection?.onToggle ?? onStart}>{entry.work.title}</button>
        {selection ? (
          <span className="work-selection-mark" aria-hidden="true">
            {selection.selected ? '✓' : '+'}
          </span>
        ) : (
          <IconButton
            title={`${entry.work.title} 메뉴`}
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={onToggleMenu}
          >
            <MoreVertical size={16} />
          </IconButton>
        )}
      </div>
      <div className="work-author">
        <Avatar src={entry.work.authorImage} size={14} />
        {entry.work.author || '이름 없음'}
      </div>
      {menuOpen && !selection && (
        <DismissibleMenu id={menuId} onDismiss={onDismissMenu ?? onToggleMenu}>
          <button role="menuitem" onClick={entry.owned ? onEdit : onCopy}>
            <Pencil size={15} />
            작품 수정
          </button>
          <button role="menuitem" onClick={onExport}>
            <Download size={15} />
            작품 내보내기
          </button>
          <button role="menuitem" onClick={onDelete}>
            <Trash2 size={15} />
            작품 삭제
          </button>
        </DismissibleMenu>
      )}
    </article>
  );
}
