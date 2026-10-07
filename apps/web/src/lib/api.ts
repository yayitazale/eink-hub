import { currentLang } from '../i18n';

export type FitMode = 'cover' | 'contain' | 'blur';
export type OrderMode = 'random' | 'sequential' | 'newest';
export type CollectionType = 'manual' | 'immich_album' | 'immich_person' | 'immich_favorites' | 'immich_smart' | 'immich_memories';

export type Schedule =
  | { kind: 'interval'; hours: 1 | 3 | 6 | 12 }
  | { kind: 'days'; days: 1 | 2 | 3; at: string }
  | { kind: 'weeks'; weeks: 1 | 2; weekday: number; at: string }
  | { kind: 'monthly'; day: number; at: string }
  | { kind: 'cron'; expr: string };

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Assignment {
  id: number;
  frameId: number;
  collectionId: number;
  orderMode: OrderMode;
  schedule: Schedule;
  nextChange: number | null;
  activeFrom: string | null;
  activeTo: string | null;
  fit: FitMode;
  bg: string;
  showDate: boolean;
  enabled: boolean;
  lastChange: number | null;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  t: number;
  level: LogLevel;
  msg: string;
  frame?: number;
  data?: Record<string, unknown>;
}

export type FrameKind = 'bloomin8' | 'switchbot' | 'openframe' | 'trmnl';
export type Palette = 'bw' | 'gray4' | 'spectra6' | 'acep7';
export interface ImageFormat {
  type: 'jpeg' | 'png' | 'bmp';
  palette?: Palette;
}

/** What a kind of frame can do (server: device/drivers/types.ts). */
export interface Capabilities {
  push: boolean;
  pull: boolean;
  deviceNext: boolean;
  sleep: boolean;
  reboot: boolean;
  identify: boolean;
  galleries: boolean;
  deviceSettings: boolean;
  pullToggle: boolean;
  bleWake: boolean;
}

export interface Frame {
  id: number;
  kind: FrameKind;
  /** Per-kind settings; secrets (SwitchBot token/secret) are never sent. */
  config: { deviceId?: string; format?: ImageFormat; notifyUrl?: string; maxPollMinutes?: number };
  capabilities: Capabilities;
  /** How a sleeping frame gets a new picture: ble, cloud, scheduled-pull or notify. */
  wakeModel: 'ble' | 'cloud' | 'scheduled-pull' | 'notify';
  /** Token DIY / TRMNL frames authenticate with. */
  upstreamToken: string;
  name: string;
  host: string;
  deviceId: string | null;
  model: string | null;
  firmware: string | null;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  rotate: number;
  battery: number | null;
  online: boolean;
  lastSeen: number | null;
  lastInfo: Record<string, unknown> | null;
  mode: 'push' | 'pull';
  pullSchedule: Schedule;
  pendingImageId: number | null;
  currentImageId: number | null;
  currentRender: string | null;
  nextWake: number | null;
  assignment: Assignment | null;
  /** A simulated Canvas running inside the hub. */
  simulated?: boolean;
  /** Bluetooth address used to wake it ("AA:BB:CC:DD:EE:FF"). */
  bleMac: string | null;
  /** Wake over the hub's Bluetooth before sending when asleep. */
  bleAutoWake: boolean;
  /** Screen diagonal in inches: set by hand, or inferred from model/resolution (null if unknown). */
  diagonal: number | null;
  diagonalInferred: boolean;
  /** How the frame around it looks in the mockups. */
  appearance: FrameAppearance;
}

export type FrameColor = 'black' | 'white' | 'walnut' | 'oak' | 'natural';
export type FrameStyle = 'thin' | 'thick' | 'classic';
export interface FrameAppearance {
  mat?: boolean;
  color?: FrameColor;
  style?: FrameStyle;
}

/** Whether the hub itself can use the host's Bluetooth. */
export type BleStatus =
  | { available: true; adapter: string }
  | { available: false; reason: 'disabled' | 'no_dbus' | 'no_bluez' | 'no_adapter' | 'powered_off'; detail?: string };

export interface Image {
  id: number;
  source: 'local' | 'immich';
  immichAssetId: string | null;
  originalName: string | null;
  width: number | null;
  height: number | null;
  takenAt: number | null;
  favorite: boolean;
  createdAt: number;
}

export interface Collection {
  id: number;
  name: string;
  type: CollectionType;
  config: Record<string, unknown>;
  lastSync: number | null;
  syncError: string | null;
  itemCount: number;
  coverImageId: number | null;
}

export interface ImmichAssetLite {
  id: string;
  name?: string;
  takenAt?: string;
  favorite?: boolean;
  orientation?: 'landscape' | 'portrait' | 'square' | null;
}

export interface HistoryEntry {
  id: number;
  imageId: number;
  shownAt: number;
  method: 'push' | 'pull';
  success: boolean | null;
  battery: number | null;
}

export interface SwitchBotDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
}

export interface DiscoveredFrame {
  host: string;
  name: string;
  info: Record<string, unknown>;
}

export interface Settings {
  immichUrl: string;
  immichApiKeySet: boolean;
  /** LAN address Canvases use (pull mode), plus how it was obtained. */
  localUrl: string;
  localUrlSource: 'settings' | 'env' | 'browser' | 'interface' | 'none';
  /** Optional reverse-proxy / Tailscale address; the welcome QR opens it. */
  externalUrl: string;
  /** Public https address cloud frames (SwitchBot) download pictures from; empty = externalUrl. */
  cloudUrl: string;
  /** What is actually used: cloudUrl, else externalUrl. */
  cloudUrlEffective: string;
  language: 'es' | 'eu' | 'en' | null;
  defaultFit: FitMode;
  /** Per-Canvas statistics tab on, and battery samples recorded. */
  statsEnabled: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'x-hub-lang': currentLang(), ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    window.dispatchEvent(new Event('hub:unauthorized'));
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? res.statusText, res.status);
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return (await res.blob()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};

export const thumbUrl = (imageId: number) => `/api/images/${imageId}/thumb`;
export const immichThumb = (assetId: string, size: 'thumbnail' | 'preview' = 'thumbnail') =>
  `/api/immich/assets/${assetId}/thumbnail?size=${size}`;
export const renderUrl = (hash: string) => `/api/renders/${hash}`;
