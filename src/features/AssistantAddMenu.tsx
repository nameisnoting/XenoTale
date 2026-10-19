import { useId, useRef, useState } from 'react';
import { Plus, SlidersHorizontal, ImagePlus, FileText } from 'lucide-react';
import { IconButton, Button, Field, Area, Modal, useNotify } from '../components/UI';
import { DismissibleMenu } from '../components/DismissibleMenu';
import { CREATOR_IMAGES, CREATOR_DOCUMENTS } from '../persistence/creatorAttachments';

export function AssistantAddMenu({
  instructions,
  onInstructionsChange,
  onFiles,
  disabled,
}: {
  instructions: string;
  onInstructionsChange: (text: string) => Promise<void>;
  onFiles: (files: File[]) => Promise<void>;
  disabled: boolean;
}) {
  const menuId = useId();
  const [menu, setMenu] = useState(false),
    [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(''),
    [saving, setSaving] = useState(false);
  const images = useRef<HTMLInputElement>(null),
    documents = useRef<HTMLInputElement>(null);
  const notify = useNotify();
  return (
    <>
      <IconButton
        title="서포터 추가 메뉴"
        aria-controls={menuId}
        aria-expanded={menu}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setMenu(!menu)}
      >
        <Plus size={20} />
      </IconButton>
      <input
        ref={images}
        hidden
        type="file"
        multiple
        accept={CREATOR_IMAGES}
        aria-label="서포터 사진 첨부"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void onFiles(files);
        }}
      />
      <input
        ref={documents}
        hidden
        type="file"
        multiple
        accept={CREATOR_DOCUMENTS}
        aria-label="서포터 문서 첨부"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void onFiles(files);
        }}
      />
      {menu && (
        <DismissibleMenu
          id={menuId}
          label="서포터 추가"
          placement="above"
          align="start"
          onDismiss={() => setMenu(false)}
        >
          <button
            role="menuitem"
            onClick={() => {
              setDraft(instructions);
              setEditing(true);
              setMenu(false);
            }}
          >
            <SlidersHorizontal size={16} />
            <span>
              지침<small className="support-menu-note">모든 작업공간 공통</small>
            </span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              images.current?.click();
              setMenu(false);
            }}
          >
            <ImagePlus size={16} />
            사진
          </button>
          <button
            role="menuitem"
            onClick={() => {
              documents.current?.click();
              setMenu(false);
            }}
          >
            <FileText size={16} />
            문서
          </button>
        </DismissibleMenu>
      )}
      {editing && (
        <Modal
          title="공통 제작 지침"
          onClose={() => {
            if (!saving) setEditing(false);
          }}
        >
          <p className="muted">
            모든 작업공간의 제작 서포터에 적용됩니다. 작품의 대화 프롬프트에는 자동으로 포함되지
            않습니다.
          </p>
          <Field label="지침">
            <Area
              rows={8}
              maxLength={20000}
              value={draft}
              onChange={setDraft}
              placeholder="제작 서포터가 항상 참고할 작성 방식이나 선호 사항을 입력하세요."
            />
          </Field>
          <div className="modal-actions">
            <Button disabled={saving} onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button
              className="primary"
              disabled={saving}
              onClick={async () => {
                if (saving) return;
                setSaving(true);
                try {
                  await onInstructionsChange(draft);
                  setEditing(false);
                  notify('모든 작업공간에 적용할 제작 지침을 저장했습니다.');
                } catch (error) {
                  notify((error as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
