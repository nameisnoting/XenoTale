import { useRef, useState } from 'react';
import { FileInput } from 'lucide-react';
import { readImport, type ImportData } from '../../persistence/files';
import { exposeAsset } from '../../persistence/assets';
import { db } from '../../persistence/db';
import { workspace } from '../../domain/defaults';
import { clone, id } from '../../domain/types';
import { IconButton, Modal, Button, useNotify } from '../../components/UI';

export function ImportWorkButton({
  beforeImport,
  onImported,
  author,
  disabled,
}: {
  beforeImport: () => Promise<void>;
  onImported: (id: string) => void;
  author: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    notify = useNotify();
  const [value, setValue] = useState<ImportData | null>(null),
    [busy, setBusy] = useState(false);
  const load = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await readImport(file);
      if (!['work', 'workspace'].includes(parsed.kind))
        throw new Error('작품 또는 작업 공간 파일을 선택해 주세요.');
      setValue(parsed);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (!value || !['work', 'workspace'].includes(value.kind)) return;
    setBusy(true);
    try {
      await beforeImport();
      const entry = workspace(author);
      entry.work = clone(
        value.kind === 'work'
          ? value.work
          : value.kind === 'workspace'
            ? value.workspace.work
            : entry.work,
      );
      entry.work.id = id();
      entry.work.version = 0;
      entry.publishedVersion = 0;
      await db.transaction('rw', db.assets, db.workspaces, async () => {
        if (value.assets?.length) await db.assets.bulkPut(value.assets);
        await db.workspaces.add(entry);
      });
      value.assets?.forEach(exposeAsset);
      setValue(null);
      onImported(entry.id);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <IconButton
        title={busy ? '작품 불러오는 중' : '작품 불러오기'}
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        <FileInput size={20} />
      </IconButton>
      <input
        ref={input}
        type="file"
        hidden
        accept=".xeno,.json,.charx,.png,.jpg,.jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void load(file);
        }}
      />
      {value && (
        <Modal title="작품 불러오기" onClose={() => !busy && setValue(null)}>
          <p>
            {value.kind === 'work'
              ? value.work.title
              : value.kind === 'workspace'
                ? value.workspace.work.title
                : ''}
          </p>
          <p className="muted">현재 작업을 보관하고 새 작업 공간으로 불러옵니다.</p>
          {value.warnings?.map((warning, i) => (
            <p className="import-warning" key={i}>
              {warning}
            </p>
          ))}
          <Button className="primary full" disabled={busy} onClick={() => void accept()}>
            {busy ? '불러오는 중…' : '작업 공간으로 불러오기'}
          </Button>
        </Modal>
      )}
    </>
  );
}
