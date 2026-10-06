import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { api, type Frame } from '../lib/api';
import { dateTime, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { Empty, Spinner } from './ui';

interface Stats {
  enabled: boolean;
  createdAt: number;
  lastSeen: number | null;
  shown: { total: number; last30Days: number; failed: number };
  battery: { samples: { at: number; level: number }[]; level: number | null; drainPerDay: number | null; daysLeft: number | null };
  paper: { sheets: number; trees: number; sheetsPerTree: number };
}

const num = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2 p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold [overflow-wrap:anywhere]">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Battery level over time as a plain SVG line (no chart library: it is one line). */
function BatteryChart({ samples }: { samples: Stats['battery']['samples'] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const t0 = samples[0].at;
  const last = samples[samples.length - 1];
  const span = Math.max(1, last.at - t0);
  const x = (at: number) => pad.l + ((at - t0) / span) * (W - pad.l - pad.r);
  const y = (lv: number) => pad.t + (1 - lv / 100) * (H - pad.t - pad.b);
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.at).toFixed(1)},${y(s.level).toFixed(1)}`).join(' ');
  const area = `${line} L${x(last.at).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {[0, 25, 50, 75, 100].map((lv) => (
        <g key={lv}>
          <line x1={pad.l} x2={W - pad.r} y1={y(lv)} y2={y(lv)} stroke="currentColor" className="text-line" strokeWidth="1" />
          <text x={pad.l - 6} y={y(lv) + 4} textAnchor="end" className="fill-muted" fontSize="11">
            {lv}%
          </text>
        </g>
      ))}
      <path d={area} className="fill-leaf/15" />
      <path d={line} fill="none" className="stroke-leaf" strokeWidth="2" strokeLinejoin="round" />
      <text x={pad.l} y={H - 4} className="fill-muted" fontSize="11">
        {new Date(t0).toLocaleDateString()}
      </text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-muted" fontSize="11">
        {new Date(last.at).toLocaleDateString()}
      </text>
    </svg>
  );
}

export function StatsTab({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['frames', frame.id, 'stats'], queryFn: () => api.get<Stats>(`/api/frames/${frame.id}/stats`), refetchInterval: 60_000 });
  if (!q.data) return <Spinner />;
  const s = q.data;
  if (!s.enabled) return <p className="text-sm text-muted">{t('stats.off')}</p>;
  const b = s.battery;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t('stats.added')} value={dateTime(s.createdAt)} hint={relativeTime(s.createdAt)} />
        <Metric label={t('stats.shown')} value={num(s.shown.total)} hint={t('stats.shown_30', { n: num(s.shown.last30Days) })} />
        <Metric label={t('stats.failed')} value={num(s.shown.failed)} />
        <Metric label={t('stats.last_seen')} value={relativeTime(s.lastSeen)} hint={dateTime(s.lastSeen)} />
      </div>

      <div>
        <h3 className="mb-2 font-bold">{t('stats.battery')}</h3>
        {b.samples.length < 2 ? (
          <Empty icon={<BarChart3 className="size-6" />} title={t('stats.battery_empty')}>
            {t('stats.battery_empty_hint')}
          </Empty>
        ) : (
          <>
            <BatteryChart samples={b.samples} />
            <p className="mt-2 text-sm text-muted">
              {b.drainPerDay != null
                ? t('stats.battery_rate', { rate: num(b.drainPerDay, 1), days: b.daysLeft != null ? num(b.daysLeft) : '—' })
                : t('stats.battery_rate_soon')}
            </p>
          </>
        )}
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="text-xs font-semibold text-muted">{t('stats.paper')}</div>
        <div className="mt-1 text-xl font-bold">{t('stats.paper_value', { sheets: num(s.paper.sheets), trees: num(s.paper.trees, 3) })}</div>
        <p className="mt-1 text-xs text-muted">{t('stats.paper_hint', { n: num(s.paper.sheetsPerTree) })}</p>
      </div>
    </div>
  );
}
