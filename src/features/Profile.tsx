import { DeleteAction } from '../components/DeleteAction';
import { hasText, requiresDeleteConfirmation } from '../domain/deletion';
import { NoteLibrary } from '../components/NoteLibrary';
import { PersonaCard } from '../components/PersonaCard';
import { SelectionPill } from '../components/SelectionPill';
export { NoteLibrary } from '../components/NoteLibrary';
import { PageHeader } from '../components/Headers';
import { AddButton } from '../components/AddButton';
import './ProfileLibrary.css';
import { useEffect, useState } from 'react';
import {
  ChevronRight,
  KeyRound,
  VenetianMask,
  BookOpen,
  Library,
  Users,
  ExternalLink,
  Check,
  Loader2,
  Plus,
  Trash2,
  Megaphone,
} from 'lucide-react';
import type { Profile, Model, Persona } from '../domain/types';
import { id } from '../domain/types';
import { db, changeProfile } from '../persistence/db';
import {
  createSharedPersona,
  updateSharedPersona,
  deleteSharedPersona,
} from '../persistence/personas';
import { verifyKey } from '../engine/openrouter';
import { navigate, navigateBack } from '../app/navigation';
import {
  ActionButton,
  Button,
  Field,
  TextInput,
  ImageUpload,
  Modal,
  IconButton,
  Empty,
  useAction,
  useNotify,
} from '../components/UI';
import { ModelPicker } from '../components/ModelPicker';
export const PROFILE_LIBRARIES = [
  { id: 'personas', name: '유저 페르소나', icon: VenetianMask },
  { id: 'notes', name: '유저노트', icon: BookOpen },
  { id: 'lore', name: '마이 로어북', icon: Library },
  { id: 'characters', name: '마이 캐릭터', icon: Users },
] as const;
export type ProfileLibraryId = (typeof PROFILE_LIBRARIES)[number]['id'];
export type ModelProps = { models: Model[]; loadingModels: boolean; refreshModels: () => void };
export type ApiProps = { apiKey: string; setApiKey: (s: string) => void };
export function ProfilePage({
  profile,
  apiKey,
  setApiKey,
  models,
  loadingModels,
  refreshModels,
  onboarding = false,
}: { profile: Profile; onboarding?: boolean } & ModelProps & ApiProps) {
  const [panel, setPanel] = useState<'keys' | 'updates' | null>(null);
  const [nickname, setNickname] = useState(profile.nickname);
  useEffect(() => setNickname(profile.nickname), [profile.nickname]);
  const [checking, setChecking] = useState(false);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const verified = !!apiKey.trim() && verifiedKey === apiKey;
  const [modelTarget, setModelTarget] = useState<'chat' | 'summary' | null>(null);
  const run = useAction();
  const notify = useNotify();
  const label = (modelId: string) =>
    modelId === 'demo' ? '체험 모드' : (models.find((m) => m.id === modelId)?.name ?? modelId);
  const validate = async () => {
    const keyToVerify = apiKey;
    setChecking(true);
    setVerifiedKey(null);
    try {
      await verifyKey(keyToVerify);
      setVerifiedKey(keyToVerify);
      refreshModels();
      notify('유효한 API 키입니다.');
    } finally {
      setChecking(false);
    }
  };
  const keyContents = (
    <section className="api-key-settings">
      <div className="api-key-entry">
        <Field
          label="API key"
          size="small"
          hint="API 키는 이 브라우저에 암호화되어 저장됩니다."
          labelAction={
            <a
              className="external-button"
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noreferrer"
            >
              Openrouter 키 발급
              <ExternalLink size={15} />
            </a>
          }
        >
          <TextInput
            type="password"
            maxLength={1000}
            value={apiKey}
            onChange={(v) => {
              setApiKey(v);
              setVerifiedKey(null);
            }}
            placeholder="Openrouter의 api 키만 이용 가능합니다."
          />
        </Field>
        <div className="api-key-actions">
          <Button disabled={!apiKey || checking} onClick={() => run(validate())}>
            {checking ? (
              <Loader2 className="spin" size={16} />
            ) : verified ? (
              <Check size={16} />
            ) : (
              <KeyRound size={16} />
            )}{' '}
            {checking ? '확인 중…' : verified ? '연결 확인됨' : '키 확인'}
          </Button>
          {!onboarding && (
            <Button
              size="small"
              tone="danger"
              disabled={!apiKey}
              onClick={() => {
                setApiKey('');
                setVerifiedKey(null);
              }}
            >
              저장된 API 키 삭제
            </Button>
          )}
        </div>
      </div>
      <Field label="채팅용 LLM">
        <button
          className="select-button"
          onClick={() => {
            refreshModels();
            setModelTarget('chat');
          }}
        >
          {label(profile.defaultModel)}
          <ChevronRight size={17} />
        </button>
      </Field>
      <Field label="요약용 LLM">
        <button
          className="select-button"
          onClick={() => {
            refreshModels();
            setModelTarget('summary');
          }}
        >
          {label(profile.summaryModel)}
          <ChevronRight size={17} />
        </button>
      </Field>
    </section>
  );
  return (
    <div className={onboarding ? 'onboarding' : 'standalone-page profile-page design-ui'}>
      {onboarding ? (
        <>
          <h1 className="brand">XenoTale</h1>
          <section className="onboarding-card">
            <h2>XenoTale 이용 전 확인해 주세요</h2>
            <Field label="닉네임" required>
              <TextInput value={nickname} onChange={setNickname} />
            </Field>
            {keyContents}
            <Button
              className="primary full"
              disabled={!nickname.trim() || !verified || checking}
              onClick={() =>
                run(
                  changeProfile((p) => {
                    p.nickname = nickname.trim();
                    p.onboarded = true;
                  }),
                )
              }
            >
              XenoTale 시작
            </Button>
            <ActionButton
              className="text-button full"
              onClick={() =>
                run(
                  changeProfile((p) => {
                    p.onboarded = true;
                    p.defaultModel = 'demo';
                    p.summaryModel = 'demo';
                    p.nickname = nickname.trim() || profile.nickname;
                  }),
                )
              }
            >
              키 없이 먼저 둘러보기
            </ActionButton>
          </section>
        </>
      ) : (
        <>
          <PageHeader title="마이페이지" onBack={() => navigate('/')} />
          <div className="profile-content">
            <ImageUpload
              value={profile.image}
              onChange={(image) => run(changeProfile((p) => (p.image = image)))}
              label="프로필"
            />
            <Field label="닉네임">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={() => {
                  if (nickname.trim()) run(changeProfile((p) => (p.nickname = nickname.trim())));
                }}
              />
            </Field>
            <div className="settings-list">
              {[{ id: 'keys', name: 'API 키 관리', icon: KeyRound }, ...PROFILE_LIBRARIES].map(
                (i) => (
                  <button
                    key={i.id}
                    onClick={() =>
                      i.id === 'keys' ? setPanel('keys') : navigate(`/profile/${i.id}`)
                    }
                  >
                    <i.icon size={19} />
                    <span>{i.name}</span>
                    <ChevronRight size={17} />
                  </button>
                ),
              )}
            </div>
            <div className="settings-list secondary">
              <button onClick={() => setPanel('updates')}>
                <Megaphone />
                <span>업데이트 내역</span>
                <ChevronRight />
              </button>
              <a href="https://github.com/nameisnoting" target="_blank" rel="noopener noreferrer">
                <img src="/icons/chat/github.png" width="24" height="24" alt="" />
                <span>개발자 GitHub</span>
                <ExternalLink size={17} />
              </a>
            </div>
            <p className="muted">
              작품과 대화는 이 브라우저에 저장됩니다. 주기적으로 전체 백업을 내려받아 주세요.
            </p>
          </div>
        </>
      )}
      {panel === 'updates' && (
        <Modal title="업데이트 내역" onClose={() => setPanel(null)}>
          <p>v0.2 · 시안 기준 화면 재작성</p>
          <ul>
            <li>대화방 작업 패널과 대화 로그</li>
            <li>페르소나 이미지·성별과 제작 입력 항목 보완</li>
            <li>제작 화면, 마이페이지, 대화방 관리 화면 조정</li>
          </ul>
        </Modal>
      )}
      {!onboarding && panel === 'keys' && (
        <Modal title="API 키 관리" onClose={() => setPanel(null)}>
          {keyContents}
        </Modal>
      )}
      {modelTarget && (
        <ModelPicker
          models={models}
          modelId={modelTarget === 'chat' ? profile.defaultModel : profile.summaryModel}
          creativity={2}
          onClose={() => setModelTarget(null)}
          loading={loadingModels}
          onRefresh={refreshModels}
          onSelect={(modelId) =>
            run(
              changeProfile((p) => {
                if (modelTarget === 'chat') p.defaultModel = modelId;
                else p.summaryModel = modelId;
              }),
            )
          }
        />
      )}
    </div>
  );
}
export function ProfileLibraryPage({
  profile,
  library,
}: {
  profile: Profile;
  library: ProfileLibraryId;
}) {
  const run = useAction();
  const title = PROFILE_LIBRARIES.find((item) => item.id === library)!.name;
  return (
    <main className="standalone-page profile-page design-ui" aria-label={title}>
      <PageHeader
        title={title}
        backLabel="마이페이지로 돌아가기"
        onBack={() => navigateBack('/profile')}
      />
      <div className="profile-library-content">
        {library === 'personas' && (
          <PersonaLibrary
            values={profile.personas}
            onChange={(values) => run(changeProfile((p) => (p.personas = values)))}
            onEdit={(id, patch) => updateSharedPersona(db, id, patch)}
            onAdd={() => run(createSharedPersona(db))}
            onDelete={(id) => deleteSharedPersona(db, id)}
          />
        )}
        {library === 'notes' && (
          <NoteLibrary
            values={profile.notes}
            groups={profile.noteGroups}
            groupIds={profile.noteGroupIds}
            onChange={(values, groups, groupIds) =>
              run(
                changeProfile((p) => {
                  p.notes = values;
                  p.noteGroups = groups;
                  p.noteGroupIds = groupIds;
                }),
              )
            }
          />
        )}
        {library === 'lore' && (
          <>
            {!profile.savedLore.length && (
              <Empty>제작 화면에서 로어북을 저장하면 여기에 나타납니다.</Empty>
            )}
            {profile.savedLore.map((l) => (
              <div className="manage-row" key={l.id}>
                <span>
                  {l.name}
                  <small>{l.entries.length}개 항목</small>
                </span>
                <DeleteAction
                  name={l.name}
                  needsConfirmation={hasText(l.name) || !!l.entries.length}
                  title="로어북 삭제"
                  onDelete={() =>
                    run(
                      changeProfile(
                        (p) => (p.savedLore = p.savedLore.filter((x) => x.id !== l.id)),
                      ),
                    )
                  }
                />
              </div>
            ))}
          </>
        )}
        {library === 'characters' && (
          <>
            {!profile.savedCharacters.length && (
              <Empty>제작 화면에서 캐릭터를 저장하면 여기에 나타납니다.</Empty>
            )}
            {profile.savedCharacters.map((l) => (
              <div className="manage-row" key={l.id}>
                <span>
                  {l.name}
                  <small>{l.characters.length}명</small>
                </span>
                <DeleteAction
                  name={l.name}
                  needsConfirmation={hasText(l.name) || !!l.characters.length}
                  title="캐릭터 모음 삭제"
                  onDelete={() =>
                    run(
                      changeProfile(
                        (p) => (p.savedCharacters = p.savedCharacters.filter((x) => x.id !== l.id)),
                      ),
                    )
                  }
                />
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
export function PersonaLibrary({
  values,
  onChange,
  tabs = false,
  onEdit,
  onAdd,
  onDelete,
}: {
  values: Persona[];
  onChange: (v: Persona[]) => void;
  tabs?: boolean;
  onEdit?: (id: string, patch: Partial<Persona>) => void | Promise<unknown>;
  onAdd?: () => void;
  onDelete?: (id: string) => void | Promise<unknown>;
}) {
  const [active, setActive] = useState(0);
  const deletePersona = async (target: Persona) => {
    if (values.length === 1) return;
    const selectedId = values[Math.min(active, values.length - 1)]?.id;
    const retained = values.filter((v) => v.id !== target.id);
    if (onDelete) await onDelete(target.id);
    else onChange(retained);
    const retainedIndex = retained.findIndex((v) => v.id === selectedId);
    setActive(retainedIndex >= 0 ? retainedIndex : 0);
  };
  const update = (index: number, patch: Partial<Persona>) =>
    onEdit
      ? onEdit(values[index].id, patch)
      : onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const add = () => {
    if (onAdd) {
      onAdd();
      return;
    }
    onChange([
      ...values,
      {
        id: id(),
        name: `페르소나 ${values.length + 1}`,
        defaultName: `페르소나 ${values.length + 1}`,
        image: '',
        prompt: '',
        gender: '',
      },
    ]);
    setActive(values.length);
  };
  return (
    <div className={tabs ? 'creator-personas' : 'persona-library'}>
      {tabs && (
        <div className="tab-pills">
          {values.map((v, i) => (
            <SelectionPill
              key={v.id}
              name={v.name || `페르소나 ${i + 1}`}
              selected={i === Math.min(active, values.length - 1)}
              onSelect={() => setActive(i)}
              deletion={
                values.length === 1
                  ? undefined
                  : {
                      title: '페르소나 삭제',
                      ariaLabel: `${v.name || `페르소나 ${i + 1}`} 삭제`,
                      name: v.name,
                      needsConfirmation: requiresDeleteConfirmation('persona', v),
                      onDelete: () => deletePersona(v),
                    }
              }
            />
          ))}
          <Button onClick={add}>
            <Plus size={18} />
            추가
          </Button>
        </div>
      )}
      {values.map((v, i) =>
        tabs ? (
          i === Math.min(active, values.length - 1) && (
            <PersonaCard
              key={v.id}
              value={v}
              expanded
              collapsible={false}
              onChange={(patch) => update(i, patch)}
            />
          )
        ) : (
          <PersonaCard
            key={v.id}
            value={v}
            expanded
            onChange={(patch) => update(i, patch)}
            onDelete={() =>
              onDelete ? onDelete(v.id) : onChange(values.filter((x) => x.id !== v.id))
            }
          />
        ),
      )}
      {!tabs && <AddButton onClick={add}>페르소나 추가</AddButton>}
    </div>
  );
}
