import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileText, X } from 'lucide-react';
import { IconButton } from '../components/UI';
import { assetUrl } from '../persistence/assets';
import { addCreatorFiles } from '../persistence/creatorAttachments';
import type { CreatorAttachment } from '../domain/creatorAttachments';

export function AssistantFiles({
  files,
  onRemove,
  disabled = false,
}: {
  files: CreatorAttachment[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  if (!files.length) return null;
  return (
    <div className="support-attachments" role="list" aria-label="첨부파일">
      {files.map((file) => (
        <div key={file.id} className="support-attachment" role="listitem">
          {file.kind === 'image' ? (
            <img src={assetUrl(file.asset)} alt={file.name} />
          ) : (
            <FileText size={24} aria-hidden="true" />
          )}
          <span>
            <strong title={file.name}>{file.name}</strong>
            <small>
              {file.kind === 'image' ? '사진' : file.kind === 'pdf' ? 'PDF' : '문서'} ·{' '}
              {file.size < 1024 ** 2
                ? `${Math.ceil(file.size / 1024)} KB`
                : `${(file.size / 1024 ** 2).toFixed(1)} MB`}
            </small>
          </span>
          {onRemove && (
            <IconButton
              title={`${file.name} 첨부 취소`}
              disabled={disabled}
              onClick={() => onRemove(file.id)}
            >
              <X size={16} />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  );
}
export function useAssistantFiles(
  files: CreatorAttachment[],
  onChange: (files: CreatorAttachment[]) => void,
  busy: boolean,
  notify: (text: string) => void,
) {
  const [reading, setReading] = useState(false),
    [dragging, setDragging] = useState(false);
  const pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const upload = async (incoming: File[]) => {
    if (!incoming.length) return;
    if (busy || pending.current) {
      notify('현재 작업이 끝난 뒤 파일을 첨부해 주세요.');
      return;
    }
    pending.current = true;
    setReading(true);
    try {
      const next = await addCreatorFiles(incoming, files);
      if (mounted.current) onChange(next);
    } catch (error) {
      if (mounted.current) notify((error as Error).message);
    } finally {
      pending.current = false;
      if (mounted.current) setReading(false);
    }
  };
  const isFile = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  return {
    reading,
    dragging,
    upload,
    dragHandlers: {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!isFile(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        if (!isFile(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        void upload([...event.dataTransfer.files]);
      },
    },
  };
}
