import { sqliteTable, integer, text, real, primaryKey } from 'drizzle-orm/sqlite-core';
import type { Schedule } from '../lib/schedule.js';

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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export type Frame = typeof frames.$inferSelect;
export type Image = typeof images.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
