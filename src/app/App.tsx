import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { db, initialize, useLive } from '../persistence/db';
import { listModels } from '../engine/openrouter';
import type { Model, Profile } from '../domain/types';
import { useRoute, navigate } from './navigation';
import { Library, RoomManager, enterWorkspace } from '../features/Library';
import { BottomNavigation } from '../components/BottomNavigation';
import { ProfilePage, ProfileLibraryPage, PROFILE_LIBRARIES } from '../features/Profile';
import { Editor } from '../features/Editor';
import { Chat } from '../features/Chat';
import { Button, Spinner, useNotify } from '../components/UI';
import { useApiKey } from '../components/useApiKey';
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>화면을 불러오지 못했습니다</h1>
        <p>저장된 자료는 유지됩니다. 새로고침한 뒤 다시 열어 주세요.</p>
        <Button onClick={() => location.reload()}>새로고침</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <Boundary>
      <Routes />
    </Boundary>
  );
}
function Routes() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const { apiKey, setApiKey, keyReady } = useApiKey();
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoading] = useState(false);
  const loading = useRef(false);
  const notify = useNotify();
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch(() =>
        setError(
          '브라우저의 로컬 저장소를 열지 못했습니다. 저장소 접근을 허용한 뒤 다시 열어 주세요.',
        ),
      );
  }, []);
  const profile = useLive(() => db.profiles.get('profile'), undefined as Profile | undefined);
  const refreshModels = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setLoading(true);
    listModels()
      .then(setModels)
      .catch((e) => notify(e.message))
      .finally(() => {
        loading.current = false;
        setLoading(false);
      });
  }, [notify]);
  const props = { models, loadingModels, refreshModels, apiKey, setApiKey };
  if (error) return <div className="fatal">{error}</div>;
  if (!ready || !profile || !keyReady) return <Spinner />;
  if (!profile.onboarded) return <ProfilePage {...props} profile={profile} onboarding />;
  if (route.startsWith('/create/'))
    return <Editor key={route} workspaceId={route.slice(8)} profile={profile} {...props} />;
  const chatRoute = route.match(/^\/chat\/([^/]+)(?:\/panel\/([^/]+))?$/);
  if (chatRoute)
    return (
      <Chat
        key={chatRoute[1]}
        roomId={chatRoute[1]}
        pagePanel={chatRoute[2]}
        profile={profile}
        {...props}
      />
    );
  const profileLibrary = PROFILE_LIBRARIES.find((item) => route === `/profile/${item.id}`);
  const content = profileLibrary ? (
    <ProfileLibraryPage key={profileLibrary.id} library={profileLibrary.id} profile={profile} />
  ) : route === '/profile' ? (
    <ProfilePage {...props} profile={profile} />
  ) : route === '/rooms' ? (
    <RoomManager profile={profile} />
  ) : (
    <Library profile={profile} />
  );
  return (
    <div className="mobile-navigation-shell">
      <div className="app-route-content">{content}</div>
      <BottomNavigation profile={profile} route={route} onCreate={() => enterWorkspace(profile)} />
    </div>
  );
}
