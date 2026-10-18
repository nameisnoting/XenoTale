export const sections = [
  { id: 'overview', name: '작품 개요', required: true },
  { id: 'characters', name: '등장 캐릭터' },
  { id: 'openings', name: '도입부', required: true },
  { id: 'media', name: '미디어' },
  { id: 'personas', name: '추천 페르소나' },
  { id: 'statuses', name: '상태창' },
  { id: 'relations', name: '관계도' },
  { id: 'items', name: '아이템' },
  { id: 'actions', name: '행동·규칙' },
  { id: 'scenarios', name: '시나리오' },
  { id: 'shortcuts', name: '단축어' },
  { id: 'effects', name: '연출' },
];
export const basicSections = sections.slice(0, 4);
export const extraSections = sections.slice(4);
