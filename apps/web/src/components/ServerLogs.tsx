import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, ScrollText } from 'lucide-react';
import { api, type LogEntry, type LogLevel } from '../lib/api';
import { useFrames } from '../lib/hooks';
import { useI18n, type MsgKey } from '../i18n';
import { Button, Card, Empty, Segmented, Spinner, cx, inputClass } from './ui';

const LEVELS: LogLevel[] = ['info', 'warn', 'error'];
const COLOR: Record<LogLevel, string> = { debug: 'text-muted', info: 'text-muted', warn: 'text-amber-600', error: 'text-red-600' };

/** Live tail of the Hub's own log (kept in memory by the server, last ~2000 lines). */
export function ServerLogs() {
  const { t } = useI18n();
  const frames = useFrames();
  const [level, setLevel] = useState<LogLevel>('info');
  const [frame, setFrame] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ level, limit: '500', ...(frame ? { frame } : {}), ...(q ? { q } : {}) });
  const logs = useQuery({ queryKey: ['logs', level, frame, q], queryFn: () => api.get<LogEntry[]>(`/api/logs?${params}`), refetchInterval: 5000 });
  const rows = [...(logs.data ?? [])].reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l, label: t(`logs.level_${l}` as MsgKey) }))} />
        <select aria-label={t('logs.canvas')} className={cx(inputClass, 'sm:max-w-[200px]')} value={frame} onChange={(e) => setFrame(e.target.value)}>
          <option value="">{t('logs.all_canvases')}</option>
          {frames.data?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input className={cx(inputClass, 'min-w-0 flex-1 sm:max-w-xs')} placeholder={t('logs.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={logs.isFetching} onClick={() => logs.refetch()}>
          {t('detail.refresh')}
        </Button>
        <Button size="sm" icon={<Download className="size-4" />} onClick={() => (window.location.href = '/api/logs/download')}>
          {t('logs.download')}
        </Button>
      </div>
      {logs.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon={<ScrollText className="size-6" />} title={t('logs.empty')} />
      ) : (
        <Card className="max-h-[70vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed">
          {rows.map((e, i) => (
            <div key={i} className="border-b border-line/40 py-1 last:border-0 [overflow-wrap:anywhere]">
              <span className="text-muted">{new Date(e.t).toLocaleString()}</span>{' '}
              <span className={cx('font-bold uppercase', COLOR[e.level])}>{e.level}</span> <span>{e.msg}</span>
              {e.data && <span className="text-muted"> {JSON.stringify(e.data)}</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
