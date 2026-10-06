import type { Palette } from '../device/drivers/types.js';

type RGB = readonly [number, number, number];

/**
 * Colours each panel can show. Pure primaries: the panels' real inks are duller, but these are
 * what the DIY libraries (GxEPD2, Waveshare, Pimoroni inky) map to their ink indices.
 */
export const PALETTES: Record<Palette, RGB[]> = {
  bw: [
    [0, 0, 0],
    [255, 255, 255],
  ],
  gray4: [
    [0, 0, 0],
    [85, 85, 85],
    [170, 170, 170],
    [255, 255, 255],
  ],
  spectra6: [
    [0, 0, 0],
    [255, 255, 255],
    [255, 255, 0],
    [255, 0, 0],
    [0, 0, 255],
    [0, 255, 0],
  ],
  acep7: [
    [0, 0, 0],
    [255, 255, 255],
    [0, 255, 0],
    [0, 0, 255],
    [255, 0, 0],
    [255, 255, 0],
    [255, 128, 0],
  ],
};

function nearest(palette: RGB[], r: number, g: number, b: number) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    // Weighted towards green, roughly how bright each channel looks.
    const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Floyd–Steinberg error diffusion of an RGB buffer (3 bytes per pixel) to a palette.
 * Returns one palette index per pixel.
 */
export function ditherToPalette(rgb: Uint8Array, width: number, height: number, palette: RGB[]): Uint8Array {
  const err = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) err[i] = rgb[i];
  const out = new Uint8Array(width * height);
  const spread = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
    if (x < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 3;
    err[j] += er * f;
    err[j + 1] += eg * f;
    err[j + 2] += eb * f;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = Math.max(0, Math.min(255, err[i]));
      const g = Math.max(0, Math.min(255, err[i + 1]));
      const b = Math.max(0, Math.min(255, err[i + 2]));
      const idx = nearest(palette, r, g, b);
      out[y * width + x] = idx;
      const [pr, pg, pb] = palette[idx];
      const er = r - pr;
      const eg = g - pg;
      const eb = b - pb;
      spread(x + 1, y, er, eg, eb, 7 / 16);
      spread(x - 1, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return out;
}

/** Palette indices back to RGB, for encoders that want plain pixels. */
export function indicesToRgb(indices: Uint8Array, palette: RGB[]): Buffer {
  const out = Buffer.alloc(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const [r, g, b] = palette[indices[i]];
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/**
 * Uncompressed BMP: 1-bit when every pixel is black or white (what TRMNL firmware and most
 * GxEPD2 examples draw), otherwise 24-bit. Rows bottom-up, padded to 4 bytes.
 */
export function encodeBmp(rgb: Buffer, width: number, height: number, oneBit: boolean): Buffer {
  const bpp = oneBit ? 1 : 24;
  const rowBytes = Math.ceil((width * bpp) / 32) * 4;
  const paletteBytes = oneBit ? 8 : 0;
  const offset = 14 + 40 + paletteBytes;
  const buf = Buffer.alloc(offset + rowBytes * height);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(bpp, 28);
  buf.writeUInt32LE(rowBytes * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  if (oneBit) {
    buf.writeUInt32LE(2, 46);
    // Colour table (B, G, R, 0): index 0 black, 1 white.
    buf.writeUInt32LE(0x00000000, 54);
    buf.writeUInt32LE(0x00ffffff, 58);
  }
  for (let y = 0; y < height; y++) {
    const row = offset + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (oneBit) {
        if (rgb[i] + rgb[i + 1] + rgb[i + 2] > 382) buf[row + (x >> 3)] |= 0x80 >> (x & 7);
      } else {
        buf[row + x * 3] = rgb[i + 2];
        buf[row + x * 3 + 1] = rgb[i + 1];
        buf[row + x * 3 + 2] = rgb[i];
      }
    }
  }
  return buf;
}
