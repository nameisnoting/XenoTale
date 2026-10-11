export type NoticeCategory = 'patch' | 'other';
export type Notice = {
  id: string;
  category: NoticeCategory;
  title: string;
  publishedAt: string;
  body: string;
};

export const noticeCategories = { patch: '패치노트', other: '기타' } as const;

// New announcements go here. IDs are permanent links; body supports Markdown.
export const notices: Notice[] = [
  {
    id: '2026-10-12-patch',
    category: 'patch',
    title: '2026/10/12 베타테스트 시작',
    publishedAt: '2026-10-12T00:11:00+09:00',
    body: '베타테스트 시작합니다.\n\n잘부탁드립니다.',
  },
  {
    id: 'notices-guide',
    category: 'other',
    title: '공지사항 안내',
    publishedAt: '2026-10-12T00:10:00+09:00',
    body: 'XenoTale의 업데이트와 안내 사항을 이곳에서 확인할 수 있습니다.\n\n업데이트 내용은 **패치노트**, 그 외 안내는 **기타**에 게시됩니다.',
  },
];

export function noticeDate(publishedAt: string, detail = false, now = new Date()) {
  const parts = (date: Date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
  const value = parts(new Date(publishedAt));
  const today = parts(now);
  const date = `${value.year}.${value.month}.${value.day}`;
  const time = `${value.hour}:${value.minute}`;
  if (detail) return `${date} ${time}`;
  return value.year === today.year && value.month === today.month && value.day === today.day
    ? time
    : date;
}
