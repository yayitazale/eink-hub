import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { isLang, useI18n } from './i18n';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Frames } from './pages/Frames';
import { FrameDetail } from './pages/FrameDetail';
import { Library } from './pages/Library';
import { Immich } from './pages/Immich';
import { Schedule } from './pages/Schedule';
import { SettingsPage } from './pages/Settings';

interface Me {
  authenticated: boolean;
  authDisabled: boolean;
  setupRequired: boolean;
  language: string | null;
}

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/api/auth/me') });
  const { lang, setLang } = useI18n();

  // The hub-wide language (Settings) wins over this browser's guess.
  useEffect(() => {
    const hub = me.data?.language;
    if (isLang(hub) && hub !== lang) setLang(hub);
  }, [me.data?.language]);

  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ['me'] });
    window.addEventListener('hub:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hub:unauthorized', onUnauthorized);
  }, [qc]);

  if (me.isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (!me.data?.authenticated) return <Login setup={!!me.data?.setupRequired} onDone={() => qc.invalidateQueries()} />;

  return (
    <Routes>
      <Route element={<Layout authDisabled={me.data.authDisabled} />}>
        <Route index element={<Frames />} />
        <Route path="frames/:id" element={<FrameDetail />} />
        <Route path="library" element={<Library />} />
        <Route path="immich" element={<Immich />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Frames />} />
      </Route>
    </Routes>
  );
}
