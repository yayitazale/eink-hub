import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil } from 'lucide-react';
import type { Frame } from '../lib/api';
import { dateTime, describeSchedule, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { useCollections, useFrames } from '../lib/hooks';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { FrameMockup } from '../components/FrameMockup';
import { Button, Card, Empty, Modal, Pill, SectionTitle, Spinner } from '../components/ui';

export function Schedule() {
  const { t, tn } = useI18n();
  const frames = useFrames();
  const collections = useCollections();
  const [editing, setEditing] = useState<Frame | null>(null);

  if (frames.isLoading) return <Spinner />;
  return (
    <>
      <SectionTitle title={t('nav.schedule')} subtitle={t('scheduleView.subtitle')} />
      {!frames.data?.length ? (
        <Empty icon={<CalendarClock className="size-6" />} title={t('scheduleView.empty')}>
          {t('scheduleView.empty_hint')}
        </Empty>
      ) : (
        <div className="space-y-4">
          {frames.data.map((f) => {
            const a = f.assignment;
            const col = collections.data?.find((c) => c.id === a?.collectionId);
            const nextChange = f.mode === 'pull' ? f.nextWake : (a?.nextChange ?? null);
            return (
              <Card key={f.id} className="flex items-center gap-5 p-4 pr-5">
                <Link to={`/frames/${f.id}`} className="w-16 shrink-0 sm:w-20">
                  <FrameMockup frame={f} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{f.name}</h3>
                    {a && !a.enabled && <Pill tone="warn">{t('scheduleView.paused')}</Pill>}
                    <Pill>{f.mode === 'pull' ? 'Pull' : 'Push'}</Pill>
                  </div>
                  {a && col ? (
                    <>
                      <p className="mt-0.5 truncate text-sm text-ink-2">
                        <span className="font-semibold">{col.name}</span> · {t(`collectionType.${col.type}`)} · {tn('common.photos', col.itemCount)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {describeSchedule(a.schedule, t, tn)}, {t(`order.${a.orderMode}_lc`)}
                        {a.activeFrom && ` · ${t('scheduleView.window', { from: a.activeFrom, to: a.activeTo ?? '' })}`}
                        {nextChange && ` · ${t('scheduleView.next_change', { when: relativeTime(nextChange), date: dateTime(nextChange) })}`}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted">{t('canvas.no_schedule')}</p>
                  )}
                </div>
                <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(f)}>
                  {t('common.edit')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${t('nav.schedule')} · ${editing.name}` : ''}>
        {editing && <AssignmentEditor frame={editing} onSaved={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
