import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-weather-'));
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { cleanOffset, clearWeatherCache, fetchForecast, fetchSnapshot, saveWeatherConfig, snapshotAt, weatherConfig, weatherProviders, WeatherError } = await import('../src/lib/weather/index.js');
const { forecastFromOpenMeteo, openMeteo } = await import('../src/lib/weather/openmeteo.js');
type Forecast = import('../src/lib/weather/index.js').WeatherForecast;
type Provider = import('../src/lib/weather/index.js').WeatherProvider;

const db = (ensureDirs(), openDb(config.dbPath));

afterEach(() => {
  vi.unstubAllGlobals();
  clearWeatherCache();
});

const hours = (day: string) => Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`);

/** An Open-Meteo answer for 2 days, with `now` as the current local time. */
const openMeteoAnswer = (now: string) => ({
  current: { time: now, temperature_2m: 5, weather_code: 3, is_day: 0, wind_speed_10m: 10 },
  hourly: {
    time: [...hours('2026-11-23'), ...hours('2026-11-24')],
    temperature_2m: Array.from({ length: 48 }, (_, i) => i),
    weather_code: Array.from({ length: 48 }, (_, i) => (i === 11 ? 63 : i === 27 ? 71 : 0)),
    is_day: Array.from({ length: 48 }, (_, i) => (i % 24 >= 8 && i % 24 < 17 ? 1 : 0)),
    wind_speed_10m: Array.from({ length: 48 }, (_, i) => 100 + i),
    precipitation_probability: Array.from({ length: 48 }, (_, i) => i),
  },
  daily: {
    time: ['2026-11-23', '2026-11-24'],
    weather_code: [3, 71],
    temperature_2m_max: [9.6, 4.2],
    temperature_2m_min: [2.1, -1.4],
    precipitation_probability_max: [80, 20],
    sunrise: ['2026-11-23T08:00', '2026-11-24T08:02'],
    sunset: ['2026-11-23T16:45', '2026-11-24T16:44'],
  },
});

const reply = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

describe('Open-Meteo to the neutral forecast', () => {
  it('converts now, the hours and the days', () => {
    const f = forecastFromOpenMeteo(openMeteoAnswer('2026-11-23T06:50'));
    expect(f.current).toEqual({ time: '2026-11-23T06:50', code: 3, temperature: 5, wind: 10, isDay: false });
    expect(f.hourly).toHaveLength(48);
    expect(f.hourly[11]).toEqual({ time: '2026-11-23T11:00', code: 63, temperature: 11, wind: 111, isDay: true, rain: 11 });
    expect(f.daily[1]).toEqual({ date: '2026-11-24', code: 71, high: 4.2, low: -1.4, rain: 20, sunrise: '2026-11-24T08:02', sunset: '2026-11-24T16:44' });
  });

  it('skips the hours Open-Meteo has no value for, and refuses a current weather without one', () => {
    const a = openMeteoAnswer('2026-11-23T06:50');
    (a.hourly.temperature_2m as (number | null)[])[3] = null;
    (a.hourly.weather_code as (number | null)[])[4] = null;
    const f = forecastFromOpenMeteo(a);
    expect(f.hourly).toHaveLength(46);
    expect(f.hourly.some((h) => h.time === '2026-11-23T03:00' || h.time === '2026-11-23T04:00')).toBe(false);
    expect(() => forecastFromOpenMeteo({ current: { time: 'x', temperature_2m: null, weather_code: 3 } })).toThrow('no current weather');
    expect(() => forecastFromOpenMeteo({ current: { time: 'x', temperature_2m: 5, weather_code: null } })).toThrow('no current weather');
  });

  it('throws a readable error without current weather', () => {
    expect(() => forecastFromOpenMeteo({})).toThrow(WeatherError);
    expect(() => forecastFromOpenMeteo({ current: { time: 'x' } })).toThrow('no current weather');
  });

  it('asks for the hours and days, and reports failures readably', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url);
      expect(u.host).toBe('api.open-meteo.com');
      expect(u.searchParams.get('hourly')).toContain('precipitation_probability');
      expect(u.searchParams.get('forecast_days')).toBe('3');
      expect(u.searchParams.get('latitude')).toBe('51.16');
      return reply(openMeteoAnswer('2026-11-23T06:50'));
    });
    expect((await openMeteo.fetch({ latitude: 51.16, longitude: 4.49, apiKey: '' })).hourly).toHaveLength(48);
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, text: async () => '' }));
    await expect(openMeteo.fetch({ latitude: 1, longitude: 1, apiKey: '' })).rejects.toThrow('answered 429');
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, text: async () => 'not json' }));
    await expect(openMeteo.fetch({ latitude: 1, longitude: 1, apiKey: '' })).rejects.toThrow('not a forecast');
  });
});

describe('snapshots', () => {
  const forecast = (now: string): Forecast => forecastFromOpenMeteo(openMeteoAnswer(now));

  it('keeps hours within 0 to 47', () => {
    expect([undefined, 'x', -3, 0, 4, 4.4, 99].map(cleanOffset)).toEqual([0, 0, 0, 0, 4, 4, 47]);
  });

  it("is the weather now with the day's figures and sky", () => {
    expect(snapshotAt(forecast('2026-11-23T06:50'))).toEqual({
      code: 3, temperature: 5, wind: 10, isDay: false, time: '2026-11-23T06:50',
      high: 9.6, low: 2.1, rain: 80, dayCode: 3, sunrise: '2026-11-23T08:00', sunset: '2026-11-23T16:45',
    });
  });

  it('looks ahead to the full hour nearest to then', () => {
    const s = snapshotAt(forecast('2026-11-23T06:50'), 4);
    expect(s).toMatchObject({ time: '2026-11-23T11:00', temperature: 11, code: 63, dayCode: 63, isDay: true, wind: 111, high: 9.6, low: 2.1, rain: 80 });
  });

  it("goes past midnight to the next day's sun and extremes", () => {
    const s = snapshotAt(forecast('2026-11-23T22:40'), 4);
    expect(s).toMatchObject({ time: '2026-11-24T03:00', high: 4.2, low: -1.4, sunrise: '2026-11-24T08:02' });
    expect(snapshotAt(forecast('2026-11-23T22:40'), 20)).toMatchObject({ time: '2026-11-24T19:00' });
  });

  it('says so when the forecast does not reach that far', () => {
    expect(() => snapshotAt(forecast('2026-11-23T22:40'), 40)).toThrow('no forecast for that hour');
  });

  it('works with a provider that has no extremes, rain or wind', () => {
    const f: Forecast = {
      current: { time: '2026-11-23T10:10', code: 0, temperature: 8, wind: null, isDay: true },
      hourly: [],
      daily: [{ date: '2026-11-23', code: null, high: null, low: null, rain: null, sunrise: null, sunset: null }],
    };
    expect(snapshotAt(f)).toMatchObject({ high: null, low: null, rain: null, wind: null, dayCode: 0, sunrise: null });
  });
});

describe('provider choice', () => {
  it('starts with Open-Meteo, and forgets the key when the provider changes', () => {
    expect(weatherConfig(db)).toEqual({ provider: 'open-meteo', apiKey: '' });
    const other: Provider = { id: 'other', name: 'Other', key: 'required', fetch: async () => { throw new WeatherError('x'); } };
    weatherProviders.push(other);
    try {
      saveWeatherConfig(db, { provider: 'other', apiKey: ' secret ' });
      expect(weatherConfig(db)).toEqual({ provider: 'other', apiKey: 'secret' });
      saveWeatherConfig(db, { provider: 'open-meteo' });
      expect(weatherConfig(db)).toEqual({ provider: 'open-meteo', apiKey: '' });
      saveWeatherConfig(db, { provider: 'nonsense' });
      expect(weatherConfig(db).provider).toBe('open-meteo');
    } finally {
      weatherProviders.pop();
    }
  });

  it('asks for a key when the provider needs one, and keeps the forecast for 15 minutes', async () => {
    let calls = 0;
    const needs: Provider = { id: 'keyed', name: 'Keyed', key: 'required', fetch: async () => (calls++, forecastFromOpenMeteo(openMeteoAnswer('2026-11-23T06:50'))) };
    weatherProviders.push(needs);
    try {
      const place = { latitude: 51.16, longitude: 4.49 };
      await expect(fetchForecast(place, { provider: 'keyed', apiKey: '' })).rejects.toThrow('needs an API key');
      await fetchForecast(place, { provider: 'keyed', apiKey: 'k' }, 1_000);
      await fetchForecast({ latitude: 51.1604, longitude: 4.4901 }, { provider: 'keyed', apiKey: 'k' }, 1_000 + 14 * 60_000);
      expect(calls).toBe(1);
      await fetchSnapshot(place, { provider: 'keyed', apiKey: 'k' }, 2, 1_000 + 16 * 60_000);
      expect(calls).toBe(2);
    } finally {
      weatherProviders.pop();
    }
  });
});

describe('cache', () => {
  it('shares a fetch that is already under way, and tries again after a failure', async () => {
    let calls = 0;
    let fail = true;
    const slow: Provider = {
      id: 'slow',
      name: 'Slow',
      key: 'none',
      fetch: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        if (fail) throw new WeatherError('down');
        return forecastFromOpenMeteo(openMeteoAnswer('2026-11-23T06:50'));
      },
    };
    weatherProviders.push(slow);
    try {
      const place = { latitude: 51.16, longitude: 4.49 };
      const cfg = { provider: 'slow', apiKey: '' };
      const failed = await Promise.allSettled([fetchForecast(place, cfg, 1_000), fetchForecast(place, cfg, 1_000), fetchForecast(place, cfg, 1_000)]);
      expect(calls).toBe(1);
      expect(failed.map((r) => r.status)).toEqual(['rejected', 'rejected', 'rejected']);
      fail = false;
      await Promise.all([fetchForecast(place, cfg, 2_000), fetchForecast(place, cfg, 2_000)]);
      expect(calls).toBe(2);
    } finally {
      weatherProviders.pop();
    }
  });
});

describe('API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  beforeAll(async () => {
    app = (await buildApp(db, { logger: false })).app;
  });
  afterAll(() => app.close());

  it('lists providers without ever returning the key', async () => {
    const res = (await app.inject({ url: '/api/settings/weather' })).json();
    expect(res).toMatchObject({ provider: 'open-meteo', apiKeySet: false, providers: [{ id: 'open-meteo', name: 'Open-Meteo', key: 'none' }] });
    expect(res).not.toHaveProperty('apiKey');
  });

  it('answers 400 for an unknown provider, and ignores a key that is not text', async () => {
    const bad = await app.inject({ method: 'PUT', url: '/api/settings/weather', payload: { provider: 'nonsense' } });
    expect(bad.statusCode).toBe(400);
    const odd = await app.inject({ method: 'PUT', url: '/api/settings/weather', payload: { provider: 'open-meteo', apiKey: 123 } });
    expect(odd.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/settings/weather' })).json().apiKeySet).toBe(false);
  });

  it('shows the weather at the hub location, or why it cannot', async () => {
    expect((await app.inject({ url: '/api/weather' })).json()).toEqual({ place: null, weather: null, error: null });
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { location: { name: 'Boechout', country: 'Belgium', countryCode: 'BE', latitude: 51.16, longitude: 4.49 } } });
    vi.stubGlobal('fetch', async () => reply(openMeteoAnswer('2026-11-23T06:50')));
    expect((await app.inject({ url: '/api/weather' })).json()).toMatchObject({ place: { name: 'Boechout' }, weather: { temperature: 5, high: 9.6, low: 2.1, rain: 80 }, error: null });
    clearWeatherCache();
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, text: async () => '' }));
    expect((await app.inject({ url: '/api/weather' })).json()).toMatchObject({ weather: null, error: 'Open-Meteo answered 503' });
  });
});
