import type { FastifyInstance } from 'fastify';
import { setSetting } from '../db/index.js';

import { HttpError, type Ctx } from '../lib/context.js';
import { hubLocation } from '../lib/location.js';
import { fetchSnapshot, saveWeatherConfig, weatherConfig, weatherProviders, WeatherError, type WeatherConfig } from '../lib/weather/index.js';

/** Hub-wide choice of weather source. The key is never sent back, only whether one is set. */
export function weatherRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/settings/weather', async () => {
    const { apiKey, ...c } = weatherConfig(db);
    return { ...c, apiKeySet: !!apiKey, providers: weatherProviders.map((p) => ({ id: p.id, name: p.name, key: p.key })) };
  });

  app.put<{ Body: Partial<WeatherConfig> }>('/api/settings/weather', async (req) => {
    const b = req.body ?? {};
    if (b.provider !== undefined && !weatherProviders.some((p) => p.id === b.provider)) throw new HttpError(400, 'weather_provider_unknown', { provider: String(b.provider) });
    saveWeatherConfig(db, typeof b.apiKey === 'string' && b.apiKey ? { provider: b.provider, apiKey: b.apiKey } : { provider: b.provider });
    return { ok: true };
  });

  /** Forget the key, e.g. when switching to a source that needs none. */
  app.delete('/api/settings/weather/key', async () => {
    setSetting(db, 'weather.apiKey', '');
    return { ok: true };
  });

  /** The weather at the hub's location right now, to check that the chosen source works. */
  app.get('/api/weather', async () => {
    const place = hubLocation(db);
    if (!place) return { place: null, weather: null, error: null };
    try {
      return { place, weather: await fetchSnapshot(place, weatherConfig(db)), error: null };
    } catch (err) {
      return { place, weather: null, error: err instanceof WeatherError ? err.message : 'The weather source could not be reached' };
    }
  });
}
