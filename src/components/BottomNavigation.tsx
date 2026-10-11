import { useRef, useState } from 'react';
import { Home, MessageSquare, SquarePlus } from 'lucide-react';
import type { Profile } from '../domain/types';
import { navigate } from '../app/navigation';
import { Avatar, useNotify } from './UI';
import './BottomNavigation.css';

export function BottomNavigation({
  profile,
  route,
  onCreate,
}: {
  profile: Profile;
  route: string;
  onCreate: () => Promise<unknown>;
}) {
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);
  const notify = useNotify();
  const create = async () => {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    try {
      await onCreate();
    } catch (error) {
      notify(error instanceof Error ? error.message : '제작 화면을 열지 못했습니다.');
    } finally {
      pending.current = false;
      setCreating(false);
    }
  };
  return (
    <nav className="bottom-navigation" aria-label="하단 내비게이션">
      <button
        data-hover="none"
        aria-current={route === '/' ? 'page' : undefined}
        onClick={() => navigate('/')}
      >
        <Home size={28} />
        <span>메인</span>
      </button>
      <button
        data-hover="none"
        aria-current={route === '/rooms' ? 'page' : undefined}
        onClick={() => navigate('/rooms')}
      >
        <MessageSquare size={28} />
        <span>대화목록</span>
      </button>
      <button data-hover="none" disabled={creating} onClick={() => void create()}>
        <SquarePlus size={28} />
        <span>만들기</span>
      </button>
      <button
        data-hover="none"
        aria-current={route === '/profile' || route.startsWith('/profile/') ? 'page' : undefined}
        onClick={() => navigate('/profile')}
      >
        <Avatar src={profile.image} name={profile.nickname} size={32} />
        <span>마이</span>
      </button>
    </nav>
  );
}
