import { MessageInput } from '../components/MessageInput';
import { SendButton } from '../components/SendButton';
import { useEffect, useRef, useState } from 'react';
import type { Profile, Work } from '../domain/types';
import type { ModelProps, ApiProps } from './Profile';
import { requestJson } from '../engine/auxiliary';
import { demoModel } from '../engine/openrouter';
import { ActionButton, Button, Markdown, useNotify } from '../components/UI';
import { ModelPicker } from '../components/ModelPicker';
import {
  creatorRequest,
  parseCreatorAnswer,
  applyCreatorProposal,
  creatorPreview,
  type CreatorProposal,
} from '../domain/creatorAssistant';
import assistantPrompt from '../engine/prompts/creator_assistant_v2.txt?raw';
import './Assistant.css';

export function Assistant({
  work,
  onChange,
  profile,
  models,
  loadingModels,
  refreshModels,
  apiKey,
}: { work: Work; onChange: (w: Work) => void; profile: Profile } & ModelProps & ApiProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [proposal, setProposal] = useState<CreatorProposal | null>(null);
  const [modelId, setModel] = useState(profile.defaultModel);
  const [picker, setPicker] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const workRef = useRef(work);
  workRef.current = work;
  const transcript = useRef<HTMLDivElement>(null);
  const notify = useNotify();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [history, proposal]);
  const send = async () => {
    if (!input.trim() || controller.current) return;
    const model = modelId === 'demo' ? demoModel : models.find((m) => m.id === modelId);
    if (!model) {
      refreshModels();
      notify('모델 목록을 불러온 후 다시 시도해 주세요.');
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setProposal(null);
    const request = input.trim();
    const original = structuredClone(workRef.current);
    setInput('');
    setHistory((h) => [...h, { role: 'user', text: request }]);
    try {
      if (model.id === 'demo') {
        setHistory((h) => [
          ...h,
          {
            role: 'assistant',
            text: '현재는 예시 모드입니다. API 키와 모델을 선택하면 작품 설정을 함께 작성할 수 있습니다.',
          },
        ]);
        return;
      }
      const snapshot = creatorRequest(original);
      // A follow-up can refine a proposal that has not been applied yet.
      const pending = proposal
        ? creatorRequest(
            { ...original, ...Object.fromEntries(proposal.changes.map((c) => [c.field, c.after])) },
            snapshot.assets,
          ).draft
        : null;
      const result = await requestJson(
        assistantPrompt,
        {
          language: 'Korean',
          sections: snapshot.sections,
          draftSchema: snapshot.draftSchema,
          draft: snapshot.draft,
          localAssets: Object.keys(snapshot.assets),
          pendingDraft: pending,
          request,
          conversation: history.slice(-10),
        },
        model,
        apiKey,
        active.signal,
        { maxTokens: 16384 },
      );
      if (active.signal.aborted) return;
      const answer = parseCreatorAnswer(result, original, snapshot);
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          text: [answer.reply, ...answer.questions].filter(Boolean).join('\n\n'),
        },
      ]);
      setProposal(answer.proposal.changes.length ? answer.proposal : null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const message = (e as Error).message;
        notify(message);
        setHistory((h) => [
          ...h,
          { role: 'assistant', text: `제안을 준비하지 못했습니다. ${message}` },
        ]);
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  const apply = () => {
    if (!proposal) return;
    try {
      onChange(applyCreatorProposal(workRef.current, proposal));
      setProposal(null);
      setHistory((h) => [
        ...h,
        {
          role: 'assistant',
          text: `${proposal.sections.map((s) => s.name).join(', ')}에 제안을 적용했습니다.`,
        },
      ]);
      notify('제안을 적용했습니다. 실행 취소로 되돌릴 수 있습니다.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className="assistant">
      <div className="support-transcript" ref={transcript}>
        <p>
          어떤 작품을 만들어볼까요?
          <br />
          원하는 설정이나 수정할 내용을 말씀해 주세요.
        </p>
        {history.map((m, i) =>
          m.role === 'user' ? (
            <p className="support-user" key={i}>
              {m.text}
            </p>
          ) : (
            <Markdown key={i}>{m.text}</Markdown>
          ),
        )}
        {proposal && (
          <section className="support-proposal" aria-label="변경 제안">
            <h4>변경 제안</h4>
            {proposal.sections.map((s) => (
              <details key={s.id}>
                <summary>{s.name}</summary>
                <p>{s.reason}</p>
                <pre>{creatorPreview(s.replacement)}</pre>
              </details>
            ))}
            <p className="muted">적용하면 위 항목이 함께 변경됩니다.</p>
            <Button className="primary full" onClick={apply}>
              적용하기
            </Button>
            <Button className="full" onClick={() => setProposal(null)}>
              제안 닫기
            </Button>
          </section>
        )}
        {busy && <p role="status">변경 제안을 작성하고 있습니다…</p>}
      </div>
      <div className="support-composer">
        <MessageInput
          aria-label="서포터 메시지"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="원하는 설정이나 수정할 내용을 입력하세요"
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
              ? '예시 모드'
              : (models.find((m) => m.id === modelId)?.name ?? modelId)}{' '}
            ›
          </ActionButton>
          <SendButton
            busy={busy}
            disabled={!input.trim()}
            label="서포터 전송"
            stopLabel="서포터 생성 중단"
            onSend={() => void send()}
            onStop={() => controller.current?.abort()}
          />
        </div>
      </div>
      {picker && (
        <ModelPicker
          models={models}
          modelId={modelId}
          creativity={2}
          onSelect={setModel}
          onClose={() => setPicker(false)}
          loading={loadingModels}
          onRefresh={refreshModels}
        />
      )}
    </div>
  );
}
