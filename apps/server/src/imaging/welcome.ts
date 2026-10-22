import sharp, { type OverlayOptions } from 'sharp';
import QRCode from 'qrcode';
import { targetSize } from './pipeline.js';

// Same mark as apps/web/public/favicon.svg.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="4" width="48" height="56" rx="6" fill="#1d1c1a"/><rect x="14" y="10" width="36" height="44" rx="2" fill="#f4f1eb"/><circle cx="32" cy="28" r="7" fill="#e2725b"/><path d="M18 50l10-10 6 6 6-8 6 12z" fill="#7a9e7e"/></svg>`;

const INK = '#1d1c1a';
const MUTED = '#6f6a62';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function text(markup: string, font: string, maxWidth: number) {
  return sharp({ text: { text: markup, font, dpi: 72, rgba: true, width: maxWidth, align: 'centre', wrap: 'word-char' } })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export interface WelcomeOptions {
  width: number;
  height: number;
  landscape: boolean;
  rotate: number;
  /** Canvas name shown under the title. */
  name: string;
  /** Hub URL encoded in the QR code; without it, a hint to configure it is shown instead. */
  url: string;
  /** Localized texts. */
  scanText: string;
  configureText: string;
}

/**
 * Default "home" picture for a Canvas: white, logo, name and a QR code to the hub.
 * Pure black/white/solid colours so it stays crisp on colour e-ink.
 */
export async function renderWelcome(o: WelcomeOptions): Promise<Buffer> {
  const { w, h } = targetSize(o);
  const unit = Math.min(w, h);
  // Landscape: brand on the left, QR on the right, as one block centred on the page so both side
  // margins match; each column centred vertically.
  const sideBySide = o.landscape && !!o.url;
  const colW = sideBySide ? Math.round(w * 0.42) : w;
  const brand = await brandStack(o, unit, colW);
  const code = await qrStack(o, unit, colW);

  let composites: OverlayOptions[];
  if (sideBySide) {
    const bw = stackWidth(brand);
    const cw = stackWidth(code);
    const gap = Math.round(unit * 0.12);
    const left = Math.round((w - bw - gap - cw) / 2);
    composites = [...place(brand, left, bw, h), ...place(code, left + bw + gap, cw, h)];
  } else {
    const all = { layers: [...brand.layers, ...code.layers], gaps: [...brand.gaps, Math.round(unit * 0.08), ...code.gaps] };
    composites = place(all, 0, w, h);
  }

  let img = sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).composite(composites);
  if (o.landscape) img = sharp(await img.png().toBuffer()).rotate(o.rotate);
  return img.flatten({ background: '#ffffff' }).jpeg({ quality: 92, progressive: false, mozjpeg: false, chromaSubsampling: '4:4:4' }).toBuffer();
}

interface Layer {
  buf: Buffer;
  width: number;
  height: number;
}
/** Layers stacked top to bottom; gaps[i] goes after layers[i]. */
interface Stack {
  layers: Layer[];
  gaps: number[];
}

/** Logo, "E-INK HUB" and the Canvas name. */
async function brandStack(o: WelcomeOptions, unit: number, colW: number): Promise<Stack> {
  // Same sizes in both orientations (relative to the short side); only the arrangement changes.
  const logoSize = Math.round(unit * 0.22);
  const logo = await sharp(Buffer.from(LOGO), { density: 600 }).resize(logoSize, logoSize).png().toBuffer();
  const title = await text(
    `<span foreground="${INK}" letter_spacing="${Math.round(unit * 0.004) * 1024}">E-INK HUB</span>`,
    `Inter,Arial,DejaVu Sans,Sans Bold ${Math.round(unit * 0.055)}`,
    colW,
  );
  const name = await text(
    `<span foreground="${MUTED}">${esc(o.name)}</span>`,
    `Inter,Arial,DejaVu Sans,Sans Medium ${Math.round(unit * 0.034)}`,
    Math.round(colW * 0.85),
  );
  return {
    layers: [
      { buf: logo, width: logoSize, height: logoSize },
      { buf: title.data, width: title.info.width, height: title.info.height },
      { buf: name.data, width: name.info.width, height: name.info.height },
    ],
    gaps: [Math.round(unit * 0.05), Math.round(unit * 0.015)],
  };
}

/** QR code to the hub with its hint, or the "configure the URL" hint without one. */
async function qrStack(o: WelcomeOptions, unit: number, colW: number): Promise<Stack> {
  const hintFont = `Inter,Arial,DejaVu Sans,Sans Medium ${Math.round(unit * 0.03)}`;
  if (!o.url) {
    const hint = await text(`<span foreground="${MUTED}">${esc(o.configureText)}</span>`, hintFont, Math.round(colW * 0.8));
    return { layers: [{ buf: hint.data, width: hint.info.width, height: hint.info.height }], gaps: [] };
  }
  const qrSize = Math.round(unit * 0.36);
  const qr = await QRCode.toBuffer(o.url, { type: 'png', width: qrSize, margin: 1, errorCorrectionLevel: 'M', color: { dark: INK, light: '#ffffff' } });
  const qrMeta = await sharp(qr).metadata();
  const hint = await text(
    `<span foreground="${INK}">${esc(o.scanText)}</span>
<span foreground="${MUTED}" size="80%">${esc(o.url)}</span>`,
    hintFont,
    Math.round(colW * 0.85),
  );
  return {
    layers: [
      { buf: qr, width: qrMeta.width!, height: qrMeta.height! },
      { buf: hint.data, width: hint.info.width, height: hint.info.height },
    ],
    gaps: [Math.round(unit * 0.035)],
  };
}

const stackWidth = (s: Stack) => Math.max(...s.layers.map((l) => l.width));

/** A stack centred in a column [left, left + width) of a canvas `h` tall. */
function place(s: Stack, left: number, width: number, h: number): OverlayOptions[] {
  const total = s.layers.reduce((sum, l) => sum + l.height, 0) + s.gaps.slice(0, s.layers.length - 1).reduce((sum, g) => sum + g, 0);
  let top = Math.max(0, Math.round((h - total) / 2));
  return s.layers.map((l, i) => {
    const c = { input: l.buf, left: left + Math.max(0, Math.round((width - l.width) / 2)), top };
    top += l.height + (s.gaps[i] ?? 0);
    return c;
  });
}
