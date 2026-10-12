import type { Checkpoint, EffectSource, Room } from '../domain/types';
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
}: {
  body: string;
  room: Room;
  source: Omit<EffectSource, 'occurrence'>;
  onEffect: (request: EffectRequest) => void;
  disabled?: boolean;
  checkpoint?: Checkpoint;
}) {
  // Group ordinary/unknown tags back into one Markdown block, preserving paragraphs and positions.
  const chunks: { text: string; tag?: string; occurrence: number }[] = [];
  for (const token of storyTokens(body)) {
    const special =
      token.tag?.startsWith('img:') || (token.tag && resolveEffect(room.work, token.tag));
    if (!special && chunks.length && !chunks.at(-1)!.tag) chunks.at(-1)!.text += token.text;
    else chunks.push({ ...token, tag: special ? token.tag : undefined });
  }
  return (
    <div className="story-body">
      {chunks.map((chunk, i) => {
        const img = chunk.text.match(/^\{\{img:([^/]+)\/([^}]+)\}\}$/);
        if (img) {
          if (
            (img[1] !== '0' && !room.work.media.characters.some((c) => c.code === img[1])) ||
            !room.work.media.situations.some((s) => s.code === img[2])
          )
            return null;
          return (
            <img
              className="story-image"
              key={i}
              src={safeUrl(
                room.work.media.template
                  .replaceAll('{{char_code}}', img[1])
                  .replaceAll('{{situation_code}}', img[2]),
              )}
              alt="장면 이미지"
              loading="lazy"
            />
          );
        }
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
          <div key={i}>
            {chunk.text
              .replaceAll('{{user}}', checkpoint.context.persona.name)
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
              })}
          </div>
        );
      })}
    </div>
  );
}
