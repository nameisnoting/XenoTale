import { DisplayText } from '../components/DisplayText';
import { risuChatEntries } from '../domain/risuState';
import { lazy, Suspense } from 'react';
const RisuText = lazy(() =>
  import('../components/RisuText').then((m) => ({ default: m.RisuText })),
);
import { mediaImage } from '../domain/visualNovel';
import type { Checkpoint, EffectSource, Room } from '../domain/types';
import { selected } from '../domain/types';
import { resolveEffect, storyTokens } from '../domain/effects';
import { Avatar, Button, Markdown, safeUrl } from '../components/UI';

export type EffectRequest = {
  id: string;
  source: EffectSource;
  autoPlay?: boolean;
  onClose?: () => void;
};
export function StoryBody({
  body,
  room,
  onEffect,
  source,
  disabled = false,
  checkpoint = room.current,
  effectsOnly = false,
}: {
  body: string;
  room: Room;
  source: Omit<EffectSource, 'occurrence'>;
  onEffect: (request: EffectRequest) => void;
  disabled?: boolean;
  checkpoint?: Checkpoint;
  effectsOnly?: boolean;
}) {
  if (
    !effectsOnly &&
    room.work.risu &&
    (source.eventId.startsWith('opening:') ||
      room.timeline.some(
        (t) =>
          (t.kind === 'turn' || (t.kind === 'action' && t.risuChat)) && t.id === source.eventId,
      ))
  ) {
    const index = risuChatEntries(room).findIndex(
      (t) => t.eventId === source.eventId && t.role !== 'user',
    );
    const turn = room.timeline.find((t) => t.kind === 'turn' && t.id === source.eventId);
    const interactive =
      !turn ||
      turn.kind !== 'turn' ||
      !source.candidateId ||
      selected(turn).id === source.candidateId;
    return (
      <Suspense fallback={<p className="muted">작품 화면 준비 중…</p>}>
        <RisuText
          room={room}
          checkpoint={checkpoint}
          body={body}
          index={index}
          interactive={interactive}
          disabled={disabled}
        />
      </Suspense>
    );
  }
  // Group ordinary/unknown tags back into one Markdown block, preserving paragraphs and positions.
  const chunks: { text: string; tag?: string; occurrence: number }[] = [];
  for (const token of storyTokens(body)) {
    // Retain positions in the saved body: effect validation uses these offsets.
    if (effectsOnly && !(token.tag && resolveEffect(room.work, token.tag))) continue;
    const special =
      (token.tag && mediaImage(room.work, token.tag)) ||
      (token.tag && resolveEffect(room.work, token.tag));
    if (!special && chunks.length && !chunks.at(-1)!.tag) chunks.at(-1)!.text += token.text;
    else chunks.push({ ...token, tag: special ? token.tag : undefined });
  }
  if (!chunks.length) return null;
  return (
    <div className="story-body" id={effectsOnly ? `event-${source.eventId}` : undefined}>
      {chunks.map((chunk, i) => {
        const image = chunk.tag ? mediaImage(room.work, chunk.tag) : '';
        if (image)
          return (
            <img
              className="story-image"
              key={i}
              src={safeUrl(image)}
              alt="장면 이미지"
              loading="lazy"
            />
          );
        const effect = chunk.tag ? resolveEffect(room.work, chunk.tag) : undefined;
        if (effect)
          return (
            <Button
              key={i}
              className="story-effect-button"
              disabled={disabled}
              onClick={() =>
                onEffect({ id: effect.id, source: { ...source, occurrence: chunk.occurrence } })
              }
            >
              {effect.name || '연출'} 보기
            </Button>
          );
        return (
          <DisplayText
            key={i}
            rules={room.work.displayRules}
            render={(text, scripts) => {
              if (/<\/?[a-z][^>]*>/i.test(text))
                return <Markdown executeScripts={scripts}>{text}</Markdown>;
              return text
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((part, j) => {
                  const actor = part.match(/^@([^:\n]+):\s*([\s\S]*)$/);
                  if (!actor) return <Markdown key={j}>{part}</Markdown>;
                  const c = room.work.characters.find((c) => c.name === actor[1]);
                  return (
                    <div className="character-message" key={j}>
                      {room.current.context.settings.profiles && (
                        <Avatar src={c?.image} name={actor[1]} size={56} />
                      )}
                      <div>
                        <strong>{actor[1]}</strong>
                        <Markdown>{actor[2]}</Markdown>
                      </div>
                    </div>
                  );
                });
            }}
          >
            {chunk.text.replaceAll('{{user}}', checkpoint.context.persona.name)}
          </DisplayText>
        );
      })}
    </div>
  );
}
