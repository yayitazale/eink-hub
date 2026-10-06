import type { Frame } from '../../db/schema.js';
import type { Rendered } from '../../lib/images.js';
import { normalizeMac } from '../ble.js';
import { FrameClient, type DeviceInfo } from '../client.js';
import { JPEG, type DeviceAction, type FrameDriver } from './types.js';

/** Gallery on the Canvas where the hub drops what it pushes; trimmed to the latest few. */
export const HUB_GALLERY = 'hub';
const HUB_GALLERY_KEEP = 20;

export function infoToFrame(info: DeviceInfo): Partial<Frame> {
  const w = Number(info.width) || undefined;
  const h = Number(info.height) || undefined;
  const bleMac = normalizeMac(info.bt_mac);
  return {
    model: info.screen_model ?? info.board_model ?? null,
    firmware: info.version ?? null,
    battery: typeof info.battery === 'number' ? info.battery : null,
    lastInfo: info,
    // Store native resolution portrait-first regardless of how the device reports it.
    ...(w && h ? { width: Math.min(w, h), height: Math.max(w, h) } : {}),
    ...(bleMac ? { bleMac } : {}),
  };
}

/** BLOOMIN8 E-Ink Canvas: local REST API, deep sleep, Bluetooth wake, its own dithering. */
export class Bloomin8Driver implements FrameDriver {
  readonly kind = 'bloomin8' as const;
  readonly capabilities = {
    push: true,
    pull: true,
    deviceNext: true,
    sleep: true,
    reboot: true,
    identify: true,
    galleries: true,
    deviceSettings: true,
    pullToggle: true,
    bleWake: true,
  };
  readonly wakeModel = 'ble' as const;
  readonly format = JPEG;
  readonly layout = 'portrait' as const;
  readonly client: FrameClient;

  constructor(frame: Pick<Frame, 'host'>) {
    this.client = new FrameClient(frame.host);
  }

  async info(timeoutMs?: number) {
    return infoToFrame(await this.client.deviceInfo(timeoutMs));
  }

  async show(r: Rendered) {
    await this.client.upload(r.buf, r.deviceName, { gallery: HUB_GALLERY, showNow: true });
    this.pruneHubGallery().catch(() => {});
  }

  async action(a: DeviceAction) {
    if (a === 'next') await this.client.showNext();
    else if (a === 'sleep') await this.client.sleep();
    else if (a === 'reboot') await this.client.reboot();
    else await this.client.whistle();
  }

  private async pruneHubGallery() {
    const g = await this.client.gallery(HUB_GALLERY, 0, 200);
    const old = [...(g?.data ?? [])].sort((a, b) => b.time - a.time).slice(HUB_GALLERY_KEEP);
    for (const item of old) await this.client.deleteImage(item.name, HUB_GALLERY);
  }
}
