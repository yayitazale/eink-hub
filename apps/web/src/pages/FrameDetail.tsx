import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bluetooth, Copy, Download, Eraser, Moon, Play, RefreshCw, RotateCcw, SkipForward, Smartphone, Trash2 } from 'lucide-react';
import { api, thumbUrl, type Frame, type FrameAppearance, type HistoryEntry, type ImageFormat, type Schedule } from '../lib/api';
import { FRAME_COLORS, FRAME_STYLES, KNOWN_DIAGONALS, formatCm, frameGeometry, withDefaults } from '../lib/frameGeometry';
import { dateTime, formatBytes, formatPercent, relativeTime } from '../lib/format';
import { useAction, useBleStatus, useFrame, useSettings } from '../lib/hooks';
import { isPickerCancelled, phoneWakeSupport, wakeWithThisDevice } from '../lib/webBluetooth';
import { useI18n, type MsgKey, type TFunction } from '../i18n';
import { OrientationField } from '../components/OrientationField';
import { FrameMockup } from '../components/FrameMockup';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { StatsTab } from '../components/StatsTab';
import { SchedulePicker } from '../components/SchedulePicker';
import { Button, Card, Field, Pill, Segmented, Spinner, Toggle, cx, inputClass, useConfirm } from '../components/ui';
import { Battery, DOCS_URL, FrameStatus, KindPill, TestPill } from './Frames';
import { Select } from '../components/Select';

type Tab = 'schedule' | 'mode' | 'connection' | 'history' | 'stats' | 'device' | 'settings';
const TABS: Tab[] = ['schedule', 'mode', 'connection', 'history', 'stats', 'device', 'settings'];

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      {/* Long values (IPs, hostnames, SSIDs) wrap instead of overlapping the next column. */}
      <div className="mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">{value ?? '—'}</div>
    </div>
  );
}

/** A value with a smaller, muted line under it. */
function TwoLines({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      {main}
      {sub && <span className="block text-xs font-medium text-muted">{sub}</span>}
    </>
  );
}

/** When the schedule changes the photo next: pull frames on their next wake, push ones at the schedule's time. */
function NextChange({ frame: f }: { frame: Frame }) {
  const { t } = useI18n();
  const a = f.assignment;
  if (!a) return <>—</>;
  if (!a.enabled) return <>{t('scheduleView.paused')}</>;
  const next = f.mode === 'pull' ? f.nextWake : a.nextChange;
  // No time yet, or already past: it waits for the Canvas.
  if (next === null || next < Date.now() - 60_000)
    return <TwoLines main={t('detail.pending')} sub={t(f.mode === 'pull' ? 'detail.when_wakes' : 'detail.when_responds')} />;
  return <TwoLines main={relativeTime(next)} sub={dateTime(next)} />;
}

/** Free storage on the Canvas: share of the card first, the absolute size beside it. */
function FreeSpace({ free, total }: { free: number; total: number }) {
  if (!free) return null;
  if (!total) return <>{formatBytes(free)}</>;
  return (
    <>
      {formatPercent(free, total)} <span className="font-normal text-muted">· {formatBytes(free)}</span>
    </>
  );
}

function ModeTab({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const settings = useSettings();
  const [mode, setMode] = useState(frame.mode);
  const [url, setUrl] = useState('');
  const [pullSchedule, setPullSchedule] = useState<Schedule>(frame.pullSchedule);
  const [scheduleOk, setScheduleOk] = useState(true);
  // Prefill with the detected LAN URL once settings load; stays editable.
  useEffect(() => {
    if (!url && settings.data?.localUrl) setUrl(settings.data.localUrl);
  }, [settings.data?.localUrl]);

  // Saving applies the selected mode. Only a mode or URL change is written to the device (which
  // must be awake); the fallback schedule lives in the hub and is picked up on the next wake.
  const save = useAction(
    () => {
      const localUrl = url || window.location.origin;
      if (mode === 'pull' && frame.mode === 'pull' && localUrl === settings.data?.localUrl) {
        return api.patch(`/api/frames/${frame.id}`, { pullSchedule });
      }
      return api.post(`/api/frames/${frame.id}/pull`, { enabled: mode === 'pull', localUrl, pullSchedule });
    },
    { success: t('mode.updated') },
  );
  const detected = url && url === settings.data?.localUrl;
  const unchangedPush = mode === 'push' && frame.mode === 'push';

  const card = (value: Frame['mode'], title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cx(
        'rounded-3xl border-2 p-5 text-left transition',
        mode === value ? 'border-ink bg-surface-2' : 'border-line hover:border-ink/30',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        {frame.mode === value && <Pill tone="ok">{t('mode.current')}</Pill>}
      </span>
      <span className="mt-1 block text-sm text-muted">{desc}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{t('mode.select_hint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {card('push', 'Push', t('mode.push_desc'))}
        {card('pull', t('mode.pull_title'), t('mode.pull_desc'))}
      </div>

      {mode === 'push' ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">{t('mode.push_config')}</p>
      ) : (
        <div className="space-y-4 rounded-3xl border border-line p-4">
          <Field label={t('mode.hub_url')} hint={detected ? t(`localUrl.${settings.data!.localUrlSource}` as MsgKey) : t('mode.hub_url_hint')}>
            <input className={inputClass} placeholder="http://192.168.1.10:8080" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <div>
            <SchedulePicker value={pullSchedule} onChange={setPullSchedule} onValidity={setScheduleOk} label={t('mode.fallback_label')} />
            <p className="mt-2 text-xs text-muted">{t('mode.fallback_hint')}</p>
          </div>
        </div>
      )}

      {!unchangedPush && <p className="text-xs text-muted">{t('mode.wake_first')}</p>}
      <Button variant="primary" loading={save.isPending} disabled={unchangedPush || (mode === 'pull' && !scheduleOk)} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useI18n();
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input className={cx(inputClass, 'font-mono text-xs')} readOnly value={value} onFocus={(e) => e.target.select()} />
        <Button size="sm" variant="ghost" aria-label={t('common.copy')} onClick={() => navigator.clipboard?.writeText(value)}>
          <Copy className="size-4" />
        </Button>
      </div>
    </Field>
  );
}

const FORMATS: { value: string; format: ImageFormat }[] = [
  { value: 'jpeg', format: { type: 'jpeg' } },
  { value: 'png', format: { type: 'png' } },
  { value: 'png:spectra6', format: { type: 'png', palette: 'spectra6' } },
  { value: 'png:acep7', format: { type: 'png', palette: 'acep7' } },
  { value: 'png:gray4', format: { type: 'png', palette: 'gray4' } },
  { value: 'bmp:bw', format: { type: 'bmp', palette: 'bw' } },
  { value: 'bmp', format: { type: 'bmp' } },
];
const formatKey = (f?: ImageFormat) => (f ? (f.palette ? `${f.type}:${f.palette}` : f.type) : '');
/** "PNG · Spectra 6", as in the format picker. */
const formatLabel = (f: ImageFormat | undefined, t: TFunction) =>
  f ? `${f.type.toUpperCase()}${f.palette ? ` · ${t(`palette.${f.palette}` as MsgKey)}` : ''}` : undefined;

/** How a non-BLOOMIN8 frame reaches the hub: token and URLs for DIY / TRMNL, credentials for SwitchBot. */
function ConnectionTab({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const settings = useSettings();
  const hub = (settings.data?.localUrl || window.location.origin).replace(/\/+$/, '');
  const [maxPoll, setMaxPoll] = useState(frame.config.maxPollMinutes ?? 60);
  const [format, setFormat] = useState(formatKey(frame.config.format) || (frame.kind === 'trmnl' ? 'bmp:bw' : 'jpeg'));
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const save = useAction(
    () =>
      api.patch(`/api/frames/${frame.id}`, {
        config:
          frame.kind === 'switchbot'
            ? { token, secret }
            : { maxPollMinutes: maxPoll, format: FORMATS.find((x) => x.value === format)?.format },
      }),
    { success: t('common.saved') },
  );

  if (frame.kind === 'switchbot') {
    const external = settings.data?.cloudUrlEffective ?? '';
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted">{t('connection.switchbot_intro')}</p>
        {!external.startsWith('https://') && <p className="rounded-2xl bg-accent/10 p-4 text-sm text-ink-2">{t('connection.switchbot_no_url')}</p>}
        <CopyField label={t('connection.device_id')} value={frame.config.deviceId ?? ''} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token" hint={t('connection.secret_keep')}>
            <input className={inputClass} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Secret" hint={t('connection.secret_keep')}>
            <input className={inputClass} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Button variant="primary" disabled={!token && !secret} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {t(frame.kind === 'trmnl' ? 'connection.trmnl_intro' : 'connection.diy_intro')}{' '}
        <a className="font-semibold text-accent" href={DOCS_URL + (frame.kind === 'trmnl' ? 'devices/trmnl' : 'diy/protocol')} target="_blank" rel="noreferrer">
          {t('canvas.docs_link')}
        </a>
      </p>
      {frame.kind === 'trmnl' ? (
        <>
          <CopyField label={t('connection.server_url')} value={hub} hint={t('connection.trmnl_server_hint')} />
          <CopyField label="MAC" value={frame.deviceId ?? ''} />
        </>
      ) : (
        <>
          <CopyField label={t('connection.endpoint')} value={`${hub}/of/v1/display`} />
          <CopyField label="Token" value={frame.upstreamToken} hint={t('connection.token_hint')} />
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('connection.format')} hint={t('connection.format_hint')} group>
          <Select
            aria-label={t('connection.format')}
            value={format}
            onChange={setFormat}
            options={FORMATS.map((x) => ({ value: x.value, label: formatLabel(x.format, t)! }))}
          />
        </Field>
        <Field label={t('connection.max_poll')} hint={t('connection.max_poll_hint')}>
          <input type="number" min={1} max={1440} className={inputClass} value={maxPoll} onChange={(e) => setMaxPoll(Number(e.target.value))} />
        </Field>
      </div>
      {frame.config.notifyUrl && <Info label={t('connection.notify_url')} value={frame.config.notifyUrl} />}
      <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function HistoryTab({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const history = useQuery({ queryKey: ['history', frame.id], queryFn: () => api.get<HistoryEntry[]>(`/api/frames/${frame.id}/history`) });
  if (!history.data) return <Spinner />;
  if (!history.data.length) return <p className="text-sm text-muted">{t('history.empty')}</p>;
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {history.data.map((h) => (
        <div key={h.id}>
          <img src={thumbUrl(h.imageId)} alt="" className="aspect-[3/4] w-full rounded-2xl object-cover" loading="lazy" />
          <p className="mt-1 text-[11px] font-semibold text-ink-2">{relativeTime(h.shownAt)}</p>
          <p className="text-[11px] text-muted">
            {h.method}
            {h.success === false ? ` · ${t('history.failed')}` : ''}
            {h.battery != null ? ` · ${h.battery}%` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_GALLERY = 'default';

function DeviceTab({ frame }: { frame: Frame }) {
  const { t, tn } = useI18n();
  const confirm = useConfirm();
  const galleries = useQuery({
    queryKey: ['device-galleries', frame.id],
    queryFn: () => api.get<{ name: string; total: number; images: { name: string; time: number }[] }[]>(`/api/frames/${frame.id}/galleries`),
    retry: false,
  });
  const playlists = useQuery({
    queryKey: ['device-playlists', frame.id],
    queryFn: () => api.get<{ name: string; type: string; list: unknown[] }[]>(`/api/frames/${frame.id}/playlists`),
    retry: false,
  });
  const play = useAction((b: { gallery?: string; image?: string; playlist?: string }) => api.post(`/api/frames/${frame.id}/play`, b), {
    success: t('device.playing'),
  });
  const delGallery = useAction((name: string) => api.del(`/api/frames/${frame.id}/galleries/${encodeURIComponent(name)}`), {
    success: t('device.gallery_deleted'),
    invalidate: [['device-galleries', frame.id]],
  });

  // The firmware's built-in "default" gallery is rarely useful, so it starts hidden.
  const [showDefault, setShowDefault] = useState(false);

  if (galleries.isError) return <p className="text-sm text-muted">{t('device.unreachable')}</p>;
  if (!galleries.data) return <Spinner />;
  const hasDefault = galleries.data.some((g) => g.name === DEFAULT_GALLERY);
  const shownGalleries = showDefault ? galleries.data : galleries.data.filter((g) => g.name !== DEFAULT_GALLERY);
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 font-bold">{t('device.galleries')}</h4>
        <div className="space-y-2">
          {shownGalleries.map((g) => (
            <details key={g.name} className="rounded-2xl bg-surface-2 px-4 py-3">
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">
                  {g.name} <span className="text-sm font-normal text-muted">· {tn('common.photos', g.total)}</span>
                </span>
                <span className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
                  <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => play.mutate({ gallery: g.name })}>
                    {t('device.play')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={t('common.delete')}
                    onClick={async () =>
                      (await confirm({ title: t('common.delete'), message: t('device.confirm_delete_gallery', { name: g.name }) })) && delGallery.mutate(g.name)
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </summary>
              <ul className="mt-2 divide-y divide-line text-sm">
                {g.images.map((i) => (
                  <li key={i.name} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate">{i.name}</span>
                    <button className="shrink-0 text-xs font-semibold text-accent" onClick={() => play.mutate({ gallery: g.name, image: i.name })}>
                      {t('device.show')}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
        {hasDefault && (
          <button className="mt-2 text-xs font-semibold text-muted hover:text-ink" onClick={() => setShowDefault((v) => !v)}>
            {t(showDefault ? 'device.hide_default' : 'device.show_default')}
          </button>
        )}
      </div>
      <div>
        <h4 className="mb-2 font-bold">{t('device.playlists')}</h4>
        {playlists.data?.length ? (
          <div className="space-y-2">
            {playlists.data.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3">
                <span className="min-w-0 truncate font-semibold">
                  {p.name} <span className="text-sm font-normal text-muted">· {tn('device.items', p.list?.length ?? 0)}</span>
                </span>
                <Button size="sm" icon={<Play className="size-3.5" />} onClick={() => play.mutate({ playlist: p.name })}>
                  {t('device.play')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('device.no_playlists')}</p>
        )}
      </div>
    </div>
  );
}

/** Swatch colours for the frame colour picker (woods use their texture). */
const SWATCH: Record<string, string> = { black: '#1d1c1a', white: '#f3f1ec' };

/** Physical size and the look of the frame: only changes how the Hub draws it. */
function FrameLookSettings({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const [look, setLook] = useState(() => withDefaults(frame.appearance));
  // '' = automatic (from the model / resolution).
  const known = frame.diagonal != null && KNOWN_DIAGONALS.includes(frame.diagonal);
  const [size, setSize] = useState(frame.diagonalInferred ? '' : known ? String(frame.diagonal) : 'other');
  const [custom, setCustom] = useState(frame.diagonalInferred || known ? '' : String(frame.diagonal));
  const diagonal = size === 'other' ? Number(custom) || null : size ? Number(size) : null;
  const set = (p: Partial<FrameAppearance>) => setLook((l) => ({ ...l, ...p }));
  const save = useAction(() => api.patch(`/api/frames/${frame.id}`, { appearance: look, diagonal }), { success: t('common.saved') });
  const preview = { ...frame, diagonal: size === '' && frame.diagonalInferred ? frame.diagonal : diagonal };

  return (
    <div className="border-t border-line pt-6">
      <h4 className="mb-1 font-bold">{t('canvasSettings.frame')}</h4>
      <p className="mb-4 text-xs text-muted">{t('canvasSettings.frame_hint')}</p>
      <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <Field
            group
            label={t('canvasSettings.frame_size')}
            hint={
              size !== '' || !frame.diagonalInferred
                ? undefined
                : frame.diagonal != null
                  ? t('canvasSettings.frame_size_detected', { size: frame.diagonal })
                  : t('canvasSettings.frame_size_unknown')
            }
          >
            <div className="flex gap-2">
              <Select
                aria-label={t('canvasSettings.frame_size')}
                value={size}
                onChange={setSize}
                options={[
                  { value: '', label: t('canvasSettings.frame_size_auto') },
                  ...KNOWN_DIAGONALS.map((d) => ({ value: String(d), label: `${d}″` })),
                  { value: 'other', label: t('canvasSettings.frame_size_other') },
                ]}
              />
              {size === 'other' && (
                <input type="number" step="0.1" min="4" max="60" className={cx(inputClass, 'w-28')} value={custom} onChange={(e) => setCustom(e.target.value)} />
              )}
            </div>
          </Field>
          <Toggle label={t('canvasSettings.frame_mat')} hint={t('canvasSettings.frame_mat_hint')} checked={look.mat} onChange={(mat) => set({ mat })} />
          <Field label={t('canvasSettings.frame_color')} group>
            <div className="flex flex-wrap gap-3">
              {FRAME_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={t(`canvasSettings.color_${c}`)}
                  aria-label={t(`canvasSettings.color_${c}`)}
                  aria-pressed={look.color === c}
                  onClick={() => set({ color: c })}
                  className={cx(
                    'size-9 rounded-full border border-line bg-cover shadow-soft transition',
                    look.color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-105',
                  )}
                  style={SWATCH[c] ? { background: SWATCH[c] } : { backgroundImage: `url(/textures/${c}-h.webp)` }}
                />
              ))}
            </div>
          </Field>
          <Field label={t('canvasSettings.frame_style')} group>
            <Segmented fill value={look.style} onChange={(style) => set({ style })} options={FRAME_STYLES.map((s) => ({ value: s, label: t(`canvasSettings.style_${s}`) }))} />
          </Field>
        </div>
        <div className="space-y-2">
          <div className="mx-auto max-w-[200px] rounded-3xl bg-surface-2/60 p-6">
            <FrameMockup frame={preview} appearance={look} />
          </div>
          <p className="text-center text-xs text-muted">{formatCm(frameGeometry(preview, look))}</p>
        </div>
      </div>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function BluetoothSettings({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const ble = useBleStatus();
  const [mac, setMac] = useState(frame.bleMac ?? '');
  const [autoWake, setAutoWake] = useState(frame.bleAutoWake);
  const save = useAction(() => api.patch(`/api/frames/${frame.id}`, { bleMac: mac.trim() || null, bleAutoWake: autoWake }), {
    success: t('common.saved'),
  });
  const phone = phoneWakeSupport();
  const hub = ble.data;

  return (
    <div className="border-t border-line pt-6">
      <h4 className="mb-1 font-bold">Bluetooth</h4>
      <ul className="mb-4 space-y-1 text-xs text-muted">
        <li>{hub ? (hub.available ? t('ble.hub_ok', { adapter: hub.adapter }) : t(`ble.hub_${hub.reason}` as MsgKey)) : '…'}</li>
        <li>{t(`ble.phone_${phone}` as MsgKey)}</li>
      </ul>
      <div className="max-w-xs">
        <Field label={t('ble.mac')} hint={t('ble.mac_hint')}>
          <input className={inputClass} placeholder="AA:BB:CC:DD:EE:FF" value={mac} onChange={(e) => setMac(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 max-w-xl">
        <Toggle label={t('ble.auto_wake')} hint={t('ble.auto_wake_hint')} checked={autoWake} onChange={setAutoWake} />
      </div>
      <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function SettingsTab({ frame }: { frame: Frame }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const nav = useNavigate();
  const info = frame.lastInfo ?? {};
  const [name, setName] = useState(frame.name);
  const [host, setHost] = useState(frame.host);
  const caps = frame.capabilities;
  const [orientation, setOrientation] = useState(frame.orientation);
  const [rotate, setRotate] = useState(String(frame.rotate) as '90' | '270');
  const [sleep, setSleep] = useState(Number(info.sleep_duration ?? 0) / 60 || '');
  const [idle, setIdle] = useState(Number(info.max_idle ?? 0) || '');

  const save = useAction(() => api.patch(`/api/frames/${frame.id}`, { name, host, orientation, rotate: Number(rotate) }), {
    success: t('common.saved'),
  });
  const saveDevice = useAction(
    () =>
      api.post(`/api/frames/${frame.id}/device-settings`, {
        name,
        ...(sleep ? { sleep_duration: Number(sleep) * 60 } : {}),
        ...(idle ? { max_idle: Number(idle) } : {}),
      }),
    { success: t('canvasSettings.sent') },
  );
  const remove = useAction(() => api.del(`/api/frames/${frame.id}`), { success: t('canvasSettings.deleted') });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {frame.kind === 'bloomin8' && (
          <Field label={t('canvasSettings.host')}>
            <input className={inputClass} value={host} onChange={(e) => setHost(e.target.value)} />
          </Field>
        )}
        <OrientationField value={orientation} onChange={setOrientation} />
        {orientation === 'landscape' && frame.kind === 'bloomin8' && (
          <Field label={t('canvasSettings.rotation')} group>
            <Segmented
              fill
              value={rotate}
              onChange={setRotate}
              options={[
                { value: '90', label: '90°' },
                { value: '270', label: '270°' },
              ]}
            />
          </Field>
        )}
      </div>
      <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>

      {caps.deviceSettings && (
      <div className="border-t border-line pt-6">
        <h4 className="mb-3 font-bold">{t('canvasSettings.device')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('canvasSettings.sleep')} hint={t('canvasSettings.sleep_hint')}>
            <input type="number" className={inputClass} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} />
          </Field>
          <Field label={t('canvasSettings.idle')} hint={t('canvasSettings.idle_hint')}>
            <input type="number" className={inputClass} value={idle} onChange={(e) => setIdle(Number(e.target.value))} />
          </Field>
        </div>
        <Button className="mt-4" loading={saveDevice.isPending} onClick={() => saveDevice.mutate()}>
          {t('canvasSettings.send')}
        </Button>
      </div>
      )}

      <FrameLookSettings frame={frame} />

      {caps.bleWake && <BluetoothSettings frame={frame} />}

      <div className="border-t border-line pt-6">
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          loading={remove.isPending}
          onClick={async () =>
            (await confirm({ title: t('canvasSettings.delete'), message: t('canvasSettings.confirm_delete', { name: frame.name }) })) &&
            remove.mutate(undefined, { onSuccess: () => nav('/') })
          }
        >
          {t('canvasSettings.delete')}
        </Button>
      </div>
    </div>
  );
}

export function FrameDetail() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const id = Number(useParams().id);
  const frame = useFrame(id);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'schedule');
  const action = useAction(
    (a: string) => api.post<{ ok: boolean; queued?: boolean; playlist?: string }>(`/api/frames/${id}/actions/${a}`).then((r) => ({ ...r, a })),
    {
      success: (r) => {
        const name = r.playlist ?? '';
        if (r.a === 'next') return r.playlist ? t(r.queued ? 'detail.next_queued' : 'detail.next_done', { name }) : t('detail.next_gallery');
        if (r.a === 'clear') return t(r.queued ? 'detail.clear_queued' : 'detail.clear_done');
        if (r.a === 'reboot') return t('detail.reboot_done');
        return t('common.done');
      },
    },
  );
  const refresh = useAction(() => api.post(`/api/frames/${id}/refresh`), {});
  const ble = useBleStatus();
  const settings = useSettings();
  const wake = useAction(() => api.post(`/api/frames/${id}/actions/wake`), { success: t('detail.woken') });
  // Pulse from this phone, then wait for the Canvas to show up on Wi-Fi.
  const phoneWake = useAction(
    async () => {
      try {
        await wakeWithThisDevice();
      } catch (err) {
        if (isPickerCancelled(err)) return false;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 4000));
      for (let i = 0; i < 4; i++) {
        const fr = await api.post<Frame>(`/api/frames/${id}/refresh`);
        if (fr.online) return true;
      }
      throw new Error(t('detail.wake_no_reply'));
    },
    { success: (woken) => (woken ? t('detail.woken') : '') },
  );

  if (!frame.data) return <Spinner />;
  const f = frame.data;
  const info = f.lastInfo ?? {};
  // How this Canvas can be woken from here: the hub's Bluetooth first (no device picker), else this phone's.
  const caps = f.capabilities;
  const wakeVia = !caps.bleWake ? null : f.bleMac && (f.simulated || ble.data?.available) ? 'hub' : !f.simulated && phoneWakeSupport() === 'ok' ? 'phone' : null;
  const waking = wake.isPending || phoneWake.isPending;

  return (
    <div>
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {t('nav.canvas')}
      </Link>
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <div className="rounded-[32px] bg-surface-2/60 px-10 py-10">
            <FrameMockup frame={f} className="mx-auto max-w-[240px]" />
            <p className="mt-4 text-center text-xs text-muted">
              {f.diagonal ? `${f.diagonal}″ · ` : ''}
              {formatCm(frameGeometry(f, withDefaults(f.appearance)))}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" icon={<SkipForward className="size-4" />} onClick={() => action.mutate('next')}>
              {t('detail.next')}
            </Button>
            <Button size="sm" icon={<Eraser className="size-4" />} title={t('detail.clear_hint')} onClick={() => action.mutate('clear')}>
              {t('detail.clear')}
            </Button>
            {/* Same slot: Sleep while awake, Wake while asleep (if it can be woken from here). */}
            {wakeVia && (!f.online || waking) ? (
              <Button
                size="sm"
                icon={wakeVia === 'hub' ? <Bluetooth className="size-4" /> : <Smartphone className="size-4" />}
                title={t(wakeVia === 'hub' ? 'detail.wake_hint' : 'detail.wake_phone_hint')}
                loading={waking}
                onClick={() => (wakeVia === 'hub' ? wake : phoneWake).mutate(undefined)}
              >
                {t('detail.wake')}
              </Button>
            ) : (
              f.online &&
              caps.sleep && (
                <Button size="sm" icon={<Moon className="size-4" />} onClick={() => action.mutate('sleep')}>
                  {t('detail.sleep')}
                </Button>
              )
            )}
            {caps.reboot && (
              <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={async () => (await confirm({ title: t('detail.reboot'), message: t('detail.confirm_reboot'), danger: false })) && action.mutate('reboot')}>
                {t('detail.reboot')}
              </Button>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[28px] font-bold tracking-tight [overflow-wrap:anywhere]">{f.name}</h1>
              <div className="mt-1 flex items-center gap-3">
                {f.simulated ? <TestPill /> : <KindPill kind={f.kind} />}
                <FrameStatus frame={f} />
                <Battery value={f.battery} />
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<Download className="size-4" />} title={t('detail.download_log_hint')} onClick={() => (window.location.href = `/api/frames/${id}/log`)}>
                {t('detail.download_log')}
              </Button>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={refresh.isPending} onClick={() => refresh.mutate()}>
                {t('detail.refresh')}
              </Button>
            </div>
          </div>

          {/* The same eight fields for every kind of frame (two rows); what a frame doesn't report shows "—". */}
          <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            <Info label={t('detail.resolution')} value={`${f.width}×${f.height}`} />
            {/* Frames that don't report a model (DIY) show their kind, as on their chip. */}
            <Info
              label={t('detail.model')}
              value={<TwoLines main={f.model || t(`kind_short.${f.kind}` as MsgKey)} sub={f.firmware && `${t('detail.firmware')} ${f.firmware}`} />}
            />
            <Info label={t('detail.last_seen')} value={relativeTime(f.lastSeen)} />
            <Info label={t('detail.next_change')} value={<NextChange frame={f} />} />
            <Info
              label="Wi-Fi"
              value={f.kind === 'bloomin8' && (info.sta_ssid || f.host) ? <TwoLines main={(info.sta_ssid as string) || '—'} sub={f.host} /> : undefined}
            />
            <Info label={t('detail.wake_model')} value={<TwoLines main={t(`wake_title.${f.wakeModel}` as MsgKey)} sub={t(`wake.${f.wakeModel}` as MsgKey)} />} />
            <Info label={t('detail.free')} value={info.free_size ? <FreeSpace free={Number(info.free_size)} total={Number(info.total_size)} /> : undefined} />
            <Info label={t('detail.pending')} value={t(f.pendingImageId ? 'detail.pending_photo' : 'detail.pending_none')} />
          </Card>

          <Segmented
            value={tab}
            onChange={setTab}
            className="max-w-full overflow-x-auto scrollbar-none"
            options={[
              { value: 'schedule', label: t('nav.schedule') },
              ...(caps.pullToggle ? [{ value: 'mode' as const, label: t('detail.tab_mode') }] : []),
              ...(f.kind !== 'bloomin8' ? [{ value: 'connection' as const, label: t('detail.tab_connection') }] : []),
              { value: 'history', label: t('detail.tab_history') },
              ...(settings.data?.statsEnabled ? [{ value: 'stats' as const, label: t('detail.tab_stats') }] : []),
              ...(caps.galleries ? [{ value: 'device' as const, label: t('detail.tab_device') }] : []),
              { value: 'settings', label: t('nav.settings') },
            ]}
          />
          <Card className="p-6">
            {tab === 'schedule' && <AssignmentEditor key={f.assignment?.id ?? 'new'} frame={f} />}
            {tab === 'mode' && caps.pullToggle && <ModeTab frame={f} />}
            {tab === 'connection' && <ConnectionTab frame={f} />}
            {tab === 'history' && <HistoryTab frame={f} />}
            {tab === 'stats' && settings.data?.statsEnabled && <StatsTab frame={f} />}
            {tab === 'device' && caps.galleries && <DeviceTab frame={f} />}
            {tab === 'settings' && <SettingsTab frame={f} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
