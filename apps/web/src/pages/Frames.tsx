import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BatteryFull, BatteryLow, BatteryMedium, CloudDownload, FlaskConical, Frame as FrameIcon, Plus, Radar, Wifi, WifiOff } from 'lucide-react';
import { api, type DiscoveredFrame, type Frame } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useAction, useCollections, useFrames } from '../lib/hooks';
import { useI18n } from '../i18n';
import { FrameMockup } from '../components/FrameMockup';
import { Button, Empty, Field, Modal, Pill, SectionTitle, Spinner, inputClass } from '../components/ui';

export function Battery({ value }: { value: number | null }) {
  if (value == null) return null;
  const Icon = value > 60 ? BatteryFull : value > 20 ? BatteryMedium : BatteryLow;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${value <= 20 ? 'text-accent' : 'text-muted'}`}>
      <Icon className="size-4" />
      {value}%
    </span>
  );
}

export function FrameStatus({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  if (frame.mode === 'pull')
    return (
      <Pill tone="ok">
        <CloudDownload className="size-3" /> Pull
      </Pill>
    );
  return frame.online ? (
    <Pill tone="ok">
      <Wifi className="size-3" /> {t('canvas.online')}
    </Pill>
  ) : (
    <Pill>
      <WifiOff className="size-3" /> {t('canvas.asleep')}
    </Pill>
  );
}

export function TestPill() {
  const { t } = useI18n();
  return (
    <Pill>
      <FlaskConical className="size-3" /> {t('canvas.test_pill')}
    </Pill>
  );
}

function FrameCard({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const collections = useCollections();
  const col = collections.data?.find((c) => c.id === frame.assignment?.collectionId);
  return (
    <Link to={`/frames/${frame.id}`} className="group block">
      <div className="rounded-[32px] bg-surface-2/60 px-8 pt-10 pb-6 transition group-hover:bg-surface-2">
        <FrameMockup frame={frame} className="mx-auto max-w-[220px] transition group-hover:-translate-y-1" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold">{frame.name}</h3>
          <p className="truncate text-[13px] text-muted">
            {col ? col.name : t('canvas.no_schedule')}
            {frame.mode === 'pull' && frame.nextWake ? ` · ${t('canvas.next_wake_short', { when: relativeTime(frame.nextWake) })}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="flex gap-1">
            {frame.simulated && <TestPill />}
            <FrameStatus frame={frame} />
          </span>
          <Battery value={frame.battery} />
        </div>
      </div>
    </Link>
  );
}

function BrandOption({ selected, onSelect, icon, title, hint }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 p-4 text-center transition ${
        selected ? 'border-ink bg-surface-2' : 'border-line hover:border-ink/30 hover:bg-surface-2/60'
      }`}
    >
      <span className={selected ? 'text-ink' : 'text-muted'}>{icon}</span>
      <span className="text-sm font-bold">{title}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

function AddFrameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [host, setHost] = useState('');
  const [name, setName] = useState('');
  const [found, setFound] = useState<DiscoveredFrame[] | null>(null);
  const [manual, setManual] = useState(false);
  // A Canvas picked from the search results, waiting for its name to be confirmed.
  const [picked, setPicked] = useState<DiscoveredFrame | null>(null);
  const pick = (f: DiscoveredFrame | null) => {
    setPicked(f);
    setName(f?.name ?? '');
    setManual(false);
  };
  const [brand, setBrand] = useState<'bloomin8' | 'simulated'>('bloomin8');
  const add = useAction((b: { host: string; name?: string }) => api.post<Frame>('/api/frames', b), { success: t('canvas.added') });
  // mDNS and a subnet scan together: mDNS can't cross Docker's bridge network, the scan can.
  const discover = useAction(() => api.post<DiscoveredFrame[]>('/api/frames/discover', { scan: true }), { invalidate: [] });
  const addTest = useAction((b: { name?: string }) => api.post<Frame>('/api/frames/test', b), { success: t('canvas.added') });


  return (
    <Modal open={open} onClose={onClose} title={t('canvas.add')}>
      <div className="space-y-5">
        <div className="rounded-3xl bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{t('canvas.discover')}</p>
              <p className="text-xs text-muted">{t('canvas.discover_hint')}</p>
            </div>
            <Button size="sm" icon={<Radar className="size-4" />} loading={discover.isPending} onClick={() => discover.mutate(undefined, { onSuccess: setFound })}>
              {t('canvas.search')}
            </Button>
          </div>
          {found && (
            <div className="mt-3 space-y-2">
              {found.length === 0 && <p className="text-sm text-muted">{t('canvas.none_found')}</p>}
              {found.map((f) => (
                <div
                  key={f.host}
                  className={`flex items-center justify-between rounded-2xl bg-surface px-4 py-2.5 ${picked?.host === f.host ? 'ring-2 ring-ink' : ''}`}
                >
                  <div>
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="text-xs text-muted">
                      {f.host} · {String(f.info.width)}×{String(f.info.height)}
                    </p>
                  </div>
                  {picked?.host === f.host ? (
                    <Button size="sm" variant="ghost" onClick={() => pick(null)}>
                      {t('common.cancel')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => pick(f)}>
                      {t('common.add')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {picked ? (
          <div className="space-y-3">
            <Field label={t('common.name')}>
              <input className={inputClass} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button
              variant="primary"
              className="w-full"
              loading={add.isPending}
              onClick={() => add.mutate({ host: picked.host, name: name.trim() || picked.name }, { onSuccess: onClose })}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : manual ? (
          <>
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-ink-2">{t('canvas.brand')}</p>
            <div className="grid grid-cols-2 gap-3" role="radiogroup">
              <BrandOption
                selected={brand === 'bloomin8'}
                onSelect={() => setBrand('bloomin8')}
                icon={<FrameIcon className="size-6" />}
                title="BLOOMIN8"
                hint={t('canvas.brand_bloomin8_hint')}
              />
              <BrandOption
                selected={brand === 'simulated'}
                onSelect={() => setBrand('simulated')}
                icon={<FlaskConical className="size-6" />}
                title={t('canvas.brand_simulated')}
                hint={t('canvas.brand_simulated_hint')}
              />
            </div>
          </div>
          {brand === 'bloomin8' ? (
            <div className="space-y-3">
              <Field label={t('canvas.ip')} hint={t('canvas.ip_hint')}>
                <input className={inputClass} placeholder="192.168.1.50" value={host} onChange={(e) => setHost(e.target.value)} />
              </Field>
              <Field label={t('canvas.name_optional')}>
                <input className={inputClass} placeholder={t('canvas.name_placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button variant="primary" className="w-full" disabled={!host} loading={add.isPending} onClick={() => add.mutate({ host, name }, { onSuccess: onClose })}>
                {t('canvas.add')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">{t('canvas.test_hint')}</p>
              <Field label={t('canvas.name_optional')}>
                <input className={inputClass} placeholder={t('canvas.brand_simulated')} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button variant="primary" className="w-full" loading={addTest.isPending} onClick={() => addTest.mutate({ name }, { onSuccess: onClose })}>
                {t('canvas.test_create')}
              </Button>
            </div>
          )}
          </>
        ) : (
          <Button className="w-full" icon={<Plus className="size-4" />} onClick={() => setManual(true)}>
            {t('canvas.add_manually')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function Frames() {
  const frames = useFrames();
  const [adding, setAdding] = useState(false);
  const { t, tn } = useI18n();
  return (
    <>
      <SectionTitle
        title={t('canvas.mine')}
        subtitle={frames.data ? tn('canvas.count', frames.data.length) : undefined}
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            {t('canvas.add')}
          </Button>
        }
      />
      {frames.isLoading ? (
        <Spinner />
      ) : frames.data?.length ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {frames.data.map((f) => (
            <FrameCard key={f.id} frame={f} />
          ))}
        </div>
      ) : (
        <Empty icon={<FrameIcon className="size-6" />} title={t('canvas.empty')}>
          {t('canvas.empty_hint')}
        </Empty>
      )}
      {/* Mounted only while open, so it starts fresh every time. */}
      {adding && <AddFrameDialog open onClose={() => setAdding(false)} />}
    </>
  );
}
