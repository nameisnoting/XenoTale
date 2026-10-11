import { useEffect, useRef, useState } from 'react';
import type { Room, Turn, Checkpoint, Profile } from '../../domain/types';
import { withChatModels } from '../../domain/modelSettings';
import { clone } from '../../domain/types';
import { addResponse, branchRoom } from '../../domain/engine';
import { db, commitRoom } from '../../persistence/db';
import { generate } from '../../engine/openrouter';
import { summarize as summarizeRoom, summarySources } from '../../engine/auxiliary';
import { activeShortMemories, applyMemories } from '../../domain/memory';
import { navigate } from '../../app/navigation';
import { useNotify } from '../../components/UI';
import { useCreditBalance } from '../../components/useCreditBalance';
import { useMessageDraft } from '../../components/useMessageDraft';
import type { ApiProps, ModelProps } from '../Profile';

export const CONTINUE = '[이어서 내용 전개]';

// Own the room snapshot, ordered edits and request lock in one place.
// View components call these actions without managing persistence themselves.
export function useChatSession({
  persistedRoom,
  profile,
  resolveModel,
  apiKey,
}: { persistedRoom: Room; profile: Profile } & Pick<ApiProps, 'apiKey'> &
  Pick<ModelProps, 'resolveModel'>) {
  const notify = useNotify();
  const [room, setRoom] = useState(persistedRoom);
  const balance = useCreditBalance(apiKey);
  const pendingMutations = useRef(0);
  const [input, setInput, beginSend] = useMessageDraft(`room.${room.id}`, room.pendingInput);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const controller = useRef<AbortController | null>(null);
  const queue = useRef(Promise.resolve());
  const lock = useRef(false);
  const current = useRef(room);
  useEffect(() => {
    if (
      !pendingMutations.current &&
      !lock.current &&
      persistedRoom.revision >= current.current.revision
    ) {
      current.current = persistedRoom;
      setRoom(persistedRoom);
    }
  }, [persistedRoom, busy]);
  useEffect(() => () => controller.current?.abort(), []);
  const mutate = (fn: (r: Room) => Room): Promise<unknown> => {
    if (lock.current) return Promise.reject(new Error('답변 생성이 끝난 뒤 변경해 주세요.'));
    const expectedRevision = current.current.revision;
    let next: Room;
    try {
      next = fn(clone(withChatModels(current.current, profile)));
    } catch (e) {
      return Promise.reject(e);
    }
    next.revision = expectedRevision + 1;
    current.current = next;
    setRoom(next);
    pendingMutations.current++;
    // Show edits immediately, then commit the same snapshot in order. A concurrent-tab edit
    // fails the revision check instead of silently replacing it with our optimistic snapshot.
    const task = queue.current
      .then(async () => {
        const saved = await commitRoom(next, expectedRevision);
        if (current.current.revision === saved.revision) {
          current.current = saved;
          setRoom(saved);
        }
        return saved;
      })
      .catch(async (e) => {
        const actual = await db.rooms.get(room.id);
        if (actual) {
          current.current = actual;
          setRoom(actual);
        }
        throw e;
      })
      .finally(() => {
        pendingMutations.current--;
      });
    queue.current = task.then(
      () => {},
      () => {},
    );
    return task;
  };
  const send = async (isReroll = false, extra = '') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setPhase('답변을 준비하고 있습니다…');
    controller.current = new AbortController();
    const draft = isReroll ? undefined : beginSend();
    try {
      await queue.current;
      const stored = await db.rooms.get(room.id);
      if (!stored) throw new Error('대화방이 없습니다.');
      const snapshot = withChatModels(stored, (await db.profiles.get('profile')) ?? profile);
      const settings = snapshot.current.context.settings;
      const model = await resolveModel(settings.modelId, controller.current.signal);
      if (snapshot.current.runtime.ending && !snapshot.current.runtime.ending.allowAfterstory)
        throw new Error('이 이야기는 끝났습니다. 이전 대화에서 분기할 수 있습니다.');
      const last = snapshot.timeline.at(-1);
      if (isReroll && last?.kind !== 'turn') throw new Error('마지막 응답에서 리롤할 수 있습니다.');
      const typed = draft?.text.trim();
      const text = isReroll ? (last as Turn).input : typed || CONTINUE;
      const dice = isReroll
        ? (last as Turn).dice
        : /^\/roll(?:\s|$)/.test(text)
          ? (crypto.getRandomValues(new Uint32Array(1))[0] % 20) + 1
          : undefined;
      const shortcut = [
        ...snapshot.work.shortcuts,
        ...(snapshot.current.context.shortcuts ?? []),
      ].find((s) => text === `/${s.name}` || text.startsWith(`/${s.name} `));
      const before: Checkpoint = isReroll
        ? {
            runtime: clone((last as Turn).before.runtime),
            context: clone(snapshot.current.context),
          }
        : clone(snapshot.current);
      const result = await generate(
        snapshot,
        before,
        text,
        model,
        apiKey,
        controller.current.signal,
        {
          reroll: isReroll,
          directive: [extra, shortcut?.prompt].filter(Boolean).join('\n'),
          dice,
          onPhase: setPhase,
        },
      );
      let saved = await commitRoom(
        addResponse(snapshot, text, result.result, result.usage, { reroll: isReroll, dice }),
        snapshot.revision,
      );
      current.current = saved;
      setRoom(saved);
      draft?.complete();
      if (settings.autoSummary && summarySources(saved).length >= settings.summaryEvery) {
        setPhase('대화를 기억에 정리하고 있습니다…');
        try {
          const summaryModel = await resolveModel(
            settings.summaryModelId,
            controller.current.signal,
          );
          const memories = await summarizeRoom(
            saved,
            summaryModel,
            apiKey,
            controller.current.signal,
          );
          const next = applyMemories(saved, memories);
          saved = await commitRoom(next, saved.revision);
          current.current = saved;
          setRoom(saved);
          if (activeShortMemories(saved).length >= settings.longEvery) {
            const combined = await summarizeRoom(
              saved,
              summaryModel,
              apiKey,
              controller.current.signal,
              true,
            );
            const consolidated = applyMemories(saved, combined);
            saved = await commitRoom(consolidated, saved.revision);
            current.current = saved;
            setRoom(saved);
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError')
            notify(`대화는 저장되었습니다. 자동 요약: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      draft?.restore();
      if ((e as Error).name !== 'AbortError') notify((e as Error).message);
    } finally {
      controller.current = null;
      lock.current = false;
      setBusy(false);
      balance.refresh();
    }
  };
  const summarize = async (long = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setPhase('기억을 정리하고 있습니다…');
    controller.current = new AbortController();
    try {
      await queue.current;
      const latest = withChatModels(
        (await db.rooms.get(room.id))!,
        (await db.profiles.get('profile')) ?? profile,
      );
      const model = await resolveModel(
        latest.current.context.settings.summaryModelId,
        controller.current.signal,
      );
      const memories = await summarizeRoom(latest, model, apiKey, controller.current.signal, long);
      let saved = await commitRoom(applyMemories(latest, memories), latest.revision);
      if (
        !long &&
        saved.current.context.settings.autoSummary &&
        activeShortMemories(saved).length >= saved.current.context.settings.longEvery
      ) {
        const combined = await summarizeRoom(saved, model, apiKey, controller.current.signal, true);
        saved = await commitRoom(applyMemories(saved, combined), saved.revision);
      }
      current.current = saved;
      setRoom(saved);
      notify('기억을 정리했습니다.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify((e as Error).message);
    } finally {
      controller.current = null;
      lock.current = false;
      setBusy(false);
      balance.refresh();
    }
  };
  const makeBranch = async (eventId: string, candidateId?: string) => {
    await queue.current;
    const latest = (await db.rooms.get(room.id))!;
    const next = branchRoom(latest, eventId, candidateId);
    await db.rooms.add(next);
    navigate(`/chat/${next.id}`);
  };
  return {
    room: withChatModels(room, profile),
    input,
    setInput,
    busy,
    phase,
    balance,
    mutate,
    send,
    summarize,
    makeBranch,
    cancel: () => controller.current?.abort(),
  };
}
