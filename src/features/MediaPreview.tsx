import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Work } from '../domain/types';
import { Button, safeUrl } from '../components/UI';

function focusPreview(element: HTMLElement | null, alignStart = false) {
  if (!element) return;
  element.focus({ preventScroll: true });
  let scroller = element.parentElement;
  while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  if (!scroller) return;
  const viewport = scroller.getBoundingClientRect();
  const target = element.getBoundingClientRect();
  const top = viewport.top + (parseFloat(getComputedStyle(element).scrollMarginTop) || 0);
  if (alignStart || target.top < top || target.bottom > viewport.bottom)
    scroller.scrollTop += target.top - top;
}

export function MediaPreview({
  media,
  characters,
}: {
  media: Work['media'];
  characters: Work['characters'];
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef<string | null>(null);
  const entries = [
    { characterId: 'common', code: '0', name: '공용' },
    ...media.characters.map((entry, index) => ({
      ...entry,
      name:
        characters.find((character) => character.id === entry.characterId)?.name ||
        `캐릭터 ${index + 1}`,
    })),
  ];
  const selected = entries.find((entry) => entry.code === selectedCode);
  useLayoutEffect(() => {
    if (selected) focusPreview(heading.current, true);
    else if (previous.current !== null) {
      const button = [
        ...(root.current?.querySelectorAll<HTMLButtonElement>('[data-character-code]') ?? []),
      ].find((element) => element.dataset.characterCode === previous.current);
      focusPreview(button ?? null);
    }
    previous.current = selected?.code ?? null;
  }, [selected?.code]);
  const url = (characterCode: string, situationCode: string) =>
    safeUrl(
      media.template
        .replaceAll('{{char_code}}', characterCode)
        .replaceAll('{{situation_code}}', situationCode),
    );
  const firstSituation = media.situations[0]?.code ?? '1';
  return (
    <section ref={root} className="media-preview" aria-label="등록 이미지 미리보기">
      {selected ? (
        <>
          <div className="media-preview-header">
            <Button onClick={() => setSelectedCode(null)}>
              <ArrowLeft size={16} />
              캐릭터 목록으로
            </Button>
            <h4 ref={heading} tabIndex={-1}>
              {selected.name} · 상황 이미지
            </h4>
          </div>
          <div className="media-grid media-situation-grid">
            {media.situations.map((situation) => (
              <figure key={situation.code}>
                <MediaImage
                  key={url(selected.code, situation.code)}
                  src={url(selected.code, situation.code)}
                  alt={`${selected.name} · ${situation.name}`}
                />
                <figcaption>
                  {situation.code} · {situation.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className="media-grid">
          {entries.map((entry) => (
            <button
              key={entry.characterId}
              type="button"
              data-character-code={entry.code}
              aria-label={`${entry.name} 상황 이미지 보기`}
              onClick={() => setSelectedCode(entry.code)}
            >
              <MediaImage
                key={url(entry.code, firstSituation)}
                src={url(entry.code, firstSituation)}
                alt={entry.name}
              />
              <strong>{entry.name}</strong>
              <small>이미지코드: {`{{${entry.code}/${firstSituation}}}`}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function MediaImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className="media-not-found"
      role="img"
      aria-label={`${alt} · 이미지를 불러오지 못했습니다`}
    >
      404 NOT FOUND
    </div>
  ) : (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}
