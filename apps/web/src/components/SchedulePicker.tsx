import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BatteryWarning, CalendarClock } from 'lucide-react';
import { api, type Schedule } from '../lib/api';
import { dateTime, weekdayName } from '../lib/format';
import { useI18n, type MsgKey } from '../i18n';
import { Field, inputClass } from './ui';

type PresetId = 'h1' | 'h3' | 'h6' | 'h12' | 'd1' | 'd2' | 'd3' | 'w1' | 'w2' | 'm1' | 'cron';

const presets: { id: PresetId; label: MsgKey }[] = [
  { id: 'h1', label: 'schedule.every_hour' },
  { id: 'h3', label: 'schedule.preset_h3' },
  { id: 'h6', label: 'schedule.preset_h6' },
  { id: 'h12', label: 'schedule.preset_h12' },
  { id: 'd1', label: 'schedule.preset_d1' },
  { id: 'd2', label: 'schedule.preset_d2' },
  { id: 'd3', label: 'schedule.preset_d3' },
  { id: 'w1', label: 'schedule.preset_w1' },
  { id: 'w2', label: 'schedule.preset_w2' },
  { id: 'm1', label: 'schedule.preset_m1' },
  { id: 'cron', label: 'schedule.preset_cron' },
];

function presetOf(s: Schedule): PresetId {
  switch (s.kind) {
    case 'interval':
      return `h${s.hours}` as PresetId;
    case 'days':
      return `d${s.days}` as PresetId;
    case 'weeks':
      return `w${s.weeks}` as PresetId;
    case 'monthly':
      return 'm1';
    case 'cron':
      return 'cron';
  }
}

/** Switching preset keeps the time/weekday/day already chosen. */
function fromPreset(id: PresetId, prev: Schedule): Schedule {
  const at = 'at' in prev ? prev.at : '07:00';
  if (id.startsWith('h')) return { kind: 'interval', hours: Number(id.slice(1)) as 1 | 3 | 6 | 12 };
  if (id.startsWith('d')) return { kind: 'days', days: Number(id.slice(1)) as 1 | 2 | 3, at };
  if (id.startsWith('w')) return { kind: 'weeks', weeks: Number(id.slice(1)) as 1 | 2, weekday: prev.kind === 'weeks' ? prev.weekday : 1, at };
  if (id === 'm1') return { kind: 'monthly', day: prev.kind === 'monthly' ? prev.day : 1, at };
  return { kind: 'cron', expr: prev.kind === 'cron' ? prev.expr : `${Number(at.slice(3))} ${Number(at.slice(0, 2))} * * *` };
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const cronExamples: [string, MsgKey][] = [
  ['0 7 * * *', 'schedule.cron_ex1'],
  ['0 8 * * 1,4', 'schedule.cron_ex2'],
  ['0 9 1 * *', 'schedule.cron_ex3'],
  ['0 9 * * 6', 'schedule.cron_ex4'],
];

export function SchedulePicker({
  value,
  onChange,
  label,
  activeFrom,
  activeTo,
  onValidity,
  disabled,
}: {
  value: Schedule;
  onChange: (s: Schedule) => void;
  label?: string;
  activeFrom?: string | null;
  activeTo?: string | null;
  onValidity?: (ok: boolean) => void;
  /** Nothing chosen yet (no collection): shown empty and greyed out, no preview. */
  disabled?: boolean;
}) {
  const { t, lang } = useI18n();
  const debounced = useDebounced(value, value.kind === 'cron' ? 400 : 0);
  const preview = useQuery({
    queryKey: ['schedule-preview', debounced, activeFrom, activeTo, lang],
    queryFn: () =>
      api.post<{ ok: boolean; error?: string; next?: number[]; frequent?: boolean }>('/api/schedule/preview', {
        schedule: debounced,
        activeFrom,
        activeTo,
      }),
    placeholderData: (prev) => prev,
    enabled: !disabled,
  });
  const ok = preview.data?.ok ?? true;
  useEffect(() => onValidity?.(ok), [ok, onValidity]);

  const hasTime = value.kind === 'days' || value.kind === 'weeks' || value.kind === 'monthly';

  if (disabled)
    return (
      <fieldset disabled className="grid grid-cols-2 gap-3 opacity-50">
        <Field label={label ?? t('schedule.change')}>
          <select className={inputClass} value="">
            <option value="" />
          </select>
        </Field>
        <Field label={t('schedule.at')}>
          <input type="time" className={inputClass} value="" readOnly />
        </Field>
      </fieldset>
    );

  return (
    <div className="space-y-3">
      <Field label={label ?? t('schedule.change')}>
          <select className={inputClass} value={presetOf(value)} onChange={(e) => onChange(fromPreset(e.target.value as PresetId, value))}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.label)}
              </option>
            ))}
          </select>
        </Field>
      {hasTime && (
      <div className="grid grid-cols-2 gap-3">
        {value.kind === 'weeks' && (
          <Field label={t('schedule.on_weekday')}>
            <select className={inputClass} value={value.weekday} onChange={(e) => onChange({ ...value, weekday: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {value.kind === 'monthly' && (
          <Field label={t('schedule.on_day')}>
            <select className={inputClass} value={value.day} onChange={(e) => onChange({ ...value, day: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}
        {hasTime && (
          <Field label={t('schedule.at')}>
            <input type="time" className={inputClass} value={value.at} onChange={(e) => e.target.value && onChange({ ...value, at: e.target.value })} />
          </Field>
        )}
      </div>
      )}

      {value.kind === 'cron' && (
        <div className="space-y-2">
          <input
            className={`${inputClass} font-mono`}
            value={value.expr}
            onChange={(e) => onChange({ kind: 'cron', expr: e.target.value })}
            placeholder="0 7 * * *"
            spellCheck={false}
          />
          <div className="rounded-2xl bg-surface-2 p-3 text-xs text-muted">
            <p className="mb-1.5">
              {t('schedule.cron_help')} <span className="font-mono text-ink-2">{t('schedule.cron_fields')}</span> {t('schedule.cron_help2')}
            </p>
            <ul className="space-y-0.5">
              {cronExamples.map(([expr, key]) => (
                <li key={expr}>
                  <button type="button" className="font-mono font-semibold text-ink-2 hover:text-accent" onClick={() => onChange({ kind: 'cron', expr })}>
                    {expr}
                  </button>{' '}
                  → {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {preview.data && !preview.data.ok && <p className="text-sm font-medium text-red-600">{preview.data.error}</p>}

      {preview.data?.ok && preview.data.frequent && (
        <div className="flex gap-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/25 dark:text-amber-200">
          <BatteryWarning className="mt-0.5 size-5 shrink-0" />
          <p>{t('schedule.battery_warning')}</p>
        </div>
      )}

      {preview.data?.ok && !!preview.data.next?.length && (
        <p className="flex items-start gap-2 text-xs text-muted">
          <CalendarClock className="mt-px size-3.5 shrink-0" />
          <span>{t('schedule.next_changes', { list: preview.data.next.map((ms) => dateTime(ms)).join(' · ') })}</span>
        </p>
      )}
    </div>
  );
}
