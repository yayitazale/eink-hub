import crypto from 'node:crypto';
import type { Frame, FrameConfig } from '../../db/schema.js';
import { HttpError } from '../../lib/context.js';
import type { Rendered } from '../../lib/images.js';
import { DeviceError } from '../client.js';
import { JPEG, type DeviceAction, type DriverContext, type FrameDriver } from './types.js';

/**
 * SwitchBot AI Art Frame through the SwitchBot OpenAPI v1.1 cloud (there is no local API).
 * The cloud downloads the picture itself, so it must be at a URL reachable from the internet;
 * it queues it and the frame shows it on its next check-in. 10 000 calls a day per account.
 * https://github.com/OpenWonderLabs/SwitchBotAPI
 */
export const SWITCHBOT_API = 'https://api.switch-bot.com/v1.1';
export const ART_FRAME_TYPES = ['AI Art Frame', 'AI Art Frame Luma'];

/** Panel sizes per model, portrait-first like everything else in the hub. */
export const SWITCHBOT_SIZES = {
  '7.3': { width: 480, height: 800 },
  '13.3': { width: 1200, height: 1600 },
  '31.5': { width: 1440, height: 2560 },
} as const;
export type SwitchBotSize = keyof typeof SWITCHBOT_SIZES;

/** Business codes the cloud returns in the body when the frame (or its hub) can't be reached. */
const OFFLINE_CODES = new Set([161, 171]);

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

/** Headers for one call: HMAC-SHA256 of token + t + nonce with the secret, base64. */
export function signHeaders(token: string, secret: string, t = Date.now(), nonce: string = crypto.randomUUID()) {
  const sign = crypto.createHmac('sha256', secret).update(`${token}${t}${nonce}`).digest('base64');
  return { Authorization: token, sign, t: String(t), nonce, 'Content-Type': 'application/json; charset=utf8' };
}

export class SwitchBotApi {
  constructor(
    private token: string,
    private secret: string,
  ) {}

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(SWITCHBOT_API + path, {
        method,
        headers: signHeaders(this.token, this.secret),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new DeviceError(`SwitchBot cloud unreachable: ${(err as Error).message}`, true);
    }
    const text = await res.text();
    if (!res.ok) throw new DeviceError(`SwitchBot ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`, false, res.status);
    const json = JSON.parse(text) as { statusCode: number; message?: string; body: T };
    if (json.statusCode !== 100) {
      throw new DeviceError(`SwitchBot ${path}: ${json.message ?? 'error'} (${json.statusCode})`, OFFLINE_CODES.has(json.statusCode), json.statusCode);
    }
    return json.body;
  }

  async artFrames(): Promise<SwitchBotDevice[]> {
    const body = await this.request<{ deviceList: SwitchBotDevice[] }>('GET', '/devices');
    return (body.deviceList ?? []).filter((d) => ART_FRAME_TYPES.includes(d.deviceType));
  }

  status(deviceId: string) {
    return this.request<{ battery?: number; imageUrl?: string; version?: string; deviceType?: string }>('GET', `/devices/${deviceId}/status`);
  }

  command(deviceId: string, command: string, parameter: unknown = 'default') {
    return this.request('POST', `/devices/${deviceId}/commands`, { commandType: 'command', command, parameter });
  }
}

export const SWITCHBOT_CAPABILITIES = {
  push: true,
  pull: false,
  deviceNext: true,
  sleep: false,
  reboot: false,
  identify: false,
  galleries: false,
  deviceSettings: false,
  pullToggle: false,
  bleWake: false,
};

export class SwitchBotDriver implements FrameDriver {
  readonly kind = 'switchbot' as const;
  readonly capabilities = SWITCHBOT_CAPABILITIES;
  readonly wakeModel = 'cloud' as const;
  readonly format = JPEG;
  readonly layout = 'as-hung' as const;
  private api: SwitchBotApi;
  private deviceId: string;

  constructor(
    private frame: Pick<Frame, 'config' | 'upstreamToken' | 'orientation'>,
    private ctx: DriverContext,
  ) {
    const c: FrameConfig = frame.config ?? {};
    if (!c.token || !c.secret || !c.deviceId) throw new HttpError(400, 'switchbot_not_configured');
    this.api = new SwitchBotApi(c.token, c.secret);
    this.deviceId = c.deviceId;
  }

  async info() {
    const s = await this.api.status(this.deviceId);
    return {
      battery: typeof s.battery === 'number' ? s.battery : null,
      firmware: s.version ?? null,
      lastInfo: s as Record<string, unknown>,
    } satisfies Partial<Frame>;
  }

  /** Where the SwitchBot cloud downloads the picture from (the same route pull frames use). */
  imageUrl(r: Rendered) {
    if (!/^https:\/\//.test(this.ctx.publicUrl)) throw new HttpError(400, 'switchbot_public_url');
    return `${this.ctx.publicUrl}/u/img/${this.frame.upstreamToken}/${r.hash}_${this.frame.orientation === 'landscape' ? 'L' : 'P'}.jpg`;
  }

  async show(r: Rendered) {
    await this.api.command(this.deviceId, 'uploadImage', { imageUrl: this.imageUrl(r) });
  }

  async action(a: DeviceAction) {
    if (a !== 'next') throw new DeviceError(`SwitchBot frames can't ${a}`, false);
    await this.api.command(this.deviceId, 'next');
  }
}
