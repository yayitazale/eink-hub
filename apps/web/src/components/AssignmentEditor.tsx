import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api, type Assignment, type FitMode, type Frame, type OrderMode, type Schedule } from '../lib/api';
import { useAction, useCollections } from '../lib/hooks';
import { SchedulePicker } from './SchedulePicker';
import { useI18n } from '../i18n';
import { Button, Field, Segmented, Toggle, inputClass } from './ui';

const DEFAULT_SCHEDULE: Schedule = { kind: 'days', days: 1, at: '07:00' };

export function AssignmentEditor({ frame, onSaved }: { frame: Frame; onSaved?: () => void }) {
  const { t } = useI18n();
  const collections = useCollections();
  const a = frame.assignment;
  const [collectionId, setCollectionId] = useState<number | ''>(a?.collectionId ?? '');
  const [orderMode, setOrderMode] = useState<OrderMode>(a?.orderMode ?? 'random');
  const [schedule, setSchedule] = useState<Schedule>(a?.schedule ?? DEFAULT_SCHEDULE);
  const [scheduleOk, setScheduleOk] = useState(true);
  const [windowOn, setWindowOn] = useState(!!a?.activeFrom);
  const [from, setFrom] = useState(a?.activeFrom ?? '08:00');
  const [to, setTo] = useState(a?.activeTo ?? '23:00');
  const [fit, setFit] = useState<FitMode>(a?.fit ?? 'cover');
  const [showDate, setShowDate] = useState(a?.showDate ?? false);
  const [enabled, setEnabled] = useState(a?.enabled ?? true);

  const collection = collections.data?.find((c) => c.id === collectionId);
  // "On this day" has a fixed timing: one random memory per day, changing at 00:00.
  const isMemories = collection?.type === 'immich_memories';
  const hourly = !isMemories && schedule.kind === 'interval';

  useEffect(() => {
    if (!collectionId && collections.data?.length) setCollectionId(collections.data[0].id);
  }, [collections.data, collectionId]);

  const pickCollection = (id: number) => {
    setCollectionId(id);
    if (collections.data?.find((c) => c.id === id)?.type === 'immich_memories') setShowDate(true);
  };

  const save = useAction(
    () =>
      api.put<Assignment>(`/api/frames/${frame.id}/assignment`, {
        collectionId,
        orderMode,
        schedule,
        activeFrom: hourly && windowOn ? from : null,
        activeTo: hourly && windowOn ? to : null,
        fit,
        showDate,
        enabled,
      }),
    { success: t('assign.saved'), invalidate: [['frames']] },
  );
  const remove = useAction(() => api.del(`/api/frames/${frame.id}/assignment`), { success: t('assign.removed') });

  if (collections.data && collections.data.length === 0)
    return <p className="text-sm text-muted">{t('assign.no_collections')}</p>;

  return (
    <div className="@container min-w-0 space-y-5">
      {/* Two columns when the editor itself has room (page vs. popup vs. phone), one otherwise. */}
      <div className="grid gap-5 @xl:grid-cols-2 @xl:gap-x-8">
        <div className="min-w-0 space-y-5">
          <Field label={t('assign.collection')}>
            <select className={inputClass} value={collectionId} onChange={(e) => pickCollection(Number(e.target.value))}>
              {collections.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {/* "On this day" changes daily, so a photo count would be misleading. */}
                  {c.type === 'immich_memories' ? c.name : `${c.name} (${c.itemCount})`}
                </option>
              ))}
            </select>
          </Field>

          {isMemories ? (
            <div className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
              <History className="mt-0.5 size-5 shrink-0 text-accent" />
              <p>{t('assign.memories_info')}</p>
            </div>
          ) : (
            <SchedulePicker
              value={schedule}
              onChange={setSchedule}
              activeFrom={hourly && windowOn ? from : null}
              activeTo={hourly && windowOn ? to : null}
              onValidity={setScheduleOk}
            />
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {!isMemories && (
            <Field label={t('assign.order')} hint={t(`order.${orderMode}_hint`)} group>
              <Segmented
                fill
                value={orderMode}
                onChange={setOrderMode}
                options={[
                  { value: 'random', label: t('order.random') },
                  { value: 'sequential', label: t('order.sequential') },
                  { value: 'newest', label: t('order.newest') },
                ]}
              />
            </Field>
          )}

          <Field label={t('assign.fit')} hint={t('assign.fit_hint')} group>
            <Segmented
              fill
              value={fit}
              onChange={setFit}
              options={[
                { value: 'cover', label: t('fit.auto') },
                { value: 'contain', label: t('fit.contain') },
                { value: 'blur', label: t('fit.blur') },
              ]}
            />
          </Field>

          <div className="space-y-4 rounded-2xl bg-surface-2 p-4">
            <Toggle
              label={t('assign.show_date')}
              hint={t(isMemories ? 'assign.show_date_hint_memories' : 'assign.show_date_hint')}
              checked={showDate} onChange={setShowDate} />
            {hourly && (
              <div>
                <Toggle label={t('assign.window')} hint={t('assign.window_hint')} checked={windowOn} onChange={setWindowOn} />
                {windowOn && (
                  <div className="mt-3 flex items-center gap-3">
                    <input type="time" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
                    <span className="text-muted">→</span>
                    <input type="time" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                )}
              </div>
            )}
            <Toggle label={t('assign.enabled')} hint={t('assign.enabled_hint')} checked={enabled} onChange={setEnabled} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!collectionId || (!isMemories && !scheduleOk)}
          onClick={() => save.mutate(undefined, { onSuccess: onSaved })}
        >
          {t('common.save')}
        </Button>
        {a && (
          <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: onSaved })}>
            {t('assign.remove')}
          </Button>
        )}
      </div>
    </div>
  );
}
