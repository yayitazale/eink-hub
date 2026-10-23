import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bluetooth, Check, TriangleAlert, Wifi } from 'lucide-react';
import { api, type Frame } from '../lib/api';
import { isPickerCancelled, simulateWake, wakeWithThisDevice } from '../lib/webBluetooth';
import { useI18n, type MsgKey } from '../i18n';
import { Button, Modal, cx } from './ui';

type Step = 'ready' | 'picking' | 'connecting' | 'waiting' | 'done' | 'error';

/**
 * Wake a Canvas with this phone's Bluetooth. The browser's own device picker can't be skipped,
 * so this sheet frames it: before (get close, tap Search), and after (waking, waiting for Wi-Fi).
 * Every step renders the same blocks at fixed heights, so the sheet never changes size.
 */
export function PhoneWakeSheet({ frame, open, onClose }: { frame: Frame; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('ready');
  const [error, setError] = useState<MsgKey>('phoneWake.ble_error');
  const qc = useQueryClient();

  const close = () => {
    // Mid-wake the pulse is already on its way; closing just hides the progress.
    onClose();
    setStep('ready');
  };

  const run = async () => {
    setStep('picking');
    try {
      await (frame.simulated ? simulateWake : wakeWithThisDevice)(() => setStep('connecting'));
    } catch (err) {
      if (isPickerCancelled(err)) return setStep('ready');
      setError('phoneWake.ble_error');
      return setStep('error');
    }
    setStep('waiting');
    await new Promise((r) => setTimeout(r, 4000));
    let online = false;
    for (let i = 0; i < 4 && !online; i++) {
      online = !!(await api.post<Frame>(`/api/frames/${frame.id}/refresh`).catch(() => null))?.online;
    }
    qc.invalidateQueries({ queryKey: ['frames'] });
    if (online) return setStep('done');
    setError('detail.wake_no_reply');
    setStep('error');
  };

  const name = frame.name;
  const view: Record<Step, { icon: ReactNode; tone: 'accent' | 'ok' | 'warn'; pulse?: boolean; title: string; sub: string }> = {
    ready: { icon: <Bluetooth />, tone: 'accent', title: t('phoneWake.ready_title', { name }), sub: t('phoneWake.ready_sub') },
    picking: { icon: <Bluetooth />, tone: 'accent', pulse: true, title: t('phoneWake.picking_title'), sub: t('phoneWake.ready_sub') },
    connecting: { icon: <Bluetooth />, tone: 'accent', pulse: true, title: t('phoneWake.connecting_title', { name }), sub: t('phoneWake.connecting_sub') },
    waiting: { icon: <Wifi />, tone: 'accent', pulse: true, title: t('phoneWake.waiting_title'), sub: t('phoneWake.waiting_sub') },
    done: { icon: <Check />, tone: 'ok', title: t('detail.woken'), sub: t('phoneWake.done_sub') },
    error: { icon: <TriangleAlert />, tone: 'warn', title: t('phoneWake.error_title'), sub: t(error) },
  };
  const v = view[step];
  const busy = step === 'picking' || step === 'connecting' || step === 'waiting';
  const tones = {
    accent: 'bg-accent-soft text-accent',
    ok: 'bg-leaf-soft text-leaf',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  };

  return (
    <Modal open={open} onClose={close} title={t('phoneWake.title')} wide="sm">
      <div className="flex flex-col items-center text-center">
        {/* my-6 leaves room for the pulse wave (up to 1.45× the circle) inside the sheet's scroll area. */}
        <div className="relative my-6 grid size-20 place-items-center">
          {v.pulse && <span className={cx('pulse-ring absolute inset-0 rounded-full', tones[v.tone])} aria-hidden />}
          <span className={cx('relative grid size-20 place-items-center rounded-full transition-colors [&>svg]:size-9', tones[v.tone])}>{v.icon}</span>
        </div>
        {/* Fixed-height text blocks: long titles or hints wrap inside them instead of growing the sheet. */}
        <p className="flex h-12 items-center font-bold [overflow-wrap:anywhere]" aria-live="polite">
          {v.title}
        </p>
        <p className="h-16 text-sm text-muted">{v.sub}</p>
        <div className="mt-2 grid w-full gap-2">
          {step === 'done' ? (
            <Button variant="primary" size="lg" onClick={close}>
              {t('common.close')}
            </Button>
          ) : (
            <Button variant="primary" size="lg" loading={busy} disabled={busy} icon={<Bluetooth className="size-4" />} onClick={run}>
              {t(step === 'error' ? 'phoneWake.retry' : 'phoneWake.search')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
