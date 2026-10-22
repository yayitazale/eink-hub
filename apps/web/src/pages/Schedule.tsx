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
              // Phone: picture, name and Edit on one row, the schedule details full width below.
              // Wider: the details sit under the name, next to the picture.
              <Card key={f.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:gap-y-0 sm:pr-5">
                <Link to={`/frames/${f.id}`} className="sm:row-span-2">
                  <FrameMockup frame={f} />
                </Link>
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:self-end">
                  <h3 className="truncate font-bold">{f.name}</h3>
                  {a && !a.enabled && <Pill tone="warn">{t('scheduleView.paused')}</Pill>}
                  <Pill>{f.mode === 'pull' ? 'Pull' : 'Push'}</Pill>
                </div>
                <Button
                  size="sm"
                  className="max-sm:size-9 max-sm:px-0 sm:row-span-2"
                  icon={<Pencil className="size-3.5" />}
                  aria-label={t('common.edit')}
                  onClick={() => setEditing(f)}
                >
                  <span className="max-sm:hidden">{t('common.edit')}</span>
                </Button>
                <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-start">
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
