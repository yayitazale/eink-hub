/**
 * Wake a Canvas with this device's own Bluetooth (Web Bluetooth): same pulse as the hub
 * and the official app — 0x01 then 0x00 to characteristic 0xF001 of service 0xF000.
 * Chrome/Edge on Android and desktop only, and only on HTTPS or localhost.
 */

// Minimal Web Bluetooth types (not in TypeScript's DOM lib).
interface BleCharacteristic {
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
interface BleServer {
  connected: boolean;
  getPrimaryService(service: number): Promise<{ getCharacteristic(c: number): Promise<BleCharacteristic> }>;
  disconnect(): void;
}
interface BleDevice {
  gatt?: { connect(): Promise<BleServer> };
}
interface Bluetooth {
  getAvailability?(): Promise<boolean>;
  requestDevice(opts: {
    filters: ({ services: number[] } | { manufacturerData: { companyIdentifier: number }[] })[];
    optionalServices: number[];
  }): Promise<BleDevice>;
}

const WAKE_SERVICE = 0xf000;
const WAKE_CHAR = 0xf001;
// Seen in Canvas advertisements (eink_canvas_home_assistant_component const.py).
const ADV_SERVICE = 0xfff0;
const MANUFACTURER_ID = 0x013f;

const bluetooth = () => (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;

export type PhoneWakeSupport = 'ok' | 'insecure' | 'unsupported';

/** Plain-HTTP LAN addresses are not a secure context, so the browser hides Web Bluetooth there. */
export function phoneWakeSupport(): PhoneWakeSupport {
  if (!window.isSecureContext) return 'insecure';
  return bluetooth() ? 'ok' : 'unsupported';
}

/** Opens the browser's device picker, then sends the pulse. Must run from a click. */
export async function wakeWithThisDevice() {
  const bt = bluetooth();
  if (!bt) throw new Error('Web Bluetooth unavailable');
  const device = await bt.requestDevice({
    filters: [{ services: [ADV_SERVICE] }, { services: [WAKE_SERVICE] }, { manufacturerData: [{ companyIdentifier: MANUFACTURER_ID }] }],
    optionalServices: [WAKE_SERVICE],
  });
  const server = await device.gatt!.connect();
  try {
    const ch = await (await server.getPrimaryService(WAKE_SERVICE)).getCharacteristic(WAKE_CHAR);
    await ch.writeValueWithoutResponse(new Uint8Array([0x01]));
    await new Promise((r) => setTimeout(r, 1));
    await ch.writeValueWithoutResponse(new Uint8Array([0x00])).catch(() => {});
  } finally {
    if (server.connected) server.disconnect();
  }
}

/** The user closed the picker: not an error worth a toast. */
export const isPickerCancelled = (err: unknown) => err instanceof DOMException && err.name === 'NotFoundError';
