import { getSetting, setSetting, type DB } from '../../db/index.js';
import { openMeteo } from './openmeteo.js';
import { snapshotAt, WeatherError } from './provider.js';
import type { WeatherForecast, WeatherProvider, WeatherSnapshot } from './provider.js';

export { cleanOffset, MAX_OFFSET_HOURS, snapshotAt, WeatherError } from './provider.js';
export type { WeatherDay, WeatherForecast, WeatherHour, WeatherNow, WeatherProvider, WeatherRequest, WeatherSnapshot } from './provider.js';

/** Every weather source the hub knows. To add one, write a WeatherProvider and list it here. */
export const weatherProviders: WeatherProvider[] = [openMeteo];

export const DEFAULT_WEATHER_PROVIDER = openMeteo.id;

/** The hub-wide choice of weather source (Settings > Weather). */
export interface WeatherConfig {
  provider: string;
  apiKey: string;
}

export function weatherConfig(db: DB): WeatherConfig {
  const saved = getSetting(db, 'weather.provider') ?? '';
  return {
    provider: weatherProviders.some((p) => p.id === saved) ? saved : DEFAULT_WEATHER_PROVIDER,
    apiKey: getSetting(db, 'weather.apiKey') ?? '',
  };
}

export function saveWeatherConfig(db: DB, c: Partial<WeatherConfig>) {
  // A key belongs to one provider: choosing another one forgets it rather than sending it to a stranger.
  if (c.provider !== undefined && weatherProviders.some((p) => p.id === c.provider)) {
    if (c.provider !== weatherConfig(db).provider) setSetting(db, 'weather.apiKey', '');
    setSetting(db, 'weather.provider', c.provider);
  }
  if (c.apiKey !== undefined) setSetting(db, 'weather.apiKey', c.apiKey.trim());
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const cache = new Map<string, { at: number; value: WeatherForecast }>();
/** Fetches under way, so Canvases waking together share one request instead of one each. */
const pending = new Map<string, Promise<WeatherForecast>>();
const TTL_MS = 15 * 60_000;

export function clearWeatherCache() {
  cache.clear();
  pending.clear();
}

/**
 * The chosen provider's forecast for a place. Kept for 15 minutes per source and place (to about
 * 100 m), so a hub with several Canvases asks the service once, not once per picture.
 */
export async function fetchForecast(place: Coordinates, cfg: WeatherConfig, now = Date.now()): Promise<WeatherForecast> {
  const provider = weatherProviders.find((p) => p.id === cfg.provider) ?? openMeteo;
  if (provider.key === 'required' && !cfg.apiKey) throw new WeatherError(`${provider.name} needs an API key (Settings > Weather)`);
  const key = `${provider.id},${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  // Expired entries are dropped, so the cache does not grow with every place ever asked for.
  cache.delete(key);
  const busy = pending.get(key);
  if (busy) return busy;
  const request = provider
    .fetch({ latitude: place.latitude, longitude: place.longitude, apiKey: cfg.apiKey })
    .then((value) => {
      cache.set(key, { at: now, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** The weather at a place, now or `hours` ahead (0 to 47). */
export async function fetchSnapshot(place: Coordinates, cfg: WeatherConfig, hours = 0, now = Date.now()): Promise<WeatherSnapshot> {
  return snapshotAt(await fetchForecast(place, cfg, now), hours);
}
