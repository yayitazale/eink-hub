import type { Schedule } from './api';
import type { TFunction, TnFunction } from '../i18n';

/** Active BCP 47 locale; set by the I18nProvider whenever the language changes. */
let locale = 'en-GB';
export function setFormatLocale(l: string) {
  locale = l;
}

/**
 * Some browsers (e.g. Chromium/Electron builds with reduced ICU) have no Basque data and
 * silently fall back to another language, so Basque gets a small built-in formatter.
 */
const basqueFallback = () =>
  locale.startsWith('eu') && !Intl.DateTimeFormat.supportedLocalesOf(['eu']).length;
const EU_WEEKDAYS = ['igandea', 'astelehena', 'asteartea', 'asteazkena', 'osteguna', 'ostirala', 'larunbata'];
const EU_UNITS = { second: 'segundo', minute: 'minutu', hour: 'ordu', day: 'egun' } as const;
const pad = (n: number) => String(n).padStart(2, '0');

function relative(value: number, unit: keyof typeof EU_UNITS): string {
  if (basqueFallback()) {
    if (value === 0) return 'orain';
    return value < 0 ? `duela ${-value} ${EU_UNITS[unit]}` : `${value} ${EU_UNITS[unit]} barru`;
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
}

export function relativeTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relative(Math.round(diff), 'second');
  if (abs < 3600) return relative(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relative(Math.round(diff / 3600), 'hour');
  return relative(Math.round(diff / 86400), 'day');
}

export function dateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  // Basque numeric style: 2026/10/12 08:00
  if (basqueFallback()) return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Weekday name, 0 = Sunday, in the active locale. */
export function weekdayName(d: number): string {
  if (basqueFallback()) return EU_WEEKDAYS[d];
  // 2026-06-07 is a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2026, 5, 7 + d));
}

/** Human-readable schedule, e.g. "Every 2 weeks, on Monday at 08:00". */
export function describeSchedule(s: Schedule, t: TFunction, tn: TnFunction): string {
  switch (s.kind) {
    case 'interval':
      return s.hours === 1 ? t('schedule.every_hour') : tn('schedule.every_hours', s.hours);
    case 'days':
      return s.days === 1 ? t('schedule.desc_daily', { at: s.at }) : tn('schedule.desc_days', s.days, { at: s.at });
    case 'weeks':
      return t(s.weeks === 1 ? 'schedule.desc_weekly' : 'schedule.desc_biweekly', { day: weekdayName(s.weekday), at: s.at });
    case 'monthly':
      return t('schedule.desc_monthly', { day: s.day, at: s.at });
    case 'cron':
      return t('schedule.desc_cron', { expr: s.expr });
  }
}
