import { useState } from 'react';
import { CalendarClock, ChevronRight, CloudDownload, Pause, Play, Plus, Send, Trash2 } from 'lucide-react';
import { api, type Frame } from '../lib/api';
import { dateTime, describeSchedule, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { useAction, useCollections, useFrames } from '../lib/hooks';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { FrameMockup } from '../components/FrameMockup';
import { Button, Card, Empty, IconButton, Modal, Pill, SectionTitle, Spinner, useConfirm } from '../components/ui';

/** How the photo reaches the Canvas: the hub pushes it, or the Canvas pulls it when it wakes. */
function ModePill({ mode }: { mode: Frame['mode'] }) {
  return mode === 'pull' ? (
    <Pill tone="ok">
      <CloudDownload className="size-3" /> Pull
    </Pill>
  ) : (
    <Pill tone="accent">
      <Send className="size-3" /> Push
    </Pill>
  );
}

export function Schedule() {
  const { t, tn } = useI18n();
  const frames = useFrames();
  const collections = useCollections();
  // A Canvas's schedule, or 'new' to create one (the Canvas is picked in the editor).
  const [editing, setEditing] = useState<Frame | 'new' | null>(null);
  const confirm = useConfirm();
  const setEnabled = useAction(({ id, enabled }: { id: number; enabled: boolean }) => api.patch(`/api/frames/${id}/assignment`, { enabled }), {
    success: t('assign.saved'),
  });
  const remove = useAction((id: number) => api.del(`/api/frames/${id}/assignment`), { success: t('assign.removed') });

  if (frames.isLoading) return <Spinner />;
  // Only Canvases that have a schedule get a card; the rest can be picked when creating one.
  const scheduled = frames.data?.filter((f) => f.assignment) ?? [];
  const unscheduled = frames.data?.filter((f) => !f.assignment) ?? [];
  const create = (
    <Button variant="primary" icon={<Plus className="size-4" />} disabled={!unscheduled.length} onClick={() => setEditing('new')}>
      {t('scheduleView.create')}
    </Button>
  );
  return (
    <>
      <SectionTitle title={t('nav.schedule')} subtitle={t('scheduleView.subtitle')} action={scheduled.length ? create : undefined} />
      {!frames.data?.length ? (
        <Empty icon={<CalendarClock className="size-6" />} title={t('scheduleView.empty')}>
          {t('scheduleView.empty_hint')}
        </Empty>
      ) : !scheduled.length ? (
        <Empty icon={<CalendarClock className="size-6" />} title={t('scheduleView.none')}>
          <p>{t('scheduleView.none_hint')}</p>
          <div className="mt-4">{create}</div>
        </Empty>
      ) : (
        <div className="space-y-4">
          {scheduled.map((f) => {
            const a = f.assignment!;
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
                  {col && (
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
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ModePill mode={f.mode} />
                      {!a.enabled && <Pill tone="warn">{t('scheduleView.paused')}</Pill>}
                    </div>
                    {/* Above the card-wide button, so they get their own clicks. */}
                    <div className="relative z-10 flex items-center gap-1">
                      <IconButton
                        className="size-8"
                        title={t(a.enabled ? 'scheduleView.pause' : 'scheduleView.resume')}
                        aria-label={t(a.enabled ? 'scheduleView.pause' : 'scheduleView.resume')}
                        disabled={setEnabled.isPending}
                        onClick={() => setEnabled.mutate({ id: f.id, enabled: !a.enabled })}
                      >
                        {a.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </IconButton>
                      <IconButton
                        className="size-8 hover:text-red-600"
                        title={t('assign.remove')}
                        aria-label={t('assign.remove')}
                        disabled={remove.isPending}
                        onClick={async () =>
                          (await confirm({ title: t('assign.remove'), message: t('assign.confirm_remove', { name: f.name }) })) && remove.mutate(f.id)
                        }
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink-2" aria-hidden />
              </Card>
            );
          })}
        </div>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('scheduleView.create') : editing ? `${t('nav.schedule')} · ${editing.name}` : ''}
      >
        {editing === 'new' ? (
          <AssignmentEditor choices={unscheduled} onSaved={() => setEditing(null)} />
        ) : (
          editing && <AssignmentEditor frame={editing} onSaved={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}
