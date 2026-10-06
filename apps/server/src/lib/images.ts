import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { and, eq, inArray } from 'drizzle-orm';
import { config } from '../config.js';
import { basqueDate, hubLang, locales, tr, type Lang } from '../i18n.js';
import { schema, type DB } from '../db/index.js';
import type { DisplayOptions, Frame, Image } from '../db/schema.js';
import { assetSize, type ImmichAsset } from '../immich/client.js';
import { aspectKey, probeImage, renderForFrame, thumbnail, type CropRect } from '../imaging/pipeline.js';
import { HttpError, immichFor, type Ctx } from './context.js';

const RENDER_VERSION = 1;

async function exists(p: string) {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

export function getImage(db: DB, id: number): Image {
  const img = db.select().from(schema.images).where(eq(schema.images.id, id)).get();
  if (!img) throw new HttpError(404, 'image_not_found', { id });
  return img;
}

export async function saveLocalUpload(db: DB, buf: Buffer, originalName: string): Promise<Image> {
  let meta;
  try {
    meta = await probeImage(buf);
  } catch {
    throw new HttpError(415, 'unsupported_image', { name: originalName });
  }
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const rel = path.join('local', `${hash}${ext}`);
  const abs = path.join(config.originalsDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  if (!(await exists(abs))) await fs.writeFile(abs, buf);
  return db
    .insert(schema.images)
    .values({
      source: 'local',
      filePath: rel,
      originalName,
      width: meta.width,
      height: meta.height,
      takenAt: meta.takenAt ?? Date.now(),
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

/** Upsert Immich assets as image rows; returns ids in input order. */
export function upsertImmichAssets(db: DB, assets: ImmichAsset[]): number[] {
  const photos = assets.filter((a) => a.type === 'IMAGE');
  if (!photos.length) return [];
  return db.transaction((tx) => {
    for (const a of photos) {
      const size = assetSize(a);
      const taken = Date.parse(a.localDateTime ?? a.fileCreatedAt ?? '');
      // Only overwrite what this payload actually knows: imports by bare id must not wipe metadata.
      const values = {
        ...(a.originalFileName ? { originalName: a.originalFileName } : {}),
        ...(size ? { width: size.width, height: size.height } : {}),
        ...(Number.isFinite(taken) ? { takenAt: taken } : {}),
        ...(a.isFavorite !== undefined ? { favorite: a.isFavorite } : {}),
      };
      const insert = tx.insert(schema.images).values({ source: 'immich', immichAssetId: a.id, createdAt: Date.now(), ...values });
      if (Object.keys(values).length) insert.onConflictDoUpdate({ target: schema.images.immichAssetId, set: values }).run();
      else insert.onConflictDoNothing().run();
    }
    const rows = tx
      .select({ id: schema.images.id, assetId: schema.images.immichAssetId })
      .from(schema.images)
      .where(inArray(schema.images.immichAssetId, photos.map((a) => a.id)))
      .all();
    const byAsset = new Map(rows.map((r) => [r.assetId, r.id]));
    return photos.map((a) => byAsset.get(a.id)!);
  });
}

async function decodable(buf: Buffer) {
  try {
    await sharp(buf, { failOn: 'none' }).resize(8, 8).toBuffer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Full-resolution source bytes. Immich originals are cached on disk; formats sharp can't
 * decode (some HEIC/RAW) fall back to Immich's full-size then preview JPEG.
 */
export async function loadSource(ctx: Ctx, img: Image): Promise<Buffer> {
  if (img.source === 'local') {
    if (!img.filePath) throw new HttpError(404, 'original_missing');
    return fs.readFile(path.join(config.originalsDir, img.filePath));
  }
  const cached = path.join(config.originalsDir, 'immich', img.immichAssetId!);
  if (await exists(cached)) return fs.readFile(cached);

  const immich = immichFor(ctx.db);
  const attempts = [
    () => immich.original(img.immichAssetId!),
    () => immich.thumbnail(img.immichAssetId!, 'fullsize'),
    () => immich.thumbnail(img.immichAssetId!, 'preview'),
  ];
  for (const attempt of attempts) {
    try {
      const buf = Buffer.from(await (await attempt()).arrayBuffer());
      if (await decodable(buf)) {
        await fs.writeFile(cached, buf);
        return buf;
      }
    } catch (err) {
      ctx.log.debug({ err, asset: img.immichAssetId }, 'immich source attempt failed');
    }
  }
  throw new HttpError(502, 'immich_fetch_failed', { id: img.immichAssetId! });
}

export async function imageThumbnail(ctx: Ctx, img: Image): Promise<Buffer> {
  const file = path.join(config.cacheDir, `thumb_${img.id}.jpg`);
  if (await exists(file)) return fs.readFile(file);
  let buf: Buffer;
  if (img.source === 'immich') {
    const res = await immichFor(ctx.db).thumbnail(img.immichAssetId!, 'preview');
    buf = await thumbnail(Buffer.from(await res.arrayBuffer()));
  } else {
    buf = await thumbnail(await loadSource(ctx, img));
  }
  await fs.writeFile(file, buf);
  return buf;
}

export function frameAspect(frame: Frame) {
  return aspectKey({ width: frame.width, height: frame.height, landscape: frame.orientation === 'landscape' });
}

export function getCrop(db: DB, imageId: number, aspect: string): CropRect | null {
  const row = db
    .select()
    .from(schema.imageCrops)
    .where(and(eq(schema.imageCrops.imageId, imageId), eq(schema.imageCrops.aspect, aspect)))
    .get();
  return row ? { x: row.x, y: row.y, w: row.w, h: row.h } : null;
}

export function setCrop(db: DB, imageId: number, aspect: string, crop: CropRect | null) {
  db.delete(schema.imageCrops)
    .where(and(eq(schema.imageCrops.imageId, imageId), eq(schema.imageCrops.aspect, aspect)))
    .run();
  if (crop) db.insert(schema.imageCrops).values({ imageId, aspect, ...crop }).run();
}

/** Date the photo was taken, e.g. "6 de octubre de 2019". Stored as wall-clock time in UTC. */
export function photoDate(img: Pick<Image, 'takenAt'>, lang: Lang = 'en'): string | null {
  if (!img.takenAt) return null;
  if (lang === 'eu') return basqueDate(new Date(img.takenAt));
  return new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(img.takenAt);
}

/** "Un día como hoy hace 7 años" — the Google Photos-style caption for "On this day" memories. */
export function yearsAgoCaption(img: Pick<Image, 'takenAt'>, lang: Lang = 'en', now = new Date()): string | null {
  if (!img.takenAt) return null;
  const years = now.getFullYear() - new Date(img.takenAt).getUTCFullYear();
  if (years < 1) return photoDate(img, lang);
  return tr(lang, years === 1 ? 'memory_year_ago' : 'memory_years_ago', { n: years });
}

export interface Rendered {
  hash: string;
  /** Path inside cacheDir. */
  file: string;
  /** Filename sent to / pulled by the device (`_P` / `_L` suffix required). */
  deviceName: string;
  buf: Buffer;
}

export async function renderFor(ctx: Ctx, img: Image, frame: Frame, opts: DisplayOptions = {}): Promise<Rendered> {
  const landscape = frame.orientation === 'landscape';
  const crop = opts.crop !== undefined ? opts.crop : getCrop(ctx.db, img.id, frameAspect(frame));
  const params = {
    v: RENDER_VERSION,
    img: img.id,
    width: frame.width,
    height: frame.height,
    landscape,
    rotate: frame.rotate,
    fit: crop ? 'cover' : (opts.fit ?? 'cover'),
    bg: opts.bg ?? '#ffffff',
    crop,
    caption: opts.showDate ? (opts.memories ? yearsAgoCaption : photoDate)(img, hubLang(ctx.db)) : null,
  } as const;
  const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex');
  const file = path.join(config.cacheDir, `${hash}.jpg`);
  const deviceName = `h${img.id}_${hash.slice(0, 10)}_${landscape ? 'L' : 'P'}.jpg`;
  if (await exists(file)) return { hash, file, deviceName, buf: await fs.readFile(file) };

  const buf = await renderForFrame(await loadSource(ctx, img), {
    width: params.width,
    height: params.height,
    landscape,
    rotate: params.rotate,
    fit: params.fit,
    bg: params.bg,
    crop: params.crop,
    caption: params.caption,
  });
  await fs.writeFile(file, buf);
  return { hash, file, deviceName, buf };
}

export async function deleteImage(db: DB, img: Image) {
  db.transaction((tx) => {
    tx.delete(schema.collectionItems).where(eq(schema.collectionItems.imageId, img.id)).run();
    tx.delete(schema.imageCrops).where(eq(schema.imageCrops.imageId, img.id)).run();
    tx.delete(schema.images).where(eq(schema.images.id, img.id)).run();
  });
  if (img.source === 'local' && img.filePath) {
    const stillUsed = db.select().from(schema.images).where(eq(schema.images.filePath, img.filePath)).get();
    if (!stillUsed) await fs.rm(path.join(config.originalsDir, img.filePath), { force: true });
  }
  await fs.rm(path.join(config.cacheDir, `thumb_${img.id}.jpg`), { force: true });
}
