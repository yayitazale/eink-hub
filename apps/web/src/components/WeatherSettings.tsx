import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type WeatherNow, type WeatherSettings as WeatherSettingsData } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useI18n } from '../i18n';
import { Button, Card, Field, inputClass } from './ui';
import { Select } from './Select';

/** Where the weather comes from. One source for the whole Hub. */
export function WeatherSettings() {
  const { t } = useI18n();
  const weather = useQuery({ queryKey: ['settings', 'weather'], queryFn: () => api.get<WeatherSettingsData>('/api/settings/weather') });
  const now = useQuery({ queryKey: ['weather', 'now'], queryFn: () => api.get<WeatherNow>('/api/weather'), staleTime: 60_000 });
  const [provider, setProvider] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    if (weather.data) setProvider(weather.data.provider);
  }, [weather.data]);

  const save = useAction(() => api.put('/api/settings/weather', { provider, ...(key ? { apiKey: key } : {}) }), {
    success: t('common.saved'),
    invalidate: [['settings', 'weather'], ['weather']],
  });

  const providers = weather.data?.providers ?? [];
  const chosen = providers.find((p) => p.id === provider);
  // The saved key belongs to the saved provider only.
  const keySet = !!weather.data?.apiKeySet && provider === weather.data.provider;
  const w = now.data?.weather;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">{t('weather.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('weather.hint')}</p>
      <div className="mt-5 space-y-4">
        <Field label={t('weather.provider')} group>
          <Select aria-label={t('weather.provider')} value={provider} onChange={setProvider} options={providers.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        {chosen && chosen.key !== 'none' && (
          <Field label={t('weather.key')} hint={keySet ? t('settings.immich_key_set') : undefined}>
            <input className={inputClass} type="password" autoComplete="off" placeholder={keySet ? '••••••••' : ''} value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
        )}
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setKey('') })}>
          {t('common.save')}
        </Button>
        {now.data && (
          <p className="rounded-2xl bg-surface-2 p-4 text-sm">
            {!now.data.place
              ? t('weather.no_location')
              : w
                ? `${w.low == null || w.high == null ? t('weather.now_simple', { place: now.data.place.name, temp: Math.round(w.temperature) }) : t('weather.now', { place: now.data.place.name, temp: Math.round(w.temperature), low: Math.round(w.low), high: Math.round(w.high) })}${w.rain === null ? '' : ` · ${t('weather.rain', { n: Math.round(w.rain) })}`}`
                : now.data.error}
          </p>
        )}
      </div>
    </Card>
  );
}
