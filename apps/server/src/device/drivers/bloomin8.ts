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
    // Make room first, while the Canvas is idle: once the new picture is uploaded it spends
    // the next half minute refreshing the panel, and may fall asleep before a later cleanup.
    // A failed cleanup must not block the picture; the next push catches up.
    await this.pruneHubGallery(HUB_GALLERY_KEEP - 1, r.deviceName).catch(() => {});
    await this.client.upload(r.buf, r.deviceName, { gallery: HUB_GALLERY, showNow: true });
  }

  async action(a: DeviceAction) {
    if (a === 'next') await this.client.showNext();
    else if (a === 'sleep') await this.client.sleep();
    else if (a === 'reboot') await this.client.reboot();
    else await this.client.whistle();
  }

  /** Keep only the `keep` newest pictures the hub pushed (not counting `incoming`, about to be replaced). */
  private async pruneHubGallery(keep: number, incoming: string) {
    const g = await this.client.gallery(HUB_GALLERY, 0, 200);
    const old = (g?.data ?? []).filter((i) => i.name !== incoming).sort((a, b) => b.time - a.time).slice(keep);
    for (const item of old) await this.client.deleteImage(item.name, HUB_GALLERY);
  }
}
