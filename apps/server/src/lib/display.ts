import { desc, eq } from 'drizzle-orm';
import { schema, type DB } from '../db/index.js';
import type { Assignment, DisplayOptions, Frame, Image } from '../db/schema.js';
import { normalizeMac } from '../device/ble.js';
import { DeviceError, FrameClient, type DeviceInfo } from '../device/client.js';
import { HttpError, type Ctx } from './context.js';
import { getImage, renderFor, type Rendered } from './images.js';
import { renderWelcome } from '../imaging/welcome.js';
import { config } from '../config.js';
import { hubLang, tr } from '../i18n.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pickNext } from './selection.js';
import { recordBattery } from './stats.js';
import { withWake } from './wake.js';

export const HUB_GALLERY = 'hub';
const HUB_GALLERY_KEEP = 20;

export function getFrame(db: DB, id: number): Frame {
  const f = db.select().from(schema.frames).where(eq(schema.frames.id, id)).get();
  if (!f) throw new HttpError(404, 'canvas_not_found', { id });
  return f;
}

export function getAssignment(db: DB, frameId: number): Assignment | undefined {
  return db.select().from(schema.assignments).where(eq(schema.assignments.frameId, frameId)).get();
}

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

export function markOnline(db: DB, frameId: number, online: boolean, extra: Partial<Frame> = {}) {
  if (typeof extra.battery === 'number') recordBattery(db, frameId, extra.battery);
  db.update(schema.frames)
    .set({ online, ...(online ? { lastSeen: Date.now() } : {}), ...extra })
    .where(eq(schema.frames.id, frameId))
    .run();
}

export function assignmentOptions(db: DB, a?: Assignment): DisplayOptions {
  if (!a) return {};
  const c = db.select({ type: schema.collections.type }).from(schema.collections).where(eq(schema.collections.id, a.collectionId)).get();
  return { fit: a.fit, bg: a.bg, showDate: a.showDate, ...(c?.type === 'immich_memories' ? { memories: true } : {}) };
}

/** Pick the next image of the frame's assigned collection, avoiding recent repeats. */
export function chooseNextImage(db: DB, frame: Frame, a: Assignment): number | null {
  const cands = db
    .select({ id: schema.images.id, position: schema.collectionItems.position, takenAt: schema.images.takenAt })
    .from(schema.collectionItems)
    .innerJoin(schema.images, eq(schema.images.id, schema.collectionItems.imageId))
    .where(eq(schema.collectionItems.collectionId, a.collectionId))
    .all();
  const recent = db
    .select({ imageId: schema.history.imageId })
    .from(schema.history)
    .where(eq(schema.history.frameId, frame.id))
    .orderBy(desc(schema.history.shownAt))
    .limit(500)
    .all()
    .map((r) => r.imageId);
  return pickNext(cands, recent, a.orderMode);
}

async function pruneHubGallery(client: FrameClient) {
  const g = await client.gallery(HUB_GALLERY, 0, 200);
  const old = [...(g?.data ?? [])].sort((a, b) => b.time - a.time).slice(HUB_GALLERY_KEEP);
  for (const item of old) await client.deleteImage(item.name, HUB_GALLERY);
}

/** Upload + show immediately (frame must be awake). */
export async function pushImage(ctx: Ctx, frame: Frame, img: Image, opts: DisplayOptions) {
  const rendered = await renderFor(ctx, img, frame, opts);
  const client = new FrameClient(frame.host);
  await client.upload(rendered.buf, rendered.deviceName, { gallery: HUB_GALLERY, showNow: true });
  ctx.db.insert(schema.history).values({ frameId: frame.id, imageId: img.id, shownAt: Date.now(), method: 'push', success: true }).run();
  markOnline(ctx.db, frame.id, true, {
    currentImageId: img.id,
    currentRender: rendered.hash,
    welcomeShown: true,
    pendingImageId: null,
    pendingOpts: null,
  });
  ctx.log.info({ frame: frame.id, imageId: img.id }, `image pushed to ${frame.name}`);
  pruneHubGallery(client).catch((err) => ctx.log.debug({ err }, 'hub gallery prune failed'));
}

/** The welcome picture (logo, name, QR to the hub) for this Canvas, cached like any render. */
export async function renderWelcomeFor(db: DB, frame: Frame, hubUrl: string): Promise<Rendered> {
  const landscape = frame.orientation === 'landscape';
  const lang = hubLang(db);
  const params = {
    v: 2,
    welcome: true,
    width: frame.width,
    height: frame.height,
    landscape,
    rotate: frame.rotate,
    name: frame.name,
    url: hubUrl,
    scanText: tr(lang, 'welcome_scan'),
    configureText: tr(lang, 'welcome_configure'),
  };
  const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex');
  const file = path.join(config.cacheDir, `${hash}.jpg`);
  const deviceName = `welcome_${hash.slice(0, 10)}_${landscape ? 'L' : 'P'}.jpg`;
  let buf: Buffer;
  try {
    buf = await fs.readFile(file);
  } catch {
    buf = await renderWelcome(params);
    await fs.writeFile(file, buf);
  }
  return { hash, file, deviceName, buf };
}

/** Upload + show the welcome picture (frame must be awake). */
export async function pushWelcome(ctx: Ctx, frame: Frame, hubUrl: string) {
  const r = await renderWelcomeFor(ctx.db, frame, hubUrl);
  await new FrameClient(frame.host).upload(r.buf, r.deviceName, { gallery: HUB_GALLERY, showNow: true });
  markOnline(ctx.db, frame.id, true, { welcomeShown: true, currentImageId: null, currentRender: r.hash });
  ctx.log.info({ frame: frame.id }, `welcome picture shown on ${frame.name}`);
}

/**
 * Show an image now if the frame is reachable (waking it over Bluetooth if auto-wake is on);
 * otherwise queue it so the next pull (or the scheduler's next push retry) delivers it.
 */
export async function displayImage(ctx: Ctx, frameId: number, imageId: number, opts: DisplayOptions) {
  const frame = getFrame(ctx.db, frameId);
  const img = getImage(ctx.db, imageId);
  try {
    await withWake(ctx, frame, () => pushImage(ctx, frame, img, opts));
    return { method: 'push' as const };
  } catch (err) {
    if (!(err instanceof DeviceError && err.offline)) throw err;
    ctx.db
      .update(schema.frames)
      .set({ pendingImageId: img.id, pendingOpts: opts, online: false })
      .where(eq(schema.frames.id, frame.id))
      .run();
    // Pre-render so the pull response is instant.
    await renderFor(ctx, img, frame, opts).catch(() => {});
    return { method: 'queued' as const };
  }
}
