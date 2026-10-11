import type { Runtime, Work } from './types';

// Demo output explains the UI without inventing story events or changing a work's state.
export function demoTurnBody(work: Work, runtime: Runtime) {
  const character =
    work.characters.find((c) => runtime.presence.includes(c.id)) ?? work.characters[0];
  return [
    '*여기에 지문이 나옵니다.*',
    character ? `@${character.name}: 여기에 캐릭터 대사가 나옵니다.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const demoChoices = ['여기에 추천 답변 1이 나옵니다.', '여기에 추천 답변 2가 나옵니다.'];

export function demoStatusContent(count: number) {
  const lines = Array.from(
    { length: Math.max(1, count) },
    (_, index) => `상태${index + 1}: 여기에 상태값이 나옵니다.`,
  );
  return ['```Status', ...lines, '```'].join('\n');
}

export const demoSummary = (consolidate: boolean) =>
  consolidate ? '여기에 장기기억 요약이 나옵니다.' : '여기에 단기기억 요약이 나옵니다.';
