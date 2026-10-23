import { AssistantAddMenu } from './AssistantAddMenu';
import { AssistantFiles, useAssistantFiles } from './AssistantFiles';
import {
  acceptsImages,
  creatorReferences,
  type CreatorAttachment,
} from '../domain/creatorAttachments';
import { prepareCreatorReferences } from '../engine/creatorReferences';
import { MessageInput } from '../components/MessageInput';
import { SendButton } from '../components/SendButton';
import { useMessageDraft } from '../components/useMessageDraft';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { Work } from '../domain/types';
import { id } from '../domain/types';
import type { ModelProps, ApiProps } from './Profile';
import { requestJson } from '../engine/auxiliary';
import { ActionButton, Markdown, useNotify } from '../components/UI';
import { ModelPicker } from '../components/ModelPicker';
import {
  creatorRequest,
  parseCreatorAnswer,
  type CreatorMessage,
} from '../domain/creatorAssistant';
import { reviewCreatorProposal } from '../domain/creatorReview';
import { CreatorProposalCard } from './CreatorProposalCard';
import assistantPrompt from '../engine/prompts/creator_assistant_v2.txt?raw';
import './Assistant.css';

export function Assistant({
  work,
  workspaceId,
  onChange,
  instructions,
  onInstructionsChange,
  attachments,
  onAttachmentsChange,
  modelId,
  onModelChange,
  history,
  onHistoryChange,
  models,
  loadingModels,
  refreshModels,
  resolveModel,
  apiKey,
  onRequestComplete,
}: {
  work: Work;
  workspaceId: string;
  onChange: (w: Work) => void;
  instructions: string;
  onInstructionsChange: (text: string) => Promise<void>;
  attachments: CreatorAttachment[];
  onAttachmentsChange: (files: CreatorAttachment[]) => void;
  modelId: string;
  onModelChange: (modelId: string) => void;
  history: CreatorMessage[];
  onHistoryChange: (history: CreatorMessage[]) => void;
  onRequestComplete: () => void;
} & ModelProps &
  ApiProps) {
  const [input, setInput, beginSend] = useMessageDraft(`workspace.${workspaceId}.agent`);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ reply: '', receivedChars: 0, thinking: false });
  const progressRef = useRef(progress);
  const [picker, setPicker] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const workRef = useRef(work);
  workRef.current = work;
  const historyRef = useRef(history);
  historyRef.current = history;
  const setHistory = (next: CreatorMessage[]) => {
    historyRef.current = next;
    onHistoryChange(next);
  };
  const append = (message: Omit<CreatorMessage, 'id'>) =>
    setHistory([...historyRef.current, { id: id(), ...message }]);
  const transcript = useRef<HTMLDivElement>(null);
  const notify = useNotify();
  const uploads = useAssistantFiles(attachments, onAttachmentsChange, busy, notify);
  const needsImages = attachments.some((file) => file.kind === 'image');
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [history, progress.reply]);
  const send = async () => {
    if ((!input.trim() && !attachments.length) || controller.current || uploads.reading) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setProgress({ reply: '', receivedChars: 0, thinking: false });
    progressRef.current = { reply: '', receivedChars: 0, thinking: false };
    const draft = beginSend();
    const request = draft.text.trim() || '첨부한 자료를 참고해 제작을 도와주세요.';
    const currentAttachments = [...attachments];
    const original = structuredClone(workRef.current);
    try {
      const model = await resolveModel(modelId, active.signal);
      const sourceFiles = creatorReferences(historyRef.current, currentAttachments).filter(
        (file) =>
          file.kind !== 'image' ||
          acceptsImages(model) ||
          currentAttachments.some((current) => current.asset === file.asset),
      );
      const referenceInput =
        model.id === 'demo'
          ? { parts: [] }
          : await prepareCreatorReferences(sourceFiles, model, active.signal);
      const fileDescription = (file: CreatorAttachment) => ({
        name: file.name,
        kind: file.kind,
        reference: file.asset,
        included: sourceFiles.some((source) => source.asset === file.asset),
      });
      const conversation = historyRef.current.slice(-10).map(({ role, text, attachments }) => ({
        role,
        text,
        ...(attachments?.length ? { attachments: attachments.map(fileDescription) } : {}),
      }));
      const previous = [...historyRef.current]
        .reverse()
        .find((message) => message.proposal && !message.applied);
      append({
        role: 'user',
        text: request,
        ...(currentAttachments.length ? { attachments: currentAttachments } : {}),
      });
      if (model.id === 'demo') {
        append({
          role: 'assistant',
          text: '현재는 예시 모드입니다. API 키와 모델을 선택하면 첨부 자료를 읽고 작품 설정을 함께 작성할 수 있습니다.',
        });
        draft.complete();
        onAttachmentsChange([]);
        return;
      }
      const snapshot = creatorRequest(original);
      // A follow-up can refine a proposal that has not been applied yet.
      const pending = previous?.proposal
        ? creatorRequest(
            {
              ...original,
              ...Object.fromEntries(previous.proposal.changes.map((c) => [c.field, c.after])),
            },
            snapshot.assets,
          ).draft
        : null;
      const result = await requestJson(
        assistantPrompt,
        {
          language: 'Korean',
          sharedInstructions: instructions.trim(),
          referenceFiles: currentAttachments.map(fileDescription),
          availableReferences: sourceFiles.map(fileDescription),
          sections: snapshot.sections,
          draftSchema: snapshot.draftSchema,
          draft: snapshot.draft,
          localAssets: Object.keys(snapshot.assets),
          pendingDraft: pending,
          pendingIssues: previous?.proposal
            ? reviewCreatorProposal(original, previous.proposal).issues
            : [],
          request,
          conversation,
        },
        model,
        apiKey,
        active.signal,
        {
          maxTokens: 16384,
          ...referenceInput,
          preserveInvalidOutput: true,
          onProgress: (progress) => {
            progressRef.current = progress;
            setProgress(progress);
          },
        },
      );
      if (active.signal.aborted) {
        draft.restore();
        return;
      }
      const answer = parseCreatorAnswer(result, original, snapshot);
      append({
        role: 'assistant',
        text: [answer.reply, ...answer.questions].filter(Boolean).join('\n\n'),
        proposal:
          answer.proposal.changes.length || answer.proposal.issues?.length
            ? answer.proposal
            : undefined,
      });
      draft.complete();
      onAttachmentsChange([]);
    } catch (e) {
      draft.restore();
      if ((e as Error).name !== 'AbortError') {
        const message = (e as Error).message;
        notify(message);
        append({
          role: 'assistant',
          text: [progressRef.current.reply, `제안을 준비하지 못했습니다. ${message}`]
            .filter(Boolean)
            .join('\n\n'),
        });
      }
    } finally {
      controller.current = null;
      setBusy(false);
      onRequestComplete();
    }
  };
  const apply = (message: CreatorMessage) => {
    if (!message.proposal || message.applied || busy) return;
    try {
      const review = reviewCreatorProposal(workRef.current, message.proposal);
      if (!review.applicable) return;
      onChange(review.work);
      setHistory(
        historyRef.current.map((entry) =>
          entry.id === message.id
            ? { ...entry, applied: true, appliedIssues: review.issues }
            : entry,
        ),
      );
      notify(
        review.issues.length
          ? '오류 표시된 부분을 제외하고 적용했습니다. 실행 취소로 되돌릴 수 있습니다.'
          : '제안을 적용했습니다. 실행 취소로 되돌릴 수 있습니다.',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className="assistant" {...uploads.dragHandlers}>
      <div className="support-transcript" ref={transcript}>
        <p>
          어떤 작품을 만들어볼까요?
          <br />
          원하는 설정이나 수정할 내용을 말씀해 주세요.
        </p>
        {history.map((message) => (
          <Fragment key={message.id}>
            {message.role === 'user' ? (
              <div className="support-user">
                <p>{message.text}</p>
                <AssistantFiles files={message.attachments ?? []} />
              </div>
            ) : (
              <Markdown>{message.text}</Markdown>
            )}
            {message.proposal && (
              <CreatorProposalCard
                message={message}
                work={work}
                busy={busy}
                onApply={() => apply(message)}
              />
            )}
          </Fragment>
        ))}
        {busy && (
          <div aria-label="작성 중인 답변">
            {progress.reply && <Markdown>{progress.reply}</Markdown>}
            <p role="status">
              {progress.receivedChars
                ? `제안을 작성하고 있습니다… ${progress.receivedChars.toLocaleString()}자 수신`
                : progress.thinking
                  ? '모델이 생각하고 있습니다…'
                  : '모델의 응답을 기다리고 있습니다…'}
            </p>
          </div>
        )}
      </div>
      <div className={`support-composer ${uploads.dragging ? 'support-composer-dragging' : ''}`}>
        <AssistantFiles
          files={attachments}
          disabled={busy || uploads.reading}
          onRemove={(id) => onAttachmentsChange(attachments.filter((file) => file.id !== id))}
        />
        <MessageInput
          aria-label="서포터 메시지"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="원하는 설정이나 수정할 내용을 입력하세요"
          onSend={() => void send()}
        />
        <div className="support-composer-actions">
          <AssistantAddMenu
            {...{ instructions, onInstructionsChange }}
            onFiles={uploads.upload}
            disabled={busy || uploads.reading}
          />
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
            disabled={uploads.reading || (!input.trim() && !attachments.length)}
            label="서포터 전송"
            stopLabel="서포터 생성 중단"
            onSend={() => void send()}
            onStop={() => controller.current?.abort()}
          />
        </div>
        {uploads.reading && (
          <p role="status" className="support-file-hint">
            파일을 준비하고 있습니다…
          </p>
        )}
        {needsImages &&
          modelId !== 'demo' &&
          !acceptsImages(models.find((model) => model.id === modelId)) && (
            <p className="support-file-hint">
              사진을 읽으려면 이미지 입력을 지원하는 모델을 선택하세요.
            </p>
          )}
        {uploads.dragging && (
          <div className="support-drop-hint">여기에 사진이나 문서를 놓으세요</div>
        )}
      </div>
      {picker && (
        <ModelPicker
          models={models}
          modelId={modelId}
          creativity={2}
          onSelect={onModelChange}
          onClose={() => setPicker(false)}
          imageInput={needsImages}
          loading={loadingModels}
          onRefresh={refreshModels}
        />
      )}
    </div>
  );
}
