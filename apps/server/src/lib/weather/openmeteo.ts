import { WeatherError, type WeatherDay, type WeatherForecast, type WeatherHour, type WeatherProvider } from './provider.js';

interface OpenMeteo {
  current?: { time?: string; temperature_2m?: number | null; weather_code?: number | null; is_day?: number | null; wind_speed_10m?: number | null };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    is_day?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    sunrise?: (string | null)[];
    sunset?: (string | null)[];
  };
}

/** Open-Meteo's answer as the neutral forecast. Its weather codes already are WMO codes. */
export function forecastFromOpenMeteo(w: OpenMeteo): WeatherForecast {
  const c = w.current;
  if (!c || c.weather_code == null || c.temperature_2m == null || !c.time) throw new WeatherError('Open-Meteo returned no current weather');
  const h = w.hourly;
  const hourly: WeatherHour[] = [];
  for (const [i, time] of (h?.time ?? []).entries()) {
    const code = h?.weather_code?.[i];
    const temperature = h?.temperature_2m?.[i];
    if (code == null || temperature == null) continue;
    hourly.push({ time, code, temperature, wind: h?.wind_speed_10m?.[i] ?? null, isDay: h?.is_day?.[i] !== 0, rain: h?.precipitation_probability?.[i] ?? null });
  }
  const d = w.daily;
  const daily: WeatherDay[] = (d?.time ?? []).map((date, i) => ({
    date,
    code: d?.weather_code?.[i] ?? null,
    high: d?.temperature_2m_max?.[i] ?? null,
    low: d?.temperature_2m_min?.[i] ?? null,
    rain: d?.precipitation_probability_max?.[i] ?? null,
    sunrise: d?.sunrise?.[i] ?? null,
    sunset: d?.sunset?.[i] ?? null,
  }));
  return { current: { time: c.time, code: c.weather_code, temperature: c.temperature_2m, wind: c.wind_speed_10m ?? null, isDay: c.is_day !== 0 }, hourly, daily };
}

/** The default provider: free and without an account (https://open-meteo.com/). */
export const openMeteo: WeatherProvider = {
  id: 'open-meteo',
  name: 'Open-Meteo',
  key: 'none',
  async fetch({ latitude, longitude }) {
    const q = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
      hourly: 'temperature_2m,weather_code,is_day,wind_speed_10m,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: '3',
    });
    const url = `https://api.open-meteo.com/v1/forecast?${q}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'eink-hub' }, signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new WeatherError(`Open-Meteo: ${(err as Error).name === 'TimeoutError' ? 'no answer in time' : ((err as Error).cause as Error | undefined)?.message ?? (err as Error).message}`);
    }
    if (!res.ok) throw new WeatherError(`Open-Meteo answered ${res.status}`);
    const text = await res.text();
    if (text.length > 500_000) throw new WeatherError('Open-Meteo: the answer is too large');
    try {
      return forecastFromOpenMeteo(JSON.parse(text) as OpenMeteo);
    } catch (err) {
      if (err instanceof WeatherError) throw err;
      throw new WeatherError('Open-Meteo returned something that is not a forecast');
    }
  },
};
