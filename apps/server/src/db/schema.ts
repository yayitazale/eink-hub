import { sqliteTable, integer, text, real, primaryKey, blob } from 'drizzle-orm/sqlite-core';
import type { Schedule } from '../lib/schedule.js';
import type { FrameKind, ImageFormat } from '../device/drivers/types.js';

// Mirrors DEFAULT_SCHEDULE in lib/schedule.ts (inlined to avoid an import cycle).
const defaultSchedule = (): Schedule => ({ kind: 'days', days: 1, at: '07:00' });

export interface DisplayOptions {
  fit?: FitMode;
  bg?: string;
  crop?: { x: number; y: number; w: number; h: number } | null;
  /** Overlay the photo's date as a caption. */
  showDate?: boolean;
  /** "On this day" memories: caption reads "X years ago today" instead of the date. */
  memories?: boolean;
}

/** Per-kind settings that don't deserve a column. */
export interface FrameConfig {
  /** SwitchBot: OpenAPI token + secret and the frame's device id. */
  token?: string;
  secret?: string;
  deviceId?: string;
  /** DIY: the image format the frame asked for in its last poll. */
  format?: ImageFormat;
  /** DIY (always on): where to poke it when there is something new. */
  notifyUrl?: string;
  /** DIY / TRMNL: longest sleep between polls, so manual photos don't wait for the next rotation. */
  maxPollMinutes?: number;
}

/** How the frame around the screen looks in the app's mockups. Empty = defaults. */
export interface FrameAppearance {
  /** Passepartout (white mat) between frame and screen. */
  mat?: boolean;
  color?: FrameColor;
  style?: FrameStyle;
}
export const FRAME_COLORS = ['black', 'white', 'walnut', 'oak', 'natural'] as const;
export const FRAME_STYLES = ['thin', 'thick', 'classic'] as const;
export type FrameColor = (typeof FRAME_COLORS)[number];
export type FrameStyle = (typeof FRAME_STYLES)[number];

/** Secrets never leave the hub. */
export const SECRET_CONFIG_KEYS = ['token', 'secret'] as const;

export const frames = sqliteTable('frames', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  host: text('host').notNull(),
  deviceId: text('device_id'),
  model: text('model'),
  firmware: text('firmware'),
  width: integer('width').notNull().default(1200),
  height: integer('height').notNull().default(1600),
  /** How the frame hangs on the wall. Landscape images are rotated to the native portrait buffer. */
  orientation: text('orientation', { enum: ['portrait', 'landscape'] }).notNull().default('portrait'),
  rotate: integer('rotate').notNull().default(90),
  battery: integer('battery'),
  online: integer('online', { mode: 'boolean' }).notNull().default(false),
  lastSeen: integer('last_seen'),
  lastInfo: text('last_info', { mode: 'json' }).$type<Record<string, unknown>>(),
  mode: text('mode', { enum: ['push', 'pull'] }).notNull().default('push'),
  upstreamToken: text('upstream_token').notNull(),
  /** How often a pull-mode frame wakes when it has no rotation assigned (to pick up queued photos). */
  pullSchedule: text('pull_schedule', { mode: 'json' }).$type<Schedule>().notNull().$defaultFn(defaultSchedule),
  pendingImageId: integer('pending_image_id'),
  pendingOpts: text('pending_opts', { mode: 'json' }).$type<DisplayOptions>(),
  currentImageId: integer('current_image_id'),
  currentRender: text('current_render'),
  /** False until the welcome picture has been delivered (reset by "Limpiar"). */
  welcomeShown: integer('welcome_shown', { mode: 'boolean' }).notNull().default(false),
  nextWake: integer('next_wake'),
  createdAt: integer('created_at').notNull(),
  /** Bluetooth address for waking the frame ("AA:BB:CC:DD:EE:FF"), from deviceInfo.bt_mac. */
  bleMac: text('ble_mac'),
  /** Wake over Bluetooth before sending when the frame is asleep. Off by default: it costs battery. */
  bleAutoWake: integer('ble_auto_wake', { mode: 'boolean' }).notNull().default(false),
  /** Which driver talks to it (see device/drivers). */
  kind: text('kind').$type<FrameKind>().notNull().default('bloomin8'),
  config: text('config', { mode: 'json' }).$type<FrameConfig>().notNull().default({}),
  /** Screen diagonal in inches, set by hand. Null = inferred from model/resolution (device/sizes). */
  diagonal: real('diagonal'),
  appearance: text('appearance', { mode: 'json' }).$type<FrameAppearance>().notNull().default({}),
});

export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source', { enum: ['local', 'immich'] }).notNull(),
  immichAssetId: text('immich_asset_id').unique(),
  filePath: text('file_path'),
  originalName: text('original_name'),
  width: integer('width'),
  height: integer('height'),
  takenAt: integer('taken_at'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const imageCrops = sqliteTable(
  'image_crops',
  {
    imageId: integer('image_id').notNull(),
    aspect: text('aspect').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    w: real('w').notNull(),
    h: real('h').notNull(),
  },
  (t) => [primaryKey({ columns: [t.imageId, t.aspect] })],
);

export const collectionTypes = [
  'manual',
  'immich_album',
  'immich_person',
  'immich_favorites',
  'immich_smart',
  'immich_memories',
] as const;
export type CollectionType = (typeof collectionTypes)[number];

export const collections = sqliteTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', { enum: collectionTypes }).notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  lastSync: integer('last_sync'),
  syncError: text('sync_error'),
  itemCount: integer('item_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const collectionItems = sqliteTable(
  'collection_items',
  {
    collectionId: integer('collection_id').notNull(),
    imageId: integer('image_id').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.imageId] })],
);

export const orderModes = ['random', 'sequential', 'newest'] as const;
export type OrderMode = (typeof orderModes)[number];
export const fitModes = ['cover', 'contain', 'blur'] as const;
export type FitMode = (typeof fitModes)[number];

export const assignments = sqliteTable('assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frameId: integer('frame_id').notNull().unique(),
  collectionId: integer('collection_id').notNull(),
  orderMode: text('order_mode', { enum: orderModes }).notNull().default('random'),
  schedule: text('schedule', { mode: 'json' }).$type<Schedule>().notNull().$defaultFn(defaultSchedule),
  nextChange: integer('next_change'),
  activeFrom: text('active_from'),
  activeTo: text('active_to'),
  fit: text('fit', { enum: fitModes }).notNull().default('cover'),
  bg: text('bg').notNull().default('#ffffff'),
  showDate: integer('show_date', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastChange: integer('last_change'),
});

export const history = sqliteTable('history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  frameId: integer('frame_id').notNull(),
  imageId: integer('image_id').notNull(),
  shownAt: integer('shown_at').notNull(),
  method: text('method', { enum: ['push', 'pull'] }).notNull(),
  pullId: text('pull_id'),
  success: integer('success', { mode: 'boolean' }),
  battery: integer('battery'),
});

export const batterySamples = sqliteTable('battery_samples', {
  frameId: integer('frame_id').notNull(),
  at: integer('at').notNull(),
  level: integer('level').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const roles = ['admin', 'member'] as const;
export type Role = (typeof roles)[number];

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  /** Null: signs in with passkeys only. */
  passwordHash: text('password_hash'),
  role: text('role', { enum: roles }).notNull().default('member'),
  createdAt: integer('created_at').notNull(),
  lastLoginAt: integer('last_login_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

/** One-time sign-up links. With userId, a reset link for an existing account instead. */
export const invites = sqliteTable('invites', {
  tokenHash: text('token_hash').primaryKey(),
  role: text('role', { enum: roles }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const passkeys = sqliteTable('passkeys', {
  /** Credential ID, base64url. */
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
  counter: integer('counter').notNull().default(0),
  transports: text('transports', { mode: 'json' }).$type<string[]>(),
  /** Hostname it was registered on: a passkey only works there. */
  rpId: text('rp_id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
});

export type Frame = typeof frames.$inferSelect;
export type Image = typeof images.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invite = typeof invites.$inferSelect;
