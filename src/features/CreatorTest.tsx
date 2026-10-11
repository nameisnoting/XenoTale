import { MessageInput } from '../components/MessageInput';
import { SendButton } from '../components/SendButton';
import { useMessageDraft } from '../components/useMessageDraft';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import type { Persona, Room, Work } from '../domain/types';
import { selected } from '../domain/types';
import { addResponse, createPreviewRoom, createRoom } from '../domain/engine';
import { generate } from '../engine/openrouter';
import { ActionButton, Button, Modal, useNotify } from '../components/UI';
import './CreatorTest.css';
import { StoryBody, type EffectRequest } from './StoryBody';
import { EffectPlayer } from '../components/EffectPlayer';
import { canCompleteEffect, completeEffect } from '../domain/effects';
import { ModelPicker } from '../components/ModelPicker';
import type { ApiProps, ModelProps } from './Profile';

// Test conversations are saved inside their workspace; published works and saved rooms are untouched.
export function CreatorTest({
  work,
  workspaceId,
  room,
  onRoomChange,
  persona,
  modelId,
  creativity,
  onModelChange,
  models,
  loadingModels,
  refreshModels,
  resolveModel,
  apiKey,
  openingId,
  onOpeningChange,
  onRequestComplete,
}: {
  work: Work;
  workspaceId: string;
  room: Room | null;
  onRoomChange: (room: Room | null) => void;
  persona?: Persona;
  modelId: string;
  creativity: number;
  onModelChange: (modelId: string, creativity: number) => void;
  openingId: string;
  onOpeningChange: (id: string) => void;
  onRequestComplete: () => void;
} & ApiProps &
  ModelProps) {
  const [effect, setEffect] = useState<EffectRequest | null>(null);
  const [input, setInput] = useMessageDraft(`workspace.${workspaceId}.test`);
  const [picker, setPicker] = useState(false);
  const [openingPicker, setOpeningPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const notify = useNotify();
  const previewRoom = useMemo(
    () => createPreviewRoom(work, modelId, persona, openingId),
    [work, modelId, persona, openingId],
  );
  const displayRoom = room ?? previewRoom;
  const roomRef = useRef(displayRoom);
  roomRef.current = displayRoom;
  const setRoom = (next: Room | null) => {
    roomRef.current = next ?? previewRoom;
    onRoomChange(next);
  };
  useEffect(() => () => abort.current?.abort(), []);
  const reset = () => {
    setRoom(null);
    setInput('');
    setEffect(null);
  };
  const send = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    abort.current = new AbortController();
    try {
      const next = room ? structuredClone(room) : createRoom(work, modelId, persona, openingId);
      next.current.context.settings.modelId = modelId;
      next.current.context.settings.creativity = creativity;
      const model = await resolveModel(modelId, abort.current.signal);
      // Freeze this opening and draft as soon as a test starts. Editing or
      // selecting another opening only affects the next explicit restart.
      setRoom(next);
      const text = input.trim() || '[이어서 내용 전개]';
      const result = await generate(next, next.current, text, model, apiKey, abort.current.signal, {
        reroll: false,
        onPhase: setPhase,
      });
      setRoom(addResponse(next, text, result.result, result.usage));
      setInput('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      abort.current = null;
      onRequestComplete();
    }
  };
  return (
    <div className="creator-test">
      <div className="test-actions">
        <Button disabled={busy} onClick={reset}>
          <RefreshCw size={14} />
          현재 설정으로 다시 시작
        </Button>
      </div>
      <div className="support-transcript">
        <StoryBody
          room={displayRoom}
          disabled={busy}
          onEffect={setEffect}
          source={{ eventId: `opening:${displayRoom.openingId}` }}
          body={displayRoom.work.openings.find((o) => o.id === displayRoom.openingId)?.body ?? ''}
        />
        {room?.timeline.map(
          (t) =>
            t.kind === 'turn' && (
              <div key={t.id}>
                <p className="support-user">
                  {t.input === '[이어서 내용 전개]' ? '이어서 내용 전개' : t.input}
                </p>
                <StoryBody
                  room={room}
                  body={selected(t).body}
                  disabled={busy}
                  onEffect={setEffect}
                  source={{ eventId: t.id, candidateId: t.selectedId }}
                />
              </div>
            ),
        )}
        {busy && (
          <p role="status" className="muted">
            {phase || '답변 준비 중…'}
          </p>
        )}
      </div>
      {work.openings.length > 1 && (
        <Button className="test-opening-change" onClick={() => setOpeningPicker(true)}>
          <span>도입부 변경</span>
          <ChevronRight size={20} />
        </Button>
      )}
      <div className="support-composer">
        <MessageInput
          aria-label="테스트 메시지"
          placeholder="메시지 입력"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div>
          <ActionButton
            className="model-trigger"
            onClick={() => {
              refreshModels();
              setPicker(true);
            }}
          >
            {modelId === 'demo'
              ? '예시 대화'
              : (models.find((m) => m.id === modelId)?.name ?? modelId)}{' '}
            ›
          </ActionButton>
          <SendButton
            busy={busy}
            label="테스트 전송"
            stopLabel="테스트 생성 중단"
            onSend={() => void send()}
            onStop={() => abort.current?.abort()}
          />
        </div>
      </div>
      {picker && (
        <ModelPicker
          models={models}
          modelId={modelId}
          creativity={creativity}
          loading={loadingModels}
          onRefresh={refreshModels}
          onClose={() => setPicker(false)}
          onSelect={onModelChange}
        />
      )}
      {openingPicker && (
        <Modal title="도입부 변경" onClose={() => setOpeningPicker(false)}>
          <div className="test-opening-options">
            {work.openings.map((opening) => (
              <Button
                key={opening.id}
                aria-pressed={opening.id === openingId}
                onClick={() => {
                  onOpeningChange(opening.id);
                  setOpeningPicker(false);
                }}
              >
                {opening.name || '이름 없는 도입부'}
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {effect && displayRoom.work.effects.find((e) => e.id === effect.id) && (
        <EffectPlayer
          effect={displayRoom.work.effects.find((e) => e.id === effect.id)!}
          context={{
            personaName: displayRoom.current.context.persona.name,
            status: displayRoom.current.runtime.status,
            inventory: displayRoom.current.runtime.inventory,
            nodeId: displayRoom.current.runtime.nodeId,
          }}
          readOnly={!canCompleteEffect(displayRoom, effect.id, effect.source)}
          onResult={async (result) => {
            if (lock.current || !roomRef.current)
              throw new Error('답변 생성이 끝난 뒤 실행해 주세요.');
            const next = completeEffect(roomRef.current, effect.id, effect.source, result);
            roomRef.current = next;
            setRoom(next);
          }}
          onClose={() => setEffect(null)}
        />
      )}
    </div>
  );
}
