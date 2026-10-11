import type { Quality } from './types';

const style: Record<string, string> = {
  라이트노벨:
    'STYLE: Use readable, character-centered light-novel prose, expressive dialogue, and well-timed banter or emotion when appropriate. Let humor and heightened reactions fit the characters; do not force tropes, a first-person viewpoint, or fast pacing.',
  판타지:
    'STYLE: Evoke wonder through the established world, its places, cultures, magic, and material detail. Weave supplied lore naturally into the scene without inventing contradictory lore or making every everyday exchange epic.',
  무협: 'STYLE: Use a restrained wuxia register appropriate to this work, with precise martial movement, weighty dialogue, and the social meaning of honor or obligation when relevant. Use only established techniques and powers; avoid decorative jargon and universal archaic speech.',
  TRPG: 'STYLE: Make the situation, actionable opportunities, and plausible stakes clear through the scene. Describe the effects of committed game outcomes concretely. Keep tactics and consequences understandable without inventing dice results, mechanics, menus, or a choice for the player.',
};
const ratio: Record<string, string> = {
  '지문 우선':
    'RATIO: Favor narration, approximately 70% of visible story prose, with purposeful dialogue for the remainder. Treat this as a flexible target, not a quota.',
  균등: 'RATIO: Balance narration and dialogue approximately equally, allowing the current scene to determine individual paragraph lengths.',
  '대사 우선':
    'RATIO: Favor spoken dialogue, approximately 85% of visible story prose. Keep narration concise but retain necessary actions, attribution, and context.',
};
const pacing: Record<string, string> = {
  느림: 'PACING: Linger on the current beat, its reactions, atmosphere, and subtext. Deepen the moment rather than repeating it or introducing an unrelated incident.',
  보통: 'PACING: Advance the scene by a natural, meaningful beat while giving the player room to respond.',
  빠름: 'PACING: Move briskly through routine details toward useful consequences or decisions. Never skip a pending player choice or assume their next action to accelerate the plot.',
};
const length: Record<string, string> = {
  짧음: 'LENGTH: Aim for about 1,000 characters in body, excluding choices and JSON. This is an approximate visible-text target, not a minimum: stop earlier at a meaningful player decision and avoid padding.',
  보통: 'LENGTH: Aim for about 2,000 characters in body, excluding choices and JSON. This is an approximate visible-text target, not a minimum: stop earlier at a meaningful player decision and avoid padding.',
  많음: 'LENGTH: Aim for about 3,000 characters in body, excluding choices and JSON. Use the space for meaningful scene detail and character interaction; never continue past a player decision merely to reach the target.',
};
const difficulty: Record<string, string> = {
  쉬움: 'DIFFICULTY: Make useful clues and opportunities accessible. Let reasonable, supported attempts succeed, while respecting established limits and avoiding automatic success or universal agreement.',
  보통: 'DIFFICULTY: Balance believable obstacles with attainable opportunities. Make consequences proportionate to the action, preparation, and established situation.',
  어려움:
    'DIFFICULTY: Make risky goals demand preparation, resources, or a sound approach. Signal meaningful risks through the fiction and allow earned success; do not erase progress or invent impossible opposition.',
  억까: "DIFFICULTY: Portray a harsh, often unfair fictional situation with frequent plausible setbacks and adverse circumstances. Keep causes consistent with the work, preserve ways to respond, and never rewrite committed results, grant arbitrary opponent powers, or decide the player's reaction.",
};

export function buildQualityDirectives(q: Quality): string[] {
  const instructions = [
    style[q.style],
    ratio[q.ratio],
    pacing[q.pacing],
    length[q.length],
    difficulty[q.difficulty],
  ].filter((instruction): instruction is string => typeof instruction === 'string');
  // IDs stay machine-readable and are resolved against the supplied directory.
  // Missing selectors mean the player, matching the creator's UI defaults.
  const actor = JSON.stringify(q.viewpointActorId ?? 'user');
  const target = JSON.stringify(q.viewpointTargetId ?? 'user');
  const viewpoint: Record<string, string> = {
    '1인칭 주인공': `VIEWPOINT: Use first-person narration centered on character ID ${actor}. An NPC viewpoint may include that NPC's justified perceptions and thoughts, subject to secret-disclosure conditions. If the holder is user, use only the human's supplied actions and experiences; never invent their speech, feelings, thoughts, or decisions.`,
    '1인칭 관찰자': `VIEWPOINT: Narrate in first person from observer ID ${actor}, observing target ID ${target}. Limit information to what the observer can perceive or justifiably know; do not turn an observation into access to another mind. If the observer is user, never invent the human's speech, thoughts, feelings, or voluntary actions.`,
    '3인칭 관찰자': `VIEWPOINT: Use third-person observer narration centered on target ID ${target}, emphasizing observable actions, speech, and surroundings. Express inferred emotion as an observation rather than a certain hidden fact; do not enter the player's mind or disclose unrevealed secrets.`,
    '전지적 작가':
      "VIEWPOINT: Use third-person omniscient narration. You may portray NPC psychology grounded in supplied facts when disclosure conditions permit, but omniscience never authorizes the player's unprovided thoughts, feelings, speech, decisions, or actions.",
  };
  const selectedViewpoint = viewpoint[q.viewpoint];
  if (typeof selectedViewpoint === 'string') instructions.push(selectedViewpoint);
  if (q.events === '없음')
    instructions.push(
      'EVENTS: Develop the current scene and consequences of established actions. Do not manufacture unrelated interruptions or fresh crises to satisfy an event quota. NPC initiative and ordinary reactions remain possible.',
    );
  else if (['적음', '보통', '빈번'].includes(q.events))
    instructions.push(
      'EVENTS: Follow the supplied eventCue when present; introduce at most one fitting opportunity, complication, or discovery without overriding a pending player decision. Otherwise continue the current scene without forcing a scheduled event. Do not count turns yourself.',
    );
  return instructions;
}
