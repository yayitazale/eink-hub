import { useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Eye, Send } from 'lucide-react';
import { api, type Crop, type FitMode, type Frame } from '../lib/api';
import { useAction, useFrames } from '../lib/hooks';
import { FrameMockup } from './FrameMockup';
import { useI18n, type MsgKey } from '../i18n';
import { BgPicker } from './BgPicker';
import { Button, Modal, Segmented, Spinner, cx } from './ui';

type Mode = 'auto' | 'crop' | 'contain' | 'blur';

const modeLabels: { value: Mode; label: MsgKey }[] = [
  { value: 'auto', label: 'fit.auto' },
  { value: 'crop', label: 'fit.crop' },
  { value: 'contain', label: 'fit.contain' },
  { value: 'blur', label: 'fit.blur' },
];

function aspectOf(f: Frame) {
  const s = Math.min(f.width, f.height);
  const l = Math.max(f.width, f.height);
  return f.orientation === 'landscape' ? l / s : s / l;
}

export function SendDialog({ imageId, open, onClose, defaultFrameId }: { imageId: number | null; open: boolean; onClose: () => void; defaultFrameId?: number }) {
  const { t } = useI18n();
  const frames = useFrames();
  const [frameId, setFrameId] = useState<number | undefined>(defaultFrameId);
  const [mode, setMode] = useState<Mode>('auto');
  const [bg, setBg] = useState('#ffffff');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Crop | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const frame = frames.data?.find((f) => f.id === frameId) ?? frames.data?.[0];

  useEffect(() => {
    if (!frameId && frames.data?.length) setFrameId(defaultFrameId ?? frames.data[0].id);
  }, [frames.data, frameId, defaultFrameId]);

  // Load any saved crop for this image+frame aspect.
  useEffect(() => {
    if (!open || !imageId || !frame) return;
    setPreview(null);
    api.get<{ crop: Crop | null }>(`/api/images/${imageId}/crop?frameId=${frame.id}`).then((r) => {
      if (r.crop) {
        setMode('crop');
        setArea(r.crop);
      }
    });
  }, [open, imageId, frame?.id]);

  useEffect(() => setPreview(null), [mode, bg, area, frame?.id]);

  const options = useMemo(() => {
    if (mode === 'crop' && area) return { fit: 'cover' as FitMode, crop: area };
    if (mode === 'contain') return { fit: 'contain' as FitMode, bg, crop: null };
    if (mode === 'blur') return { fit: 'blur' as FitMode, crop: null };
    return { fit: 'cover' as FitMode, crop: null };
  }, [mode, area, bg]);

  const showPreview = async () => {
    if (!imageId || !frame) return;
    setPreviewLoading(true);
    try {
      const blob = await api.post<Blob>('/api/render/preview', { imageId, frameId: frame.id, ...options });
      setPreview(URL.createObjectURL(blob));
    } finally {
      setPreviewLoading(false);
    }
  };

  const send = useAction(
    async () => {
      if (!imageId || !frame) throw new Error(t('send.pick_canvas'));
      if (mode === 'crop' && area) await api.put(`/api/images/${imageId}/crop`, { frameId: frame.id, crop: area });
      return api.post<{ method: 'push' | 'queued' }>(`/api/frames/${frame.id}/display`, { imageId, ...options });
    },
    {
      success: (r) =>
        t(
          r.method === 'push'
            ? frame?.wakeModel === 'cloud'
              ? 'send.sent_cloud'
              : 'send.sent'
            : frame?.capabilities.push === false
              ? 'send.queued_pull'
              : 'send.queued',
        ),
    },
  );

  const onCropComplete = (pct: Area) => setArea({ x: pct.x / 100, y: pct.y / 100, w: pct.width / 100, h: pct.height / 100 });

  return (
    <Modal open={open} onClose={onClose} title={t('send.title')} wide={mode === 'crop' ? true : 'md'}>
      {!frames.data ? (
        <Spinner />
      ) : frames.data.length === 0 ? (
        <p className="text-sm text-muted">{t('send.no_canvas')}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {frames.data.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFrameId(f.id)}
                  className={cx(
                    'rounded-full border px-4 py-2 text-sm font-semibold transition',
                    f.id === frame?.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <Segmented className="max-w-full overflow-x-auto scrollbar-none" value={mode} onChange={setMode} options={modeLabels.map((m) => ({ value: m.value, label: t(m.label) }))} />

            {mode === 'crop' && frame && imageId ? (
              <div className="relative h-[52dvh] overflow-hidden rounded-3xl bg-[#2a2926]">
                <Cropper
                  image={`/api/images/${imageId}/preview`}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspectOf(frame)}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  initialCroppedAreaPercentages={area ? { x: area.x * 100, y: area.y * 100, width: area.w * 100, height: area.h * 100 } : undefined}
                  objectFit="contain"
                />
              </div>
            ) : (
              <p className="text-sm text-muted">
                {mode === 'auto' && t('send.auto_hint')}
                {mode === 'contain' && t('send.contain_hint')}
                {mode === 'blur' && t('send.blur_hint')}
              </p>
            )}
            {mode === 'contain' && (
              <BgPicker value={bg} onChange={setBg} />
            )}
          </div>

          <div className="flex flex-col gap-4">
            {frame && (
              <div className="relative mx-auto w-full max-w-[240px]">
                <FrameMockup frame={{ ...frame, currentRender: null, currentImageId: imageId }} src={preview ?? (imageId ? `/api/images/${imageId}/thumb` : null)} />
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner className="text-white" />
                  </div>
                )}
              </div>
            )}
            <p className="text-center text-xs text-muted">{t(preview ? 'send.preview_exact' : 'send.preview_thumb')}</p>
            <Button icon={<Eye className="size-4" />} onClick={showPreview} loading={previewLoading}>
              {t('send.preview')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={<Send className="size-4" />}
              loading={send.isPending}
              onClick={() => send.mutate(undefined, { onSuccess: onClose })}
            >
              {t('send.send_to', { name: frame?.name ?? '' })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
