import { useState } from 'react';
import { CalendarClock, ChevronRight, CloudDownload, Pause, Play, Plus, Send, Trash2 } from 'lucide-react';
import { api, type Frame } from '../lib/api';
import { dateTime, describeSchedule, relativeTime } from '../lib/format';
import { useI18n } from '../i18n';
import { useAction, useCollections, useFrames } from '../lib/hooks';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { FrameMockup } from '../components/FrameMockup';
import { Button, Card, Empty, Modal, Pill, SectionTitle, Spinner, useConfirm } from '../components/ui';

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
  // Only Canvases that have a schedule get a card, soonest change first (paused ones last);
  // the rest can be picked when creating one.
  const nextChangeOf = (f: Frame) => (f.mode === 'pull' ? f.nextWake : (f.assignment?.nextChange ?? null));
  // No time yet, or already past: the change is waiting for the Canvas (sorted first).
  const pending = (f: Frame) => {
    const n = nextChangeOf(f);
    return n === null || n < Date.now() - 60_000;
  };
  const sortKey = (f: Frame) => (!f.assignment?.enabled ? Infinity : pending(f) ? 0 : nextChangeOf(f)!);
  const scheduled = (frames.data?.filter((f) => f.assignment) ?? []).sort((x, y) => sortKey(x) - sortKey(y));
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
            const col = collections.data?.find((c) => c.id === a.collectionId);
            const nextChange = nextChangeOf(f);
            const pause = (label: boolean) => (
              <Button
                size="sm"
                className={label ? undefined : 'size-8! px-0!'}
                icon={a.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                aria-label={t(a.enabled ? 'scheduleView.pause' : 'scheduleView.resume')}
                disabled={setEnabled.isPending}
                onClick={() => setEnabled.mutate({ id: f.id, enabled: !a.enabled })}
              >
                {label && t(a.enabled ? 'scheduleView.pause' : 'scheduleView.resume')}
              </Button>
            );
            const del = (label: boolean) => (
              <Button
                size="sm"
                variant="danger"
                className={label ? undefined : 'size-8! px-0!'}
                icon={<Trash2 className="size-3.5" />}
                aria-label={t('common.delete')}
                disabled={remove.isPending}
                onClick={async () =>
                  (await confirm({ title: t('assign.remove'), message: t('assign.confirm_remove', { name: f.name }) })) && remove.mutate(f.id)
                }
              >
                {label && t('common.delete')}
              </Button>
            );
            return (
              // The picture runs down the left; name, playlist, timing, next change and chips stack
              // beside it. The whole card opens the editor (a list row with a chevron); Pause and
              // Delete sit above that button: labelled on the right on wide screens, icons below on a
              // phone. Same hover as the Canvas cards.
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
                    <p className="mt-0.5 truncate text-sm text-ink-2">
                      <span className="font-semibold">{col.name}</span> · {t(`collectionType.${col.type}`)} · {tn('common.photos', col.itemCount)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    {describeSchedule(a.schedule, t, tn)}, {t(`order.${a.orderMode}_lc`)}
                    {a.activeFrom && ` · ${t('scheduleView.window', { from: a.activeFrom, to: a.activeTo ?? '' })}`}
                  </p>
                  {a.enabled && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-ink-2">
                      <CalendarClock className="mt-px size-3.5 shrink-0" />
                      <span className="first-letter:uppercase">
                        {pending(f)
                          ? t(f.mode === 'pull' ? 'scheduleView.pending_pull' : 'scheduleView.pending_push')
                          : t('scheduleView.next_change', { when: relativeTime(nextChange!), date: dateTime(nextChange!) })}
                      </span>
                    </p>
                  )}
                  {/* Chips wrap in their own space and the phone buttons stay bottom-right; only when not
                      even one chip fits beside them do the buttons drop to their own line (still right). */}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="flex min-w-min grow basis-0 flex-wrap items-center gap-1.5">
                      <ModePill mode={f.mode} />
                      {!a.enabled && (
                        <Pill tone="warn">
                          <Pause className="size-3" /> {t('scheduleView.paused')}
                        </Pill>
                      )}
                    </div>
                    <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 sm:hidden">
                      {pause(false)}
                      {del(false)}
                    </div>
                  </div>
                </div>
                <div className="relative z-10 flex items-center gap-2 max-sm:hidden">
                  {pause(true)}
                  {del(true)}
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
