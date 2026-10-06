import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { isBaselineJpeg, renderForFrame, targetSize } from '../src/imaging/pipeline.js';

const landscapePhoto = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a7bd5' } }).jpeg({ progressive: true }).toBuffer();

const base = { width: 1200, height: 1600, rotate: 90, bg: '#ffffff' } as const;

describe('renderForFrame', () => {
  for (const fit of ['cover', 'contain', 'blur'] as const) {
    it(`produces a baseline ${fit} JPEG at native portrait resolution`, async () => {
      const out = await renderForFrame(await landscapePhoto(), { ...base, landscape: false, fit });
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height, meta.channels, meta.isProgressive]).toEqual([1200, 1600, 3, false]);
      expect(isBaselineJpeg(out)).toBe(true);
    });
  }

  it('composes landscape frames sideways then rotates into the portrait buffer', async () => {
    expect(targetSize({ width: 1200, height: 1600, landscape: true })).toEqual({ w: 1600, h: 1200 });
    const out = await renderForFrame(await landscapePhoto(), { ...base, landscape: true, fit: 'cover' });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);
  });

  it('applies a manual crop', async () => {
    const out = await renderForFrame(await landscapePhoto(), {
      ...base,
      landscape: false,
      fit: 'cover',
      crop: { x: 0.3, y: 0, w: 0.5, h: 1 },
    });
    expect((await sharp(out).metadata()).width).toBe(1200);
  });

  it('draws a date caption as a white label in the bottom-left corner', async () => {
    const out = await renderForFrame(await landscapePhoto(), { ...base, landscape: false, fit: 'cover', caption: '6 de octubre de 2019' });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    // Inside the label (near its left edge, vertically centred) is white; the opposite corner is the photo.
    const labelY = info.height - Math.round(1200 * 0.04) - 20;
    expect(px(Math.round(1200 * 0.04) + 12, labelY).every((c) => c > 240)).toBe(true);
    expect(px(info.width - 20, labelY).every((c) => c > 240)).toBe(false);
  });

  it('detects progressive JPEGs', async () => {
    expect(isBaselineJpeg(await landscapePhoto())).toBe(false);
  });
});
