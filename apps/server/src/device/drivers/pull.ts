import type { Frame } from '../../db/schema.js';
import { JPEG, type Capabilities, type FrameDriver, type ImageFormat } from './types.js';

const PULL_ONLY: Capabilities = {
  push: false,
  pull: true,
  deviceNext: false,
  sleep: false,
  reboot: false,
  identify: false,
  galleries: false,
  deviceSettings: false,
  pullToggle: false,
  bleWake: false,
};

/**
 * DIY frame speaking the Open Frame protocol (upstream/openframe.ts): it wakes on a timer,
 * asks the hub what to show and sleeps again. An always-on one can leave a `notify_url`
 * so the hub pokes it when a photo is sent by hand.
 */
export class OpenFrameDriver implements FrameDriver {
  readonly kind = 'openframe' as const;
  readonly capabilities = PULL_ONLY;
  readonly layout = 'as-hung' as const;
  readonly format: ImageFormat;
  readonly wakeModel;

  constructor(private frame: Pick<Frame, 'config' | 'upstreamToken'>) {
    this.format = frame.config?.format ?? JPEG;
    this.wakeModel = frame.config?.notifyUrl ? ('notify' as const) : ('scheduled-pull' as const);
  }

  async nudge() {
    const url = this.frame.config?.notifyUrl;
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.frame.upstreamToken}` },
      signal: AbortSignal.timeout(3000),
    });
  }
}

/**
 * Anything running TRMNL firmware (TRMNL, Waveshare PhotoPainter, Seeed reTerminal…) pointed at
 * the hub as its BYOS server (upstream/trmnl.ts). The stock firmware draws 1-bit BMPs or PNGs.
 */
export class TrmnlDriver implements FrameDriver {
  readonly kind = 'trmnl' as const;
  readonly capabilities = PULL_ONLY;
  readonly layout = 'as-hung' as const;
  readonly wakeModel = 'scheduled-pull' as const;
  readonly format: ImageFormat;

  constructor(frame: Pick<Frame, 'config'>) {
    this.format = frame.config?.format ?? { type: 'bmp', palette: 'bw' };
  }
}
