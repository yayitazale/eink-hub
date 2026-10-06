import type { DB } from '../../db/index.js';
import type { Frame } from '../../db/schema.js';
import { cloudUrlSetting } from '../../lib/context.js';
import { Bloomin8Driver } from './bloomin8.js';
import { OpenFrameDriver, TrmnlDriver } from './pull.js';
import { SWITCHBOT_CAPABILITIES, SwitchBotDriver } from './switchbot.js';
import { JPEG, frameKinds, type FrameDriver, type FrameKind, type ImageFormat } from './types.js';

export * from './types.js';

export const isFrameKind = (v: unknown): v is FrameKind => frameKinds.includes(v as FrameKind);

/** The driver that talks to this frame. Cheap to build: make one per operation. */
export function driverFor(db: DB, frame: Frame): FrameDriver {
  switch (frame.kind) {
    case 'switchbot':
      return new SwitchBotDriver(frame, { publicUrl: cloudUrlSetting(db) });
    case 'openframe':
      return new OpenFrameDriver(frame);
    case 'trmnl':
      return new TrmnlDriver(frame);
    default:
      return new Bloomin8Driver(frame);
  }
}

/** What renderFor needs to know, without building a driver (no credentials involved). */
export function renderTarget(frame: Pick<Frame, 'kind' | 'config'>): { format: ImageFormat; rotateBuffer: boolean } {
  switch (frame.kind) {
    case 'openframe':
    case 'trmnl':
      return { format: frame.kind === 'trmnl' ? new TrmnlDriver(frame).format : (frame.config?.format ?? JPEG), rotateBuffer: false };
    case 'switchbot':
      return { format: JPEG, rotateBuffer: false };
    default:
      return { format: JPEG, rotateBuffer: true };
  }
}

/** Capabilities for the UI, without building a driver (a SwitchBot one needs credentials). */
export function describeKind(frame: Frame) {
  if (frame.kind === 'switchbot') return { capabilities: SWITCHBOT_CAPABILITIES, wakeModel: 'cloud' as const };
  const d = driverFor(undefined as unknown as DB, frame);
  return { capabilities: d.capabilities, wakeModel: d.wakeModel };
}
