import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { languages, useI18n, type Lang } from '../i18n';
import { Logo } from '../components/Layout';
import { Button, inputClass } from '../components/ui';
import { Select } from '../components/Select';

export function Login({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) return setError(t('login.mismatch'));
    setLoading(true);
    try {
      await api.post(setup ? '/api/auth/setup' : '/api/auth/login', { password });
      // First run: remember the language picked here as the hub's language.
      if (setup) await api.put('/api/settings', { language: lang }).catch(() => {});
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[32px] border border-line/60 bg-surface p-8 shadow-lift">
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
        <h1 className="mt-8 text-2xl font-bold tracking-tight">{t(setup ? 'login.welcome' : 'login.welcome_back')}</h1>
        <p className="mt-1 text-sm text-muted">{t(setup ? 'login.setup_hint' : 'login.hint')}</p>
        <div className="mt-6 space-y-3">
          <input type="password" autoFocus className={inputClass} placeholder={t('login.password')} value={password} onChange={(e) => setPassword(e.target.value)} />
          {setup && (
            <input type="password" className={inputClass} placeholder={t('login.repeat')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          )}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        <Button variant="primary" size="lg" className="mt-6 w-full" loading={loading} type="submit">
          {t(setup ? 'login.create' : 'login.enter')}
        </Button>
      </form>
    </div>
  );
}
