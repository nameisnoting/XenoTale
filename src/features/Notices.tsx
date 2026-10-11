import { PageHeader } from '../components/Headers';
import { Tabs } from '../components/Tabs';
import { Markdown } from '../components/UI';
import { navigate, navigateBack } from '../app/navigation';
import { notices, noticeCategories, noticeDate } from '../content/notices';
import './Notices.css';

export function NoticesPage({ noticeId, tab }: { noticeId?: string; tab: string | null }) {
  const category = tab === 'patch' || tab === 'other' ? tab : 'all';
  const listRoute = `/profile/notices${category === 'all' ? '' : `?tab=${category}`}`;
  const notice = notices.find((item) => item.id === noticeId);
  const entries = notices
    .filter((item) => category === 'all' || item.category === category)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return (
    <main className="standalone-page profile-page design-ui notices-page" aria-label="공지사항">
      <PageHeader
        title="공지사항"
        backLabel={noticeId ? '공지 목록으로 돌아가기' : '마이페이지로 돌아가기'}
        onBack={() => navigateBack(noticeId ? listRoute : '/profile')}
      />
      {noticeId ? (
        notice ? (
          <article className="notice-detail">
            <h2>{notice.title}</h2>
            <div className="notice-meta">
              <span>{noticeCategories[notice.category]}</span>
              <time dateTime={notice.publishedAt}>{noticeDate(notice.publishedAt, true)}</time>
            </div>
            <div className="notice-body">
              <Markdown>{notice.body}</Markdown>
            </div>
          </article>
        ) : (
          <p className="notices-empty">존재하지 않는 공지사항입니다.</p>
        )
      ) : (
        <div className="notices-list">
          <Tabs
            label="공지 분류"
            items={[
              { id: 'all', label: '전체' },
              { id: 'patch', label: '패치노트' },
              { id: 'other', label: '기타' },
            ]}
            value={category}
            onChange={(value) =>
              navigate(`/profile/notices${value === 'all' ? '' : `?tab=${value}`}`, true)
            }
          />
          <div
            className="notice-rows"
            role="tabpanel"
            aria-label={`${category === 'all' ? '전체' : noticeCategories[category]} 공지`}
          >
            {entries.map((item) => (
              <button
                className="notice-row"
                key={item.id}
                onClick={() =>
                  navigate(
                    `/profile/notices/${item.id}${category === 'all' ? '' : `?tab=${category}`}`,
                  )
                }
              >
                <span className="notice-category">{noticeCategories[item.category]}</span>
                <span className="notice-title">{item.title}</span>
                <time dateTime={item.publishedAt}>{noticeDate(item.publishedAt)}</time>
              </button>
            ))}
            {!entries.length && <p className="notices-empty">등록된 공지사항이 없습니다.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
