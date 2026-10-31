import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
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
import { Invite } from './pages/Invite';
import { MeContext, type Me } from './lib/me';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/api/auth/me') });
  const { lang, setLang } = useI18n();
  const invite = useLocation().pathname.match(/^\/invite\/([\w-]+)$/)?.[1];

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
  // An invite link works signed in or not: accepting it signs in as the new account.
  if (invite) return <Invite token={invite} onDone={() => (window.location.href = '/')} />;
  if (!me.data?.authenticated)
    return <Login setup={!!me.data?.setupRequired} passkeys={me.data?.passkeys ?? 0} onDone={() => qc.invalidateQueries()} />;

  return (
    <MeContext.Provider value={me.data}>
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
    </MeContext.Provider>
  );
}
