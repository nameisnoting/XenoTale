import { DisplayText } from '../components/DisplayText';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ClipboardList, Eye, ScrollText, X } from 'lucide-react';
import type { Candidate, Room, Turn } from '../domain/types';
import { selected } from '../domain/types';
import { latestNovelStart, visualNovelPages, type NovelPage } from '../domain/visualNovel';
import { mediaImage } from '../domain/visualNovel';
import { recordedEffect } from '../domain/effects';
import { IconButton, safeUrl, Button } from '../components/UI';
import { StatusDisplay } from '../components/DesignControls';
import type { EffectRequest } from './StoryBody';
import './VisualNovel.css';

export function VisualNovel({
  room,
  busy,
  submittedInput,
  phase,
  suggestions,
  onSuggestion,
  onSwitch,
  onEffect,
  candidate = selected,
  actions,
  onPage,
  jump,
  background,
  onHideUI,
}: {
  room: Room;
  busy: boolean;
  submittedInput: string;
  phase: string;
  suggestions: string[];
  onSuggestion: (text: string) => void;
  onSwitch: () => void;
  onEffect: (effect: EffectRequest) => void;
  candidate?: (turn: Turn) => Candidate;
  actions: (page: NovelPage) => ReactNode;
  onPage?: (page: NovelPage | undefined) => void;
  jump?: { eventId: string; nonce: number };
  background?: string;
  onHideUI: () => void;
}) {
  const pages = useMemo(
    () => visualNovelPages(room, candidate),
    [room.work, room.timeline, room.current.context.persona, candidate],
  );
  const storageKey = `xenotale.vn-cursor.${room.id}`;
  const [cursor, setCursor] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  const index = pages.findIndex((page) => page.key === cursor);
  const currentIndex = index < 0 ? latestNovelStart(pages) : index;
  const page = pages[currentIndex];
  const previousSource = useRef(pages.at(-1)?.key);
  const mounted = useRef(true);
  const playing = useRef(false);
  const [portrait, setPortrait] = useState(true);
  const [status, setStatus] = useState(false);
  const statusRef = useRef<HTMLDialogElement>(null);
  const [loadedImage, setLoadedImage] = useState('');
  const [failedImages, setFailedImages] = useState(new Set<string>());
  const [finishedEffects, setFinishedEffects] = useState(new Set<string>());
  const scene = background ? mediaImage(room.work, background) : page?.background;
  const image = safeUrl(scene && !failedImages.has(scene) ? scene : room.work.cover);
  const ready = !image || loadedImage === image || failedImages.has(image);
  const go = (target: number) => {
    if (target < currentIndex) while (target > 0 && pages[target]?.effectOnly) target--;
    const next = pages[Math.max(0, Math.min(pages.length - 1, target))];
    if (!next) return;
    setCursor(next.key);
    try {
      localStorage.setItem(storageKey, next.key);
    } catch {
      /* View state remains usable. */
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const last = pages.at(-1)?.key;
    if (last !== previousSource.current) {
      previousSource.current = last;
      go(latestNovelStart(pages));
    }
  }, [pages]);
  useEffect(() => {
    onPage?.(page);
  }, [page?.key]);
  useEffect(() => {
    if (jump) {
      const target = pages.findIndex(
        (page) => page.source.eventId === jump.eventId && !page.player,
      );
      if (target >= 0) go(target);
    }
  }, [jump]);
  useLayoutEffect(() => {
    if (!status) return;
    const dialog = statusRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [status]);
  const play = (effects: NovelPage['effects'], after: () => void, i = 0) => {
    if (!mounted.current) return;
    if (i >= effects.length) {
      playing.current = false;
      after();
      return;
    }
    const effect = effects[i];
    if (room.work.effects.find((e) => e.id === effect.id)?.mode !== 'auto') {
      play(effects, after, i + 1);
      return;
    }
    if (recordedEffect(room, effect.id, effect.source)) {
      play(effects, after, i + 1);
      return;
    }
    playing.current = true;
    onEffect({ ...effect, autoPlay: true, onClose: () => play(effects, after, i + 1) });
  };
  const advance = () => {
    if (!page || busy || !ready || playing.current) return;
    play(page.effects, () => {
      setFinishedEffects((previous) => new Set([...previous, page.key]));
      go(currentIndex + 1);
    });
  };
  const autoSeen = useRef(new Set<string>());
  useEffect(() => {
    if (!page?.effectOnly || busy || !ready || playing.current || autoSeen.current.has(page.key))
      return;
    autoSeen.current.add(page.key);
    play(page.effects, () => go(currentIndex + 1));
  }, [page?.key, busy, ready]);
  const persona = room.current.context.persona;
  const effectsPending =
    !!page?.effects.some(
      (effect) =>
        room.work.effects.find((e) => e.id === effect.id)?.mode === 'auto' &&
        !recordedEffect(room, effect.id, effect.source),
    ) && !finishedEffects.has(page?.key ?? '');
  const showChoices =
    !busy &&
    ready &&
    !effectsPending &&
    !!page?.last &&
    currentIndex === pages.length - 1 &&
    room.current.context.settings.choices;
  return (
    <section
      className="visual-novel"
      aria-label="비주얼노벨"
      style={
        {
          '--vn-font-size': `${room.current.context.settings.fontSize}px`,
          '--vn-line-height': `${room.current.context.settings.lineHeight}px`,
          '--vn-letter-spacing': `${room.current.context.settings.letterSpacing}px`,
        } as CSSProperties
      }
    >
      {image && !failedImages.has(image) && (
        <img
          className={`visual-novel-image ${portrait ? 'is-portrait' : 'is-landscape'}`}
          src={image}
          alt="장면 이미지"
          onLoad={(e) => {
            setPortrait(e.currentTarget.naturalHeight >= e.currentTarget.naturalWidth);
            setLoadedImage(image);
          }}
          onError={() => setFailedImages((previous) => new Set([...previous, image]))}
        />
      )}
      {showChoices && (
        <div className="visual-novel-choices">
          {suggestions.filter(Boolean).map((choice, i) => (
            <button key={i} onClick={() => onSuggestion(choice)}>
              {choice}
            </button>
          ))}
        </div>
      )}
      <div
        className={`visual-novel-dialogue ${(busy ? persona.name : page?.actor) ? 'has-speaker' : ''}`}
      >
        <div className="visual-novel-switches">
          <IconButton title="UI 숨기기" onClick={onHideUI}>
            <Eye size={18} />
          </IconButton>
          <IconButton title="상태창 보기" onClick={() => setStatus(true)}>
            <ClipboardList size={18} />
          </IconButton>
          <IconButton title="소설 모드로 전환" disabled={busy} onClick={onSwitch}>
            <ScrollText size={18} />
          </IconButton>
        </div>
        {(busy ? persona.name : page?.actor) && (
          <div className={`visual-novel-name ${busy || page?.player ? 'is-player' : ''}`}>
            {busy ? persona.name : page?.actor}
          </div>
        )}
        <div className="visual-novel-textbox" onClick={advance}>
          <div className="visual-novel-copy">
            <DisplayText rules={room.work.displayRules}>
              {busy
                ? submittedInput === '[이어서 내용 전개]'
                  ? '이어서 내용 전개'
                  : submittedInput
                : page?.text || '이야기를 시작해 주세요.'}
            </DisplayText>
            {!busy &&
              page?.effects
                .filter((e) => room.work.effects.find((x) => x.id === e.id)?.mode !== 'auto')
                .map((e) => (
                  <Button
                    key={e.id + e.source.occurrence}
                    className="story-effect-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEffect({ id: e.id, source: e.source });
                    }}
                  >
                    {room.work.effects.find((x) => x.id === e.id)?.name || '연출'} 보기
                  </Button>
                ))}
          </div>
          <div className="visual-novel-controls" onClick={(e) => e.stopPropagation()}>
            <IconButton
              title="이전 대사"
              disabled={busy || currentIndex <= 0 || playing.current}
              onClick={() => go(currentIndex - 1)}
            >
              <ChevronLeft size={24} />
            </IconButton>
            {busy || !ready ? (
              <span className="visual-novel-waiting" role="status">
                {busy ? '응답 중입니다…' : '이미지 준비 중입니다…'}
                <span className="sr-only">{phase}</span>
              </span>
            ) : page?.last && !page.player && !effectsPending ? (
              <div className="visual-novel-turn-actions">
                {actions(page)}
                {currentIndex < pages.length - 1 && (
                  <IconButton title="다음 대사" onClick={advance}>
                    <ChevronRight size={24} />
                  </IconButton>
                )}
              </div>
            ) : (
              <IconButton
                title="다음 대사"
                disabled={
                  !page || playing.current || (!effectsPending && currentIndex >= pages.length - 1)
                }
                onClick={advance}
              >
                <ChevronRight size={24} />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      {status &&
        createPortal(
          <dialog
            ref={statusRef}
            className="visual-novel-status-overlay"
            aria-label="상태창"
            onCancel={(event) => {
              event.preventDefault();
              setStatus(false);
            }}
            onClick={() => setStatus(false)}
          >
            <IconButton title="상태창 닫기" onClick={() => setStatus(false)}>
              <X size={24} />
            </IconButton>
            <div className="visual-novel-status-content" onClick={(e) => e.stopPropagation()}>
              <StatusDisplay
                work={room.work}
                runtime={page?.checkpoint.runtime ?? room.current.runtime}
                expanded
                demo={false}
              />
            </div>
          </dialog>,
          document.body,
        )}
    </section>
  );
}
