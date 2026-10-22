import { desc, eq } from 'drizzle-orm';
import { schema, type DB } from '../db/index.js';
import type { Assignment, DisplayOptions, Frame, Image } from '../db/schema.js';
import { DeviceError } from '../device/client.js';
import { driverFor, renderTarget } from '../device/drivers/index.js';
import { HttpError, type Ctx } from './context.js';
import { getImage, renderFor, type Rendered } from './images.js';
import { renderWelcome } from '../imaging/welcome.js';
import { convertRender, formatExt } from '../imaging/pipeline.js';
import { config } from '../config.js';
import { hubLang, tr } from '../i18n.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pickNext } from './selection.js';
import { recordBattery } from './stats.js';
import { withWake } from './wake.js';

export { HUB_GALLERY, infoToFrame } from '../device/drivers/bloomin8.js';

export function getFrame(db: DB, id: number): Frame {
  const f = db.select().from(schema.frames).where(eq(schema.frames.id, id)).get();
  if (!f) throw new HttpError(404, 'canvas_not_found', { id });
  return f;
}

export function getAssignment(db: DB, frameId: number): Assignment | undefined {
  return db.select().from(schema.assignments).where(eq(schema.assignments.frameId, frameId)).get();
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

/** Put a picture on screen now (frame must be awake, or behind a cloud that queues it). */
export async function pushImage(ctx: Ctx, frame: Frame, img: Image, opts: DisplayOptions) {
  const rendered = await renderFor(ctx, img, frame, opts);
  const driver = driverFor(ctx.db, frame);
  await driver.show!(rendered);
  // A cloud only says it took the order; pollStatus confirms once the frame shows it.
  const success = driver.wakeModel === 'cloud' ? null : true;
  ctx.db.insert(schema.history).values({ frameId: frame.id, imageId: img.id, shownAt: Date.now(), method: 'push', success }).run();
  markOnline(ctx.db, frame.id, true, {
    currentImageId: img.id,
    currentRender: rendered.hash,
    welcomeShown: true,
    pendingImageId: null,
    pendingOpts: null,
  });
  ctx.log.info({ frame: frame.id, imageId: img.id }, `image pushed to ${frame.name}`);
}

/** The welcome picture (logo, name, QR to the hub) for this Canvas, cached like any render. */
export async function renderWelcomeFor(db: DB, frame: Frame, hubUrl: string): Promise<Rendered> {
  const landscape = frame.orientation === 'landscape';
  const lang = hubLang(db);
  const params = {
    // v3: side-by-side landscape layout (portrait renders are unchanged, so they keep v2).
    v: landscape ? 3 : 2,
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
  const target = renderTarget(frame);
  const ext = formatExt(target.format);
  // Format only when not the default, so existing JPEG renders keep their hash.
  const rotate = target.rotateBuffer ? frame.rotate : 0;
  const keyed = { ...params, rotate, ...(ext === 'jpg' && !target.format.palette ? {} : { format: target.format }) };
  const hash = crypto.createHash('sha1').update(JSON.stringify(keyed)).digest('hex');
  const file = path.join(config.cacheDir, `${hash}.${ext}`);
  const deviceName = `welcome_${hash.slice(0, 10)}_${landscape ? 'L' : 'P'}.${ext}`;
  let buf: Buffer;
  try {
    buf = await fs.readFile(file);
  } catch {
    buf = await convertRender(await renderWelcome({ ...params, rotate }), target.format);
    await fs.writeFile(file, buf);
  }
  return { hash, file, deviceName, buf, ext };
}

/** Upload + show the welcome picture (frame must be awake). */
export async function pushWelcome(ctx: Ctx, frame: Frame, hubUrl: string) {
  const r = await renderWelcomeFor(ctx.db, frame, hubUrl);
  await driverFor(ctx.db, frame).show!(r);
  markOnline(ctx.db, frame.id, true, { welcomeShown: true, currentImageId: null, currentRender: r.hash });
  ctx.log.info({ frame: frame.id }, `welcome picture shown on ${frame.name}`);
}

/**
 * Put the welcome picture back on screen: now if the frame is reachable (waking it if
 * auto-wake is on), else on its next wake or poll.
 */
export async function requeueWelcome(ctx: Ctx, frame: Frame, hubUrl: string): Promise<{ queued: boolean }> {
  ctx.db.update(schema.frames).set({ welcomeShown: false }).where(eq(schema.frames.id, frame.id)).run();
  const driver = driverFor(ctx.db, frame);
  if (!driver.capabilities.push) {
    driver.nudge?.().catch(() => {});
    return { queued: true };
  }
  try {
    await withWake(ctx, frame, () => pushWelcome(ctx, frame, hubUrl));
    return { queued: false };
  } catch (err) {
    if (!(err instanceof DeviceError && err.offline)) throw err;
    markOnline(ctx.db, frame.id, false);
    return { queued: true };
  }
}

/**
 * Show an image now if the frame is reachable (waking it over Bluetooth if auto-wake is on);
 * otherwise queue it so the next pull (or the scheduler's next push retry) delivers it.
 */
export async function displayImage(ctx: Ctx, frameId: number, imageId: number, opts: DisplayOptions) {
  const frame = getFrame(ctx.db, frameId);
  const img = getImage(ctx.db, imageId);
  const driver = driverFor(ctx.db, frame);
  const queue = async (offline: boolean) => {
    ctx.db
      .update(schema.frames)
      .set({ pendingImageId: img.id, pendingOpts: opts, ...(offline ? { online: false } : {}) })
      .where(eq(schema.frames.id, frame.id))
      .run();
    // Pre-render so the pull response is instant.
    await renderFor(ctx, img, frame, opts).catch(() => {});
    return { method: 'queued' as const };
  };
  // Pull-only frames (DIY): it goes out on the next poll, sooner if the frame can be poked.
  if (!driver.capabilities.push) {
    const result = await queue(false);
    driver.nudge?.().catch((err) => ctx.log.debug({ err, frame: frame.id }, 'notify failed'));
    return result;
  }
  try {
    await withWake(ctx, frame, () => pushImage(ctx, frame, img, opts));
    return { method: 'push' as const };
  } catch (err) {
    if (!(err instanceof DeviceError && err.offline)) throw err;
    return queue(true);
  }
}
