import { useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { Frame } from '../lib/api';
import { dateTime, describeSchedule, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { useCollections, useFrames } from '../lib/hooks';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { FrameMockup } from '../components/FrameMockup';
import { FrameStatus } from './Frames';
import { Card, Empty, Modal, Pill, SectionTitle, Spinner } from '../components/ui';

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
              // The picture runs down the left; name, playlist, timing and chips stack beside it.
              // The whole card opens the editor, a list row with a chevron. Same hover as the
              // Canvas cards: the background lightens and the picture lifts.
              <Card key={f.id} className="group relative flex items-center gap-3 p-4 transition hover:bg-surface-2 sm:gap-5 sm:pr-5">
                <button
                  type="button"
                  className="absolute inset-0 cursor-pointer rounded-[inherit] transition active:bg-ink/5"
                  aria-label={`${t('common.edit')} · ${f.name}`}
                  onClick={() => setEditing(f)}
                />
                <div className="w-20 shrink-0">
                  <FrameMockup frame={f} className="transition group-hover:-translate-y-1" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col self-stretch justify-center">
                  <h3 className="truncate font-bold">{f.name}</h3>
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <FrameStatus frame={f} />
                    {a && !a.enabled && <Pill tone="warn">{t('scheduleView.paused')}</Pill>}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink-2" aria-hidden />
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
