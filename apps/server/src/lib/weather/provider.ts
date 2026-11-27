/**
 * What the hub needs from a weather source, whatever service it comes from. A provider turns
 * its own answer into a neutral forecast; everything that uses the weather is built from that
 * forecast only, never from a provider's own format. Temperatures are degrees Celsius, wind is
 * km/h, times are local at the place ("YYYY-MM-DDTHH:MM", no time zone suffix) and weather is a
 * WMO weather interpretation code (0 clear, 3 overcast, 63 rain, 95 thunderstorm...).
 */

/** Conditions right now. */
export interface WeatherNow {
  time: string;
  code: number;
  temperature: number;
  wind: number | null;
  isDay: boolean;
}

/** Conditions for one full hour. */
export interface WeatherHour {
  /** The start of the hour, local, e.g. "2026-11-21T14:00". */
  time: string;
  code: number;
  temperature: number;
  wind: number | null;
  isDay: boolean;
  /** Chance of rain in percent, or null when the provider has none. */
  rain: number | null;
}

/** Summary of one day. */
export interface WeatherDay {
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** The sky of the day as a whole, or null when unknown. */
  code: number | null;
  high: number | null;
  low: number | null;
  /** Highest chance of rain of the day in percent, or null. */
  rain: number | null;
  sunrise: string | null;
  sunset: string | null;
}

/**
 * What a provider returns: now, the hours from the current one onward and the days from today
 * onward. It has to cover at least MAX_OFFSET_HOURS hours ahead (a place's local midnight may
 * fall in between, so three days).
 */
export interface WeatherForecast {
  current: WeatherNow;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface WeatherRequest {
  latitude: number;
  longitude: number;
  /** The key saved in Settings; empty when none was given. */
  apiKey: string;
}

export interface WeatherProvider {
  /** Stable identifier, saved in the settings. */
  id: string;
  /** Name shown in Settings. */
  name: string;
  /** Whether the service needs an API key: never, may use one, or cannot work without. */
  key: 'none' | 'optional' | 'required';
  /** Fetch the forecast for a place; throw a WeatherError with a readable message when it fails. */
  fetch(req: WeatherRequest): Promise<WeatherForecast>;
}

/** A failure the user can read: no answer, a bad key, no forecast for that hour. */
export class WeatherError extends Error {}

/**
 * The weather at one moment, with the figures of that day: this is what the rest of the hub
 * uses (the label on a picture, the placeholders of a prompt).
 */
export interface WeatherSnapshot {
  code: number;
  temperature: number;
  /** The day's highest and lowest temperature, when the provider has them. */
  high: number | null;
  low: number | null;
  wind: number | null;
  /** Chance of rain that day in percent, or null. */
  rain: number | null;
  /** Sky for the label: of that hour when looking ahead, of the day as a whole for now. */
  dayCode: number | null;
  isDay: boolean;
  /** Local time of the moment this snapshot is for, "YYYY-MM-DDTHH:MM". */
  time: string;
  sunrise: string | null;
  sunset: string | null;
}

export const MAX_OFFSET_HOURS = 47;

/** Whole hours ahead, 0 to 47; anything else counts as now. */
export function cleanOffset(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_OFFSET_HOURS) : 0;
}

/**
 * The forecast as one snapshot: now, or `hours` ahead. Looking ahead picks the full hour nearest
 * to then (by the clock of the place, so no time zone or DST gets involved) with that day's sun
 * and extremes.
 */
export function snapshotAt(f: WeatherForecast, hours = 0): WeatherSnapshot {
  const now = f.current;
  const offset = cleanOffset(hours);
  let hour: WeatherHour | undefined;
  let time = now.time;
  if (offset) {
    const base = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(now.time)?.[1];
    if (!base) throw new WeatherError('The weather source gave no local time');
    const t = new Date(Date.parse(`${base}:00Z`) + offset * 3600_000);
    t.setUTCMinutes(Math.round((t.getUTCMinutes() + t.getUTCSeconds() / 60) / 60) * 60, 0, 0);
    time = t.toISOString().slice(0, 16);
    hour = f.hourly.find((h) => h.time === time);
    if (!hour) throw new WeatherError('The weather source returned no forecast for that hour');
  }
  const day = f.daily.find((d) => d.date === time.slice(0, 10));
  if (offset && !day) throw new WeatherError('The weather source returned no forecast for that day');
  return {
    code: hour?.code ?? now.code,
    temperature: hour?.temperature ?? now.temperature,
    high: day?.high ?? null,
    low: day?.low ?? null,
    wind: hour ? hour.wind : now.wind,
    rain: day?.rain ?? null,
    dayCode: hour ? hour.code : (day?.code ?? now.code),
    isDay: hour?.isDay ?? now.isDay,
    time,
    sunrise: day?.sunrise ?? null,
    sunset: day?.sunset ?? null,
  };
}
