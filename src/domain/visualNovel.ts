import type { Candidate, Checkpoint, EffectSource, Room, Turn, Work } from './types';
import { selected } from './types';
import { resolveEffect, storyTokens, recordedEffect } from './effects';

export type NovelPage = {
  key: string;
  text: string;
  actor?: string;
  player?: boolean;
  background: string;
  source: Omit<EffectSource, 'occurrence'>;
  checkpoint: Checkpoint;
  effects: { id: string; source: EffectSource }[];
  effectOnly: boolean;
  last: boolean;
};
export function mediaImage(work: Work, code: string) {
  const named = work.media.assets?.find((a) => a.name === code);
  if (named) return named.url;
  const match = code.match(/^(?:img:)?([^/]+)\/([^/]+)$/);
  if (
    !match ||
    (match[1] !== '0' && !work.media.characters.some((c) => c.code === match[1])) ||
    !work.media.situations.some((s) => s.code === match[2])
  )
    return '';
  return work.media.template
    .replaceAll('{{char_code}}', match[1])
    .replaceAll('{{situation_code}}', match[2]);
}
export function visualNovelPages(
  room: Room,
  candidate: (turn: Turn) => Candidate = selected,
): NovelPage[] {
  const pages: NovelPage[] = [];
  let background = room.work.cover;
  let presentationBackground: string | undefined;
  const add = (
    body: string,
    source: NovelPage['source'],
    checkpoint: Checkpoint,
    player = false,
  ) => {
    // Native background actions belong to their checkpoint, just like dialogue
    // image tags. Apply only changes so a persistent setting does not overwrite
    // a later emotional image or rewrite an earlier page in the conversation.
    const requestedBackground = checkpoint.runtime.presentation?.background;
    if (requestedBackground !== presentationBackground) {
      presentationBackground = requestedBackground;
      if (requestedBackground)
        background = mediaImage(room.work, requestedBackground) || background;
    }
    const start = pages.length;
    let offset = 0,
      actor: string | undefined;
    for (const raw of body.split('\n')) {
      const base = offset;
      offset += raw.length + 1;
      if (!raw.trim()) {
        actor = undefined;
        continue;
      }
      const effects: NovelPage['effects'] = [];
      let text = '';
      for (const token of storyTokens(raw)) {
        if (token.tag && mediaImage(room.work, token.tag)) {
          const image = mediaImage(room.work, token.tag);
          if (image) background = image;
        } else {
          const effect = token.tag ? resolveEffect(room.work, token.tag) : undefined;
          if (effect)
            effects.push({
              id: effect.id,
              source: { ...source, occurrence: base + token.occurrence },
            });
          else text += token.text;
        }
      }
      const speech = text.trim().match(/^@([^:\n]+):\s*([\s\S]*)$/);
      if (speech) {
        actor = speech[1];
        text = speech[2];
      } else if (/^\*/.test(text.trim())) actor = undefined;
      if (player) actor = checkpoint.context.persona.name;
      actor = actor?.replaceAll('{{user}}', checkpoint.context.persona.name);
      text = text.trim().replaceAll('{{user}}', checkpoint.context.persona.name);
      if (!text && !effects.length) continue;
      pages.push({
        key: `${source.eventId}:${source.candidateId ?? ''}:${player ? 'user' : 'story'}:${base}`,
        text,
        actor,
        player,
        background,
        source,
        checkpoint,
        effects,
        effectOnly:
          !text &&
          !!effects.length &&
          effects.every((e) => room.work.effects.find((x) => x.id === e.id)?.mode === 'auto'),
        last: false,
      });
      if (!player)
        for (const effect of effects) {
          const record = recordedEffect(room, effect.id, effect.source);
          const applied =
            record?.kind === 'effect' ? record.effectResult?.presentation?.background : undefined;
          if (applied) background = mediaImage(room.work, applied) || background;
        }
    }
    if (pages.length > start) pages[pages.length - 1].last = true;
  };
  const firstTurn = room.timeline.find((event) => event.kind === 'turn');
  const openingCheckpoint = {
    ...room.initial,
    context: {
      ...room.initial.context,
      persona: firstTurn?.before.context.persona ?? room.current.context.persona,
    },
  };
  add(
    room.work.openings.find((o) => o.id === room.openingId)?.body ?? '',
    { eventId: `opening:${room.openingId}` },
    openingCheckpoint,
  );
  for (const event of room.timeline) {
    if (event.kind === 'turn') {
      const response = candidate(event);
      add(
        event.input === '[이어서 내용 전개]' ? '이어서 내용 전개' : event.input,
        { eventId: event.id, candidateId: response.id },
        event.before,
        true,
      );
      add(response.body, { eventId: event.id, candidateId: response.id }, response.checkpoint);
    } else if (
      event.kind === 'chapter' ||
      (event.kind === 'action' && (!event.risuEvent || event.risuChat))
    )
      add(event.body, { eventId: event.id }, event.after);
  }
  return pages;
}
export function latestNovelStart(pages: NovelPage[]) {
  const last = pages.at(-1);
  return last
    ? Math.max(
        0,
        pages.findIndex(
          (page) =>
            !page.player &&
            page.source.eventId === last.source.eventId &&
            page.source.candidateId === last.source.candidateId,
        ),
      )
    : 0;
}
export function chapterMusic(work: Work, nodeId: string) {
  const visited = new Set<string>();
  let node = nodeId;
  while (!visited.has(node)) {
    visited.add(node);
    const chapter = work.chapters.find((c) => c.id === node);
    if (!chapter) return work.openings.find((o) => o.id === node)?.bgm ?? '';
    if (chapter.bgm !== undefined) return chapter.bgm;
    node = chapter.from;
  }
  return '';
}
