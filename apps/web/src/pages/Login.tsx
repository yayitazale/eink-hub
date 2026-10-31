import { useState, type FormEvent, type ReactNode } from 'react';
import { Fingerprint } from 'lucide-react';
import { api } from '../lib/api';
import { cancelled, loginWithPasskey, passkeysAvailable } from '../lib/passkeys';
import { languages, useI18n, type Lang } from '../i18n';
import { Logo } from '../components/Layout';
import { Button, inputClass } from '../components/ui';
import { Select } from '../components/Select';

/** The card shared by the login and invite screens. */
export function AuthCard({ title, hint, children, onSubmit }: { title: string; hint: ReactNode; children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-[32px] border border-line/60 bg-surface p-8 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <Logo />
          <div>
            <Select
              aria-label={t('settings.language')}
              value={lang}
              onChange={(v) => setLang(v as Lang)}
              options={languages.map((l) => ({ value: l.code, label: l.label }))}
              className="h-8! w-auto! gap-1! rounded-full! px-3! text-xs! font-semibold text-ink-2"
            />
          </div>
        </div>
        <h1 className="mt-8 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{hint}</p>
        {children}
      </form>
    </div>
  );
}

export function Login({ setup, passkeys, onDone }: { setup: boolean; passkeys: number; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [username, setUsername] = useState(setup ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'password' | 'passkey' | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) return setError(t('login.mismatch'));
    setLoading('password');
    try {
      await api.post(setup ? '/api/auth/setup' : '/api/auth/login', { username, password });
      // First run: remember the language picked here as the hub's language.
      if (setup) await api.put('/api/settings', { language: lang }).catch(() => {});
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const passkey = async () => {
    setError('');
    setLoading('passkey');
    try {
      await loginWithPasskey();
      onDone();
    } catch (err) {
      if (!cancelled(err)) setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <AuthCard title={t(setup ? 'login.welcome' : 'login.welcome_back')} hint={t(setup ? 'login.setup_hint' : 'login.hint')} onSubmit={submit}>
      <div className="mt-6 space-y-3">
        <input
          className={inputClass}
          autoFocus={!setup}
          autoComplete="username"
          autoCapitalize="none"
          placeholder={t('login.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          autoFocus={setup}
          autoComplete={setup ? 'new-password' : 'current-password'}
          className={inputClass}
          placeholder={t('login.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {setup && (
          <input type="password" autoComplete="new-password" className={inputClass} placeholder={t('login.repeat')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <Button variant="primary" size="lg" className="mt-6 w-full" loading={loading === 'password'} disabled={!username.trim()} type="submit">
        {t(setup ? 'login.create' : 'login.enter')}
      </Button>
      {!setup && passkeys > 0 && passkeysAvailable() && (
        <Button type="button" size="lg" className="mt-3 w-full" icon={<Fingerprint className="size-4" />} loading={loading === 'passkey'} onClick={passkey}>
          {t('login.passkey')}
        </Button>
      )}
    </AuthCard>
  );
}
