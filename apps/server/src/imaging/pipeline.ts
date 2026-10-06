import sharp from 'sharp';
import type { FitMode } from '../db/schema.js';

export interface CropRect {
  /** Fractions (0..1) of the EXIF-oriented source image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** Native panel size, portrait (e.g. 1200×1600). */
  width: number;
  height: number;
  /** Frame hung landscape: compose at height×width and rotate into the portrait buffer. */
  landscape: boolean;
  rotate: number;
  fit: FitMode;
  bg: string;
  crop?: CropRect | null;
  /** Text drawn in a label at the bottom-left, e.g. the photo's date. */
  caption?: string | null;
  quality?: number;
}

export function targetSize(o: Pick<RenderOptions, 'width' | 'height' | 'landscape'>) {
  const w = Math.min(o.width, o.height);
  const h = Math.max(o.width, o.height);
  return o.landscape ? { w: h, h: w } : { w, h };
}

export function aspectKey(o: Pick<RenderOptions, 'width' | 'height' | 'landscape'>) {
  const { w, h } = targetSize(o);
  return `${w}x${h}`;
}

/**
 * Produce the JPEG the canvas expects: baseline (not progressive), 8-bit sRGB,
 * exactly the panel resolution, stored portrait.
 */
export async function renderForFrame(src: Buffer, o: RenderOptions): Promise<Buffer> {
  const { w: tw, h: th } = targetSize(o);
  const { data: oriented, info } = await sharp(src, { failOn: 'none' })
    .autoOrient()
    .toColourspace('srgb')
    .toBuffer({ resolveWithObject: true });

  let composed: Buffer;
  if (o.crop) {
    const left = clamp(Math.round(o.crop.x * info.width), 0, info.width - 1);
    const top = clamp(Math.round(o.crop.y * info.height), 0, info.height - 1);
    const width = clamp(Math.round(o.crop.w * info.width), 1, info.width - left);
    const height = clamp(Math.round(o.crop.h * info.height), 1, info.height - top);
    composed = await sharp(oriented)
      .extract({ left, top, width, height })
      .resize(tw, th, { fit: 'cover' })
      .toBuffer();
  } else if (o.fit === 'contain') {
    composed = await sharp(oriented).resize(tw, th, { fit: 'contain', background: o.bg }).toBuffer();
  } else if (o.fit === 'blur') {
    const backdrop = await sharp(oriented).resize(tw, th, { fit: 'cover' }).blur(45).modulate({ brightness: 0.92 }).toBuffer();
    const fg = await sharp(oriented).resize(tw, th, { fit: 'inside' }).toBuffer();
    composed = await sharp(backdrop).composite([{ input: fg, gravity: 'center' }]).toBuffer();
  } else {
    composed = await sharp(oriented).resize(tw, th, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  }

  if (o.caption) composed = await addCaption(composed, o.caption, tw, th);

  let out = sharp(composed);
  if (o.landscape) out = out.rotate(o.rotate);
  return out
    .flatten({ background: o.bg })
    .toColourspace('srgb')
    .jpeg({ quality: o.quality ?? 92, progressive: false, mozjpeg: false, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

const escapeMarkup = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Solid white rounded label with dark text, bottom-left. Solid colours dither cleanly on
 * colour e-ink; translucent gradients would turn into noise.
 */
async function addCaption(img: Buffer, caption: string, w: number, h: number): Promise<Buffer> {
  const size = Math.max(14, Math.round(Math.min(w, h) * 0.032));
  const label = await sharp({
    text: { text: `<span foreground="#1d1c1a">${escapeMarkup(caption)}</span>`, font: `Inter,Arial,DejaVu Sans,Sans Semi-Bold ${size}`, dpi: 72, rgba: true },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  const padX = Math.round(size * 0.75);
  const padY = Math.round(size * 0.45);
  const margin = Math.round(Math.min(w, h) * 0.04);
  const pillW = Math.min(w - 2 * margin, label.info.width + 2 * padX);
  const pillH = label.info.height + 2 * padY;
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pillW}" height="${pillH}"><rect width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#ffffff"/></svg>`,
  );
  const top = h - margin - pillH;
  return sharp(img)
    .composite([
      { input: pill, left: margin, top },
      { input: label.data, left: margin + padX, top: top + padY },
    ])
    .toBuffer();
}

/** Small JPEG thumbnail for the web UI. */
export function thumbnail(src: Buffer, size = 480) {
  return sharp(src, { failOn: 'none' }).autoOrient().resize(size, size, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
}

export async function probeImage(src: Buffer) {
  const m = await sharp(src, { failOn: 'none' }).autoOrient().metadata();
  const taken = m.exif ? exifDate(m.exif) : undefined;
  return { width: m.autoOrient?.width ?? m.width, height: m.autoOrient?.height ?? m.height, takenAt: taken };
}

/** Pull DateTimeOriginal out of the raw EXIF block without a full EXIF parser. */
function exifDate(exif: Buffer): number | undefined {
  const m = exif.toString('latin1').match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) ? t : undefined;
}

/** True if the JPEG uses a baseline (SOF0/SOF1) frame rather than progressive (SOF2). */
export function isBaselineJpeg(buf: Buffer): boolean {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) return false;
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1) return true;
    if (marker === 0xc2) return false;
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return false;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
