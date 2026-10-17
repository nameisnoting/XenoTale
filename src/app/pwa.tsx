import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { readImport } from '../persistence/files';
import { exposeAsset } from '../persistence/assets';
import type { Profile, Room, Workspace } from '../domain/types';
import { db } from '../persistence/db';
import { createRoom } from '../domain/engine';
import { workspace } from '../domain/defaults';
import { navigate } from './navigation';
import { Button, useNotify } from '../components/UI';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type FileLaunch = {
  setConsumer: (consumer: (params: { files: FileSystemFileHandle[] }) => void) => void;
};
let installPrompt: InstallPrompt | null = null;

export function useWebApp(ready: boolean, profile: Profile | undefined) {
  const notify = useNotify();
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    const receive = (event: Event) => {
      event.preventDefault();
      installPrompt = event as InstallPrompt;
      window.dispatchEvent(new Event('xeno-install-available'));
    };
    const installed = () => {
      installPrompt = null;
      window.dispatchEvent(new Event('xeno-install-available'));
    };
    window.addEventListener('beforeinstallprompt', receive);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', receive);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const launch = (window as Window & { launchQueue?: FileLaunch }).launchQueue;
    if (!launch) return;
    launch.setConsumer(async (params) => {
      for (const handle of params.files) {
        try {
          const value = await readImport(await handle.getFile());
          if (value.kind !== 'work' && value.kind !== 'workspace')
            throw new Error(
              '대화방으로 열 작품 파일을 선택해 주세요. 백업은 파일 가져오기에서 복원할 수 있습니다.',
            );
          const work = value.kind === 'work' ? value.work : value.workspace.work;
          let room: Room | undefined;
          let draft: Workspace | undefined;
          try {
            room = createRoom(
              work,
              profile?.defaultModel ?? 'demo',
              profile?.personas[0] ?? work.personas[0],
            );
            room.current.context.settings.summaryModelId = profile?.summaryModel ?? '';
            room.initial.context.settings.summaryModelId = profile?.summaryModel ?? '';
          } catch {
            const entry = workspace(profile?.nickname ?? '작가');
            entry.work = work;
            draft = entry;
          }
          await db.transaction('rw', [db.assets, db.works, db.workspaces, db.rooms], async () => {
            if (value.assets?.length) await db.assets.bulkPut(value.assets);
            if (draft) await db.workspaces.add(draft);
            else if (room) {
              if (!(await db.works.get(work.id)))
                await db.works.add({
                  id: work.id,
                  work,
                  owned: false,
                  hidden: false,
                  createdAt: Date.now(),
                });
              await db.rooms.add(room);
            }
          });
          value.assets?.forEach(exposeAsset);
          if (draft) {
            navigate(`/create/${draft.id}`);
            notify('제작 중인 작품을 작업 공간으로 열었습니다.');
          } else if (room) navigate(`/chat/${room.id}`);
        } catch (error) {
          notify((error as Error).message);
        }
      }
    });
  }, [ready, profile, notify]);
}
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(installPrompt);
  useEffect(() => {
    const receive = () => setPrompt(installPrompt);
    receive();
    window.addEventListener('xeno-install-available', receive);
    return () => window.removeEventListener('xeno-install-available', receive);
  }, []);
  if (!prompt) return null;
  return (
    <Button
      onClick={() => {
        void prompt
          .prompt()
          .then(() => prompt.userChoice)
          .then(() => {
            installPrompt = null;
            setPrompt(null);
          })
          .catch(() => setPrompt(null));
      }}
    >
      <Download size={16} />앱 설치
    </Button>
  );
}
