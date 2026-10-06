import type { Frame } from '../db/schema.js';
import { BleError, bleStatus, bleWake } from '../device/ble.js';
import { DeviceError, FrameClient, type DeviceInfo } from '../device/client.js';
import { HttpError, type Ctx } from './context.js';
import { getFrame, infoToFrame, markOnline } from './display.js';
import { isSimulated } from './simulators.js';

/** Wi-Fi and the HTTP API take a few seconds to come up after the wake pulse. */
export const WAKE_SETTLE_MS = 4000;
const WAKE_WAIT_MS = 25_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll /deviceInfo until the frame answers or the budget runs out. */
async function waitAwake(host: string, settleMs: number, budgetMs: number): Promise<DeviceInfo | null> {
  const deadline = Date.now() + budgetMs;
  await sleep(settleMs);
  while (Date.now() < deadline) {
    const t0 = Date.now();
    try {
      return await new FrameClient(host, 3000).deviceInfo();
    } catch {
      await sleep(Math.max(0, 1000 - (Date.now() - t0)));
    }
  }
  return null;
}

async function awakeNow(frame: Frame) {
  try {
    return await new FrameClient(frame.host, 2000).deviceInfo();
  } catch {
    return null;
  }
}

/**
 * The "Wake (Bluetooth)" button: pulse over the host's Bluetooth and wait for the frame
 * to come online. A frame that already answers is left alone (no pulse, no battery spent).
 */
export async function wakeFrame(ctx: Ctx, frame: Frame, timing = { settleMs: WAKE_SETTLE_MS, budgetMs: WAKE_WAIT_MS }) {
  let info = await awakeNow(frame);
  if (!info) {
    // Test Canvases have no radio: they are always "woken".
    if (isSimulated(ctx.db, frame.id)) throw new DeviceError(`Frame ${frame.host} unreachable`, true);
    if (!frame.bleMac) throw new HttpError(400, 'ble_no_mac');
    const status = await bleStatus();
    if (!status.available) throw new HttpError(503, 'ble_unavailable');
    try {
      ctx.log.info({ frame: frame.id }, `bluetooth wake pulse sent to ${frame.name}`);
      await bleWake(frame.bleMac);
    } catch (err) {
      if (err instanceof BleError) throw new HttpError(502, 'ble_wake_failed', { detail: err.message });
      throw err;
    }
    info = await waitAwake(frame.host, timing.settleMs, timing.budgetMs);
    if (!info) throw new HttpError(504, 'ble_woke_no_reply');
  }
  markOnline(ctx.db, frame.id, true, infoToFrame(info));
  ctx.log.info({ frame: frame.id }, `${frame.name} is awake`);
  return getFrame(ctx.db, frame.id);
}

/** Auto-wake is opt-in per frame and needs a usable adapter. */
async function canAutoWake(ctx: Ctx, frame: Frame) {
  if (!frame.bleAutoWake || !frame.bleMac || isSimulated(ctx.db, frame.id)) return false;
  return (await bleStatus()).available;
}

/** After a failed background auto-wake, leave the frame alone for a while (out of range, flat battery…). */
export const AUTO_WAKE_BACKOFF_MS = 15 * 60_000;
const failedAt = new Map<number, number>();

/**
 * Run a call that needs the frame awake. If it fails because the frame is asleep and
 * auto-wake is on, wake it over Bluetooth and try once more; otherwise the original error stands.
 * `background` (scheduler) skips frames whose last auto-wake failed recently.
 */
export async function withWake<T>(ctx: Ctx, frame: Frame, fn: () => Promise<T>, opts: { background?: boolean } = {}): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof DeviceError && err.offline) || !(await canAutoWake(ctx, frame))) throw err;
    if (opts.background && Date.now() - (failedAt.get(frame.id) ?? 0) < AUTO_WAKE_BACKOFF_MS) throw err;
    let info: DeviceInfo | null = null;
    try {
      await bleWake(frame.bleMac!);
      info = await waitAwake(frame.host, WAKE_SETTLE_MS, WAKE_WAIT_MS);
      if (!info) ctx.log.warn({ frame: frame.id }, 'bluetooth auto-wake: frame did not come online');
    } catch (wakeErr) {
      ctx.log.warn({ err: wakeErr, frame: frame.id }, 'bluetooth auto-wake failed');
    }
    if (!info) {
      failedAt.set(frame.id, Date.now());
      throw err;
    }
    failedAt.delete(frame.id);
    markOnline(ctx.db, frame.id, true, infoToFrame(info));
    return fn();
  }
}
