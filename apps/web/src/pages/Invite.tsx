import { useState, type FormEvent } from 'react';
import { Fingerprint } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Role } from '../lib/me';
import { cancelled, deviceName, passkeysAvailable, registerPasskey } from '../lib/passkeys';
import { useI18n } from '../i18n';
import { Button, Spinner, inputClass } from '../components/ui';
import { AuthCard } from './Login';

interface InviteInfo {
  valid: boolean;
  role?: Role;
  /** Set for a reset link: the account already exists. */
  username?: string | null;
}

/** Sign-up (or account reset) from a one-time link an admin shared. */
export function Invite({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useI18n();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<InviteInfo>(`/api/auth/invite/${token}`) });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'password' | 'passkey' | null>(null);

  if (info.isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );

  const data = info.data;
  const reset = !!data?.username;

  if (!data?.valid)
    return (
      <AuthCard title={t('invite.invalid')} hint={t('invite.invalid_hint')} onSubmit={(e) => e.preventDefault()}>
        <Button variant="primary" size="lg" className="mt-6 w-full" type="button" onClick={onDone}>
          {t('invite.go_login')}
        </Button>
      </AuthCard>
    );

  const run = async (kind: 'password' | 'passkey', fn: () => Promise<unknown>) => {
    setError('');
    setLoading(kind);
    try {
      await fn();
      onDone();
    } catch (err) {
      if (!cancelled(err)) setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError(t('login.mismatch'));
    run('password', () => api.post(`/api/auth/invite/${token}`, { username, password }));
  };

  return (
    <AuthCard
      title={t(reset ? 'invite.reset_title' : 'invite.title')}
      hint={reset ? t('invite.reset_hint', { name: data.username! }) : t('invite.hint', { role: t(`users.role_${data.role!}`) })}
      onSubmit={submit}
    >
      <div className="mt-6 space-y-3">
        {!reset && (
          <input
            className={inputClass}
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            placeholder={t('login.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
        <input
          type="password"
          autoComplete="new-password"
          className={inputClass}
          placeholder={t('login.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input type="password" autoComplete="new-password" className={inputClass} placeholder={t('login.repeat')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <Button
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        type="submit"
        loading={loading === 'password'}
        disabled={(!reset && !username.trim()) || password.length < 6}
      >
        {t(reset ? 'invite.reset_save' : 'invite.create')}
      </Button>
      {passkeysAvailable() && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            {t('invite.or')}
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            icon={<Fingerprint className="size-4" />}
            loading={loading === 'passkey'}
            disabled={!reset && !username.trim()}
            onClick={() => run('passkey', () => registerPasskey(deviceName(), { token, username: reset ? undefined : username }))}
          >
            {t('invite.passkey')}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
