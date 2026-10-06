import sharp from 'sharp';
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
  const layers: { buf: Buffer; width: number; height: number }[] = [];
  const add = (buf: Buffer, width: number, height: number) => layers.push({ buf, width, height });

  const logoSize = Math.round(unit * 0.16);
  add(await sharp(Buffer.from(LOGO), { density: 600 }).resize(logoSize, logoSize).png().toBuffer(), logoSize, logoSize);

  const title = await text(
    `<span foreground="${INK}" letter_spacing="${Math.round(unit * 0.004) * 1024}">E-INK HUB</span>`,
    `Inter,Arial,DejaVu Sans,Sans Bold ${Math.round(unit * 0.05)}`,
    w,
  );
  add(title.data, title.info.width, title.info.height);

  const name = await text(`<span foreground="${MUTED}">${esc(o.name)}</span>`, `Inter,Arial,DejaVu Sans,Sans Medium ${Math.round(unit * 0.032)}`, Math.round(w * 0.85));
  add(name.data, name.info.width, name.info.height);

  const gaps = [Math.round(unit * 0.05), Math.round(unit * 0.015), Math.round(unit * 0.08)];

  if (o.url) {
    const qrSize = Math.round(unit * (o.landscape ? 0.38 : 0.42));
    const qr = await QRCode.toBuffer(o.url, { type: 'png', width: qrSize, margin: 1, errorCorrectionLevel: 'M', color: { dark: INK, light: '#ffffff' } });
    const qrMeta = await sharp(qr).metadata();
    add(qr, qrMeta.width!, qrMeta.height!);
    const hint = await text(
      `<span foreground="${INK}">${esc(o.scanText)}</span>\n<span foreground="${MUTED}" size="80%">${esc(o.url)}</span>`,
      `Inter,Arial,DejaVu Sans,Sans Medium ${Math.round(unit * 0.03)}`,
      Math.round(w * 0.85),
    );
    add(hint.data, hint.info.width, hint.info.height);
    gaps.push(Math.round(unit * 0.035));
  } else {
    const hint = await text(
      `<span foreground="${MUTED}">${esc(o.configureText)}</span>`,
      `Inter,Arial,DejaVu Sans,Sans Medium ${Math.round(unit * 0.03)}`,
      Math.round(w * 0.8),
    );
    add(hint.data, hint.info.width, hint.info.height);
  }

  // Stack everything, centred.
  const total = layers.reduce((s, l) => s + l.height, 0) + gaps.reduce((s, g) => s + g, 0);
  let top = Math.max(0, Math.round((h - total) / 2));
  const composites = layers.map((l, i) => {
    const c = { input: l.buf, left: Math.max(0, Math.round((w - l.width) / 2)), top };
    top += l.height + (gaps[i] ?? 0);
    return c;
  });

  let img = sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).composite(composites);
  if (o.landscape) img = sharp(await img.png().toBuffer()).rotate(o.rotate);
  return img.flatten({ background: '#ffffff' }).jpeg({ quality: 92, progressive: false, mozjpeg: false, chromaSubsampling: '4:4:4' }).toBuffer();
}
