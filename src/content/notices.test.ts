import { describe, expect, it } from 'vitest';
import { noticeDate, notices } from './notices';

describe('announcement dates and stable links', () => {
  it('uses Korean calendar days when switching between time and date', () => {
    const now = new Date('2026-10-11T15:30:00Z');
    expect(noticeDate('2026-10-12T00:11:00+09:00', false, now)).toBe('00:11');
    expect(noticeDate('2026-10-11T23:59:00+09:00', false, now)).toBe('26.10.11');
    expect(noticeDate('2026-10-12T00:11:00+09:00', true, now)).toBe('2026.10.12 00:11');
  });
  it('has unique URL-safe IDs and valid publication dates', () => {
    expect(new Set(notices.map((item) => item.id)).size).toBe(notices.length);
    for (const notice of notices) {
      expect(notice.id).toMatch(/^[a-z0-9-]+$/);
      expect(Number.isFinite(Date.parse(notice.publishedAt))).toBe(true);
    }
  });
});
