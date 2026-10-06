import type { Frame } from '../../db/schema.js';
import type { Rendered } from '../../lib/images.js';

/**
 * A brand of frame, or a protocol a DIY frame speaks. Everything brand-specific about
 * talking to a frame lives behind this interface; the rest of the hub only sees a Frame row.
 */
export const frameKinds = ['bloomin8', 'switchbot', 'openframe', 'trmnl'] as const;
export type FrameKind = (typeof frameKinds)[number];

export interface Capabilities {
  /** The hub can put an image on screen whenever it wants (frame awake, or a cloud that queues it). */
  push: boolean;
  /** The frame wakes up on its own and asks the hub what to show. */
  pull: boolean;
  /** "Next" handled by the device itself when no schedule is assigned. */
  deviceNext: boolean;
  sleep: boolean;
  reboot: boolean;
  /** Make the frame beep / blink so you can find it. */
  identify: boolean;
  /** On-device galleries, playlists and settings (BLOOMIN8 only). */
  galleries: boolean;
  deviceSettings: boolean;
  /** The hub can switch it between push and pull (BLOOMIN8 Schedule Pull). */
  pullToggle: boolean;
  bleWake: boolean;
}

/**
 * How a sleeping frame gets to see a new picture:
 * - ble: the hub wakes it over Bluetooth, then pushes (BLOOMIN8).
 * - cloud: the vendor's cloud queues it and the frame fetches it on its next check-in.
 * - scheduled-pull: the frame wakes on a timer the hub sets in every reply.
 * - notify: an always-on DIY frame the hub can poke so it polls right away.
 */
export type WakeModel = 'ble' | 'cloud' | 'scheduled-pull' | 'notify';

export const palettes = ['bw', 'gray4', 'spectra6', 'acep7'] as const;
export type Palette = (typeof palettes)[number];

export interface ImageFormat {
  type: 'jpeg' | 'png' | 'bmp';
  /** Dither to this palette in the hub (for panels that can't do it themselves). */
  palette?: Palette;
}

export const JPEG: ImageFormat = { type: 'jpeg' };

/**
 * `portrait`: the panel buffer is always portrait and landscape pictures are rotated into it
 * (BLOOMIN8). `as-hung`: the image is delivered the way it is seen on the wall.
 */
export type BufferLayout = 'portrait' | 'as-hung';

/** Actions a driver may implement; anything else is handled by the hub. */
export type DeviceAction = 'next' | 'sleep' | 'reboot' | 'identify';

export interface FrameDriver {
  readonly kind: FrameKind;
  readonly capabilities: Capabilities;
  readonly wakeModel: WakeModel;
  readonly format: ImageFormat;
  readonly layout: BufferLayout;
  /**
   * Ask the device (or its cloud) how it is: resolution, battery, firmware… as a patch for the
   * Frame row. Throws DeviceError(offline) when it doesn't answer. Absent for pull-only frames.
   */
  info?(timeoutMs?: number): Promise<Partial<Frame>>;
  /** Put a rendered picture on screen. Only when `capabilities.push`. */
  show?(r: Rendered): Promise<void>;
  action?(a: DeviceAction): Promise<void>;
  /** Best effort: tell an always-on frame there is something new so it polls now. */
  nudge?(): Promise<void>;
}

export interface DriverContext {
  /** Public address of the hub, for clouds that download the image themselves. */
  publicUrl: string;
}
