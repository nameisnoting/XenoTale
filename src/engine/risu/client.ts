import type { Room, Checkpoint } from '../../domain/types';
import { risuChatEntries } from '../../domain/risuState';
import type { RisuCommand, RisuResult } from './types';
class Client {
  constructor(private id: string) {}
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private sequence = 0;
  private queue = Promise.resolve();
  run(command: RisuCommand): Promise<RisuResult> {
    const task = this.queue.then(
      () =>
        new Promise<RisuResult>((resolve, reject) => {
          const id = ++this.sequence;
          const done = () => {
            clearTimeout(timer);
            this.worker.removeEventListener('message', receive);
            this.worker.removeEventListener('error', fail);
          };
          const timer = setTimeout(() => {
            done();
            this.worker.terminate();
            if (clients.get(this.id) === this) clients.delete(this.id);
            reject(new Error('Risu 처리 시간을 초과했습니다.'));
          }, 10000);
          const receive = (event: MessageEvent) => {
            if (event.data?.id !== id) return;
            done();
            event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
          };
          const fail = () => {
            done();
            reject(new Error('Risu 실행기를 불러오지 못했습니다.'));
          };
          this.worker.addEventListener('message', receive);
          this.worker.addEventListener('error', fail);
          this.worker.postMessage({ id, command });
        }),
    );
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  close() {
    this.worker.terminate();
  }
}
const clients = new Map<string, Client>();
export function risuCommand(room: Room, checkpoint: Checkpoint = room.current): RisuCommand {
  if (!room.work.risu) throw new Error('Risu 실행 설정이 없습니다.');
  return {
    config: room.work.risu,
    state: checkpoint.runtime.risu,
    chats: risuChatEntries(room).map(({ role, data }) => ({ role, data })),
    lore: room.work.lore,
    action: 'display',
    user: checkpoint.context.persona.name,
    character: room.work.title,
  };
}
export function runRisu(roomId: string, command: RisuCommand) {
  let client = clients.get(roomId);
  if (!client) {
    if (clients.size >= 3) {
      const [key, old] = clients.entries().next().value!;
      old.close();
      clients.delete(key);
    }
    client = new Client(roomId);
    clients.set(roomId, client);
  }
  return client.run(command);
}
