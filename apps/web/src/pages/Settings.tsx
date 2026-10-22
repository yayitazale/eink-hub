import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Images, ScrollText, ShieldCheck, SlidersHorizontal, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAction, useSettings } from '../lib/hooks';
import { APP_VERSION, CHANGELOG_URL } from '../lib/version';
import { languages, useI18n, type Lang, type MsgKey } from '../i18n';
import { ServerLogs } from '../components/ServerLogs';

const IMMICH_PERMISSIONS_URL = 'https://yayitazale.github.io/eink-hub/guide/immich#api-key-permissions';
import { Button, Card, Field, SectionTitle, Segmented, Spinner, Toggle, inputClass, useConfirm, useToast } from '../components/ui';

type Tab = 'general' | 'immich' | 'security' | 'logs';

function LanguageSettings() {
  const { t, lang, setLang } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const change = async (l: Lang) => {
    setLang(l);
    try {
      // Hub-wide: also used for text drawn on the Canvas (welcome picture, photo dates).
      await api.put('/api/settings', { language: l });
      qc.invalidateQueries();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">{t('settings.language')}</h2>
      <p className="mt-1 text-sm text-muted">{t('settings.language_hint')}</p>
      <select
        aria-label={t('settings.language')}
        className={`${inputClass} mt-5 sm:max-w-xs`}
        value={lang}
        onChange={(e) => change(e.target.value as Lang)}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </Card>
  );
}

function ImmichSettings() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const settings = useSettings();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [test, setTest] = useState<{ ok: boolean; user?: string; error?: string } | null>(null);

  useEffect(() => {
    if (settings.data) setUrl(settings.data.immichUrl);
  }, [settings.data]);

  const save = useAction(() => api.put('/api/settings', { immichUrl: url, ...(key ? { immichApiKey: key } : {}) }), {
    success: t('settings.immich_saved'),
    invalidate: [['settings'], ['immich']],
  });
  const runTest = useAction(() => api.post<{ ok: boolean; user?: string; error?: string }>('/api/settings/immich/test', { url, apiKey: key || undefined }), {
    invalidate: [],
  });
  const remove = useAction(() => api.del('/api/settings/immich'), {
    success: t('settings.immich_removed'),
    invalidate: [['settings'], ['immich'], ['collections']],
  });
  const configured = !!settings.data?.immichUrl || !!settings.data?.immichApiKeySet;
  // The link sits wherever each language puts `{link}` in the sentence.
  const [before, after = ''] = t('settings.immich_hint', { link: '\u0000' }).split('\u0000');

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">Immich</h2>
      <p className="mt-1 text-sm text-muted">
        {before}
        <a href={IMMICH_PERMISSIONS_URL} target="_blank" rel="noreferrer" className="font-semibold underline hover:text-ink">
          {t('settings.immich_hint_link')}
        </a>
        {after}
      </p>
      <div className="mt-5 space-y-4">
        <Field label={t('settings.immich_url')}>
          <input className={inputClass} placeholder="http://192.168.1.20:2283" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="API key" hint={settings.data?.immichApiKeySet ? t('settings.immich_key_set') : undefined}>
          <input
            className={inputClass}
            type="password"
            placeholder={settings.data?.immichApiKeySet ? '••••••••' : ''}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        {test && (
          <p className={`flex items-center gap-2 text-sm font-medium ${test.ok ? 'text-leaf' : 'text-red-600'}`}>
            {test.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{test.ok ? t('settings.immich_connected', { user: test.user ?? '' }) : test.error}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
          <Button loading={runTest.isPending} disabled={!url} onClick={() => runTest.mutate(undefined, { onSuccess: setTest })}>
            {t('settings.immich_test')}
          </Button>
          {configured && (
            <Button
              variant="danger"
              className="sm:ml-auto"
              loading={remove.isPending}
              onClick={async () =>
                (await confirm({ title: t('settings.immich_remove'), message: t('settings.immich_confirm_remove') })) &&
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setUrl('');
                    setKey('');
                    setTest(null);
                  },
                })
              }
            >
              {t('settings.immich_remove')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function HubSettings() {
  const { t } = useI18n();
  const settings = useSettings();
  const [localUrl, setLocalUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [cloudUrl, setCloudUrl] = useState('');
  useEffect(() => {
    if (!settings.data) return;
    setLocalUrl(settings.data.localUrl);
    setExternalUrl(settings.data.externalUrl);
    setCloudUrl(settings.data.cloudUrl);
  }, [settings.data]);
  const save = useAction(() => api.put('/api/settings', { localUrl, externalUrl, cloudUrl }), { success: t('common.saved'), invalidate: [['settings']] });
  const source = settings.data && localUrl === settings.data.localUrl ? t(`localUrl.${settings.data.localUrlSource}` as MsgKey) : '';
  // Detected from Tailscale Serve (Unraid): shown as the placeholder, used while the field is empty.
  const tailscaleUrl = settings.data?.externalUrlSource === 'tailscale' ? settings.data.externalUrlEffective : '';
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">Hub</h2>
      <div className="mt-5 space-y-4">
        <Field label={t('settings.local_url')} hint={`${t('settings.local_url_hint')} ${source}`}>
          <input className={inputClass} placeholder="http://192.168.1.10:8080" value={localUrl} onChange={(e) => setLocalUrl(e.target.value)} />
        </Field>
        <Field
          label={t('settings.external_url')}
          hint={tailscaleUrl && !externalUrl ? `${t('settings.external_url_hint')} ${t('externalUrl.tailscale')}` : t('settings.external_url_hint')}
        >
          <input
            className={inputClass}
            placeholder={tailscaleUrl || 'https://hub.example.ts.net'}
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        </Field>
        <Field label={t('settings.cloud_url')} hint={t('settings.cloud_url_hint')}>
          <input className={inputClass} placeholder="https://hub.example.ts.net:8443" value={cloudUrl} onChange={(e) => setCloudUrl(e.target.value)} />
        </Field>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

function StatsSettings() {
  const { t } = useI18n();
  const settings = useSettings();
  const save = useAction((on: boolean) => api.put('/api/settings', { statsEnabled: on }), { invalidate: [['settings'], ['frames']] });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">{t('settings.stats')}</h2>
      <div className="mt-5">
        <Toggle label={t('settings.stats_toggle')} hint={t('settings.stats_hint')} checked={!!settings.data?.statsEnabled} onChange={(on) => save.mutate(on)} />
      </div>
    </Card>
  );
}

function PasswordSettings() {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const save = useAction(() => api.post('/api/settings/password', { current, password }), { success: t('settings.password_changed'), invalidate: [] });
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">{t('settings.password')}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.password_current')}>
          <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('settings.password_new')}>
          <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-4"
        loading={save.isPending}
        disabled={password.length < 6}
        onClick={() =>
          save.mutate(undefined, {
            onSuccess: () => {
              setCurrent('');
              setPassword('');
            },
          })
        }
      >
        {t('settings.password_change')}
      </Button>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('general');
  if (settings.isLoading) return <Spinner />;
  const label = (icon: ReactNode, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  );
  return (
    <>
      <SectionTitle title={t('nav.settings')} />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-6 max-w-full overflow-x-auto scrollbar-none"
        options={[
          { value: 'general', label: label(<SlidersHorizontal className="size-3.5" />, t('settings.tab_general')) },
          { value: 'immich', label: label(<Images className="size-3.5" />, 'Immich') },
          { value: 'security', label: label(<ShieldCheck className="size-3.5" />, t('settings.tab_security')) },
          { value: 'logs', label: label(<ScrollText className="size-3.5" />, t('settings.tab_logs')) },
        ]}
      />
      {tab === 'general' && (
        <div className="grid max-w-2xl gap-6">
          <LanguageSettings />
          <HubSettings />
          <StatsSettings />
          {/* The sidebar shows the version on desktop; on mobile this is the only place. */}
          <a href={CHANGELOG_URL} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-muted hover:text-ink md:hidden">
            E-Ink Hub v{APP_VERSION}
          </a>
        </div>
      )}
      {tab === 'immich' && (
        <div className="max-w-2xl">
          <ImmichSettings />
        </div>
      )}
      {tab === 'security' && (
        <div className="max-w-2xl">
          <PasswordSettings />
        </div>
      )}
      {tab === 'logs' && <ServerLogs />}
    </>
  );
}
