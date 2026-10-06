/**
 * Bluetooth wake for Canvases in deep sleep, through the host's BlueZ over D-Bus
 * (the container needs /run/dbus mounted; see docs/bluetooth.md).
 * Protocol from ARPOBOT-BLOOMIN8/eink_canvas_home_assistant_component (const.py, ble_wake.py):
 * connect, write 0x01 then 0x00 to characteristic 0xF001 without response, disconnect.
 * Wi-Fi and the HTTP API come up a few seconds later.
 */
import fs from 'node:fs';
import type NodeBle from 'node-ble';
import { config } from '../config.js';

export const WAKE_SERVICE = '0000f000-0000-1000-8000-00805f9b34fb';
export const WAKE_CHAR = '0000f001-0000-1000-8000-00805f9b34fb';

export type BleUnavailable = 'disabled' | 'no_dbus' | 'no_bluez' | 'no_adapter' | 'powered_off';
export type BleStatus = { available: true; adapter: string } | { available: false; reason: BleUnavailable; detail?: string };

export class BleError extends Error {}

/** "F49042163F47", "f4-90-42-16-3f-47"… → "F4:90:42:16:3F:47"; null if it is not a MAC. */
export function normalizeMac(raw: unknown): string | null {
  const hex = String(raw ?? '').replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/../g)!.join(':');
}

/**
 * One D-Bus connection per operation, closed when it ends or times out. Bus errors
 * (socket gone, access denied) reject instead of crashing the process.
 */
async function session<T>(what: string, timeoutMs: number, fn: (bt: NodeBle.Bluetooth) => Promise<T>): Promise<T> {
  process.env.DBUS_SYSTEM_BUS_ADDRESS ??= `unix:path=${config.dbusSocket}`;
  const { createBluetooth } = await import('node-ble');
  const { bluetooth, destroy } = createBluetooth();
  let fail!: (err: Error) => void;
  const failed = new Promise<never>((_, reject) => (fail = reject));
  failed.catch(() => {});
  (bluetooth as unknown as { dbus: NodeJS.EventEmitter }).dbus.on('error', (err: Error) => fail(err));
  const timer = setTimeout(() => fail(new BleError(`${what} timed out after ${timeoutMs} ms`)), timeoutMs);
  try {
    return await Promise.race([fn(bluetooth), failed]);
  } finally {
    clearTimeout(timer);
    try {
      destroy();
    } catch {
      // already closed
    }
  }
}

let cached: { at: number; status: BleStatus } | null = null;
const STATUS_TTL = 60_000;

/** Whether the hub can wake frames over the host's Bluetooth, and why not. Cached for a minute. */
export async function bleStatus(force = false): Promise<BleStatus> {
  if (!force && cached && Date.now() - cached.at < STATUS_TTL) return cached.status;
  const status = await probe();
  cached = { at: Date.now(), status };
  return status;
}

async function probe(): Promise<BleStatus> {
  if (!config.bleEnabled) return { available: false, reason: 'disabled' };
  if (!fs.existsSync(config.dbusSocket)) return { available: false, reason: 'no_dbus' };
  try {
    return await session('BlueZ probe', 5000, async (bt): Promise<BleStatus> => {
      const names = await bt.adapters();
      if (!names.length) return { available: false, reason: 'no_adapter' };
      const adapter = await bt.getAdapter(names[0]);
      if (!(await adapter.isPowered())) return { available: false, reason: 'powered_off', detail: names[0] };
      return { available: true, adapter: names[0] };
    });
  } catch (err) {
    // Socket there but no bluetoothd behind it, or D-Bus refused us.
    return { available: false, reason: 'no_bluez', detail: (err as Error).message };
  }
}

// One adapter: BLE operations run one at a time.
let queue: Promise<unknown> = Promise.resolve();
const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const lastPulse = new Map<string, number>();
export const WAKE_COOLDOWN_MS = 5000;
const WAKE_BUDGET_MS = 30_000;

/**
 * Send the wake pulse. Throws BleError when Bluetooth is unavailable or the frame cannot
 * be reached. A pulse sent to the same frame in the last few seconds is not repeated.
 */
export function bleWake(rawMac: string): Promise<{ skipped: boolean; ms: number }> {
  const mac = normalizeMac(rawMac);
  if (!mac) return Promise.reject(new BleError(`invalid Bluetooth address: ${rawMac}`));
  return serialize(async () => {
    const t0 = Date.now();
    if (t0 - (lastPulse.get(mac) ?? 0) < WAKE_COOLDOWN_MS) return { skipped: true, ms: 0 };
    const status = await bleStatus();
    if (!status.available) throw new BleError(`Bluetooth unavailable: ${status.reason}`);
    await session('Bluetooth wake', WAKE_BUDGET_MS, (bt) => pulse(bt, mac));
    lastPulse.set(mac, Date.now());
    return { skipped: false, ms: Date.now() - t0 };
  });
}

async function pulse(bt: NodeBle.Bluetooth, mac: string) {
  const adapter = await bt.defaultAdapter();
  let device: NodeBle.Device;
  try {
    // Known to BlueZ already (seen recently or paired).
    device = await adapter.getDevice(mac);
  } catch {
    const started = !(await adapter.isDiscovering());
    if (started) await adapter.startDiscovery();
    try {
      device = await adapter.waitDevice(mac, 15_000, 500);
    } catch {
      throw new BleError(`Canvas ${mac} not found over Bluetooth (out of range?)`);
    } finally {
      if (started) await adapter.stopDiscovery().catch(() => {});
    }
  }
  try {
    await device.connect();
    const service = await (await device.gatt()).getPrimaryService(WAKE_SERVICE);
    const ch = await service.getCharacteristic(WAKE_CHAR);
    await ch.writeValueWithoutResponse(Buffer.from([0x01]));
    await new Promise((r) => setTimeout(r, 1));
    // The release byte is best-effort, like the reference implementation.
    await ch.writeValueWithoutResponse(Buffer.from([0x00])).catch(() => {});
  } finally {
    await device.disconnect().catch(() => {});
  }
}

/** Test hook: forget cooldowns and the cached status. */
export function resetBle() {
  lastPulse.clear();
  cached = null;
}
