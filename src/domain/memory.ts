import type { Room, Memory } from './types';
import { clone, fingerprint, selected } from './types';
import shortPrompt from '../engine/prompts/summary_short_v2.txt?raw';
import longPrompt from '../engine/prompts/summary_long_v2.txt?raw';
export const SUMMARY_PROMPTS = { short: shortPrompt, long: longPrompt };
export const SUMMARY_POLICY = {
  short: { min: 5, max: 100, step: 5, default: 10 },
  long: { min: 5, max: 50, step: 5, default: 10 },
} as const;
// Recent prose remains available independently of when a summary is generated.
export const RECENT_RAW_TURNS = 10;
export function validMemories(
  room: Room,
  memories = room.current.context.memories,
  timeline = room.timeline,
) {
  const keys = new Set(timeline.filter((t) => t.kind === 'turn').map(fingerprint));
  const events = new Set([
    `opening:${room.openingId}`,
    ...timeline.filter((e) => e.kind !== 'turn').map((e) => e.id),
  ]);
  return memories.filter(
    (m) =>
      m.sources.every((s) => keys.has(s)) && (m.eventSources ?? []).every((s) => events.has(s)),
  );
}
export function activeMemories(
  room: Room,
  memories = room.current.context.memories,
  timeline = room.timeline,
) {
  return validMemories(room, memories, timeline).filter((m) => m.active !== false);
}
export function activeShortMemories(room: Room) {
  return activeMemories(room).filter((m) => m.kind === 'short');
}
export function summarySources(room: Room) {
  const covered = new Set(validMemories(room).flatMap((m) => m.sources));
  return room.timeline.filter((t) => t.kind === 'turn').filter((t) => !covered.has(fingerprint(t)));
}
export function summaryCountdown(room: Room) {
  return Math.max(0, room.current.context.settings.summaryEvery - summarySources(room).length);
}
export function longSummaryCountdown(room: Room) {
  const settings = room.current.context.settings;
  return Math.max(
    0,
    (settings.longEvery - activeShortMemories(room).length) * settings.summaryEvery -
      summarySources(room).length,
  );
}
export function memoryTitle(room: Room, memory: Memory) {
  if (memory.title?.trim()) return memory.title.trim();
  const turns = room.timeline.filter((t) => t.kind === 'turn');
  const sources = new Set(memory.sources);
  const numbers = turns.flatMap((t, i) => (sources.has(fingerprint(t)) ? [i + 1] : []));
  if (!numbers.length) return memory.manual ? '직접 입력한 기억' : '0턴';
  return numbers.length === 1 ? `${numbers[0]}턴` : `${numbers[0]} ~ ${numbers.at(-1)}턴`;
}
// Removing a long memory must not strand its archived source memories.
export function repairMemoryActivity(memories: Memory[]) {
  const longIds = new Set(memories.filter((m) => m.kind === 'long').map((m) => m.id));
  return memories.map((m) =>
    m.active === false && m.consolidatedInto && !longIds.has(m.consolidatedInto)
      ? { ...m, active: true, consolidatedInto: undefined }
      : m,
  );
}
// The summary completes this checkpoint, including an automatic summary on the last turn.
export function applyMemories(room: Room, memories: Memory[]) {
  const next = clone(room);
  next.current.context.memories = clone(memories);
  const last = next.timeline.at(-1);
  if (last) {
    const checkpoint = last.kind === 'turn' ? selected(last).checkpoint : last.after;
    checkpoint.context.memories = clone(memories);
  }
  return next;
}
