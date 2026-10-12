import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { createPortal } from 'react-dom';
import { createPreviewRoom } from '../../domain/engine';
import { DEFAULT_CHAT_UI } from '../../domain/chatUi';
import { Field, Area, Button, IconButton } from '../../components/UI';
import { CodeValidationButton } from '../../components/CodeValidationButton';
import { ChatContent } from '../Chat';
import { demoModel } from '../../engine/openrouter';
import type { CreatorPanelState } from './useCreatorPanelState';
import { X } from 'lucide-react';

export function ChatUiSection({
  work,
  update,
  profile,
}: Pick<CreatorPanelState, 'work' | 'update' | 'profile'>) {
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (!preview) return;
    const before = document.body.style.overflow;
    const focused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setPreview(false);
    };
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener('keydown', close);
      focused?.focus();
    };
  }, [preview]);
  const value = work.chatUi ?? { code: DEFAULT_CHAT_UI };
  const room = useMemo(() => createPreviewRoom({ ...work, chatUi: value }), [work]);
  return (
    <>
      <h2>대화방 UI</h2>
      <p className="muted">
        다섯 필수 영역에 대화방 기능이 연결됩니다. 소설·비주얼노벨 모두 같은 레이아웃을 사용합니다.
      </p>
      <Field label="코드 입력">
        <Area
          rows={18}
          value={value.code}
          onChange={(code) => update({ chatUi: { ...value, code, validation: undefined } })}
        />
      </Field>
      <Field label="외부 리소스 (이미지·음악 주소, 한 줄에 하나)">
        <Area
          rows={2}
          value={(value.resources ?? []).join('\n')}
          onChange={(text) =>
            update({
              chatUi: {
                ...value,
                resources: text
                  .split('\n')
                  .map((url) => url.trim())
                  .filter(Boolean),
                validation: undefined,
              },
            })
          }
        />
      </Field>
      <div className="form-row code-actions">
        <Button onClick={() => setPreview(true)}>
          <Eye size={15} />
          미리보기
        </Button>
        <CodeValidationButton
          code={value.code}
          resources={value.resources}
          validation={value.validation}
          kind="ui"
          work={work}
          onValidated={(validation) => update({ chatUi: { ...value, validation } })}
        />
      </div>
      <p className="muted">
        레이아웃·코드 실행 오류와 필수 영역을 검사합니다. 외부 통신·앱 저장소·부모 화면 접근은
        차단됩니다.
      </p>
      {preview &&
        createPortal(
          <div
            className="chat-ui-preview"
            role="dialog"
            aria-modal="true"
            aria-label="대화방 UI 미리보기"
          >
            <header>
              <strong>대화방 UI 미리보기</strong>
              <IconButton title="미리보기 닫기" onClick={() => setPreview(false)}>
                <X size={24} />
              </IconButton>
            </header>
            <ChatContent
              room={room}
              preview
              profile={{ ...profile, defaultModel: 'demo', summaryModel: 'demo' }}
              models={[demoModel]}
              loadingModels={false}
              refreshModels={() => {}}
              resolveModel={async () => demoModel}
              apiKey=""
              setApiKey={async () => {}}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
