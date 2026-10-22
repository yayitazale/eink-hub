/**
 * Open Frame protocol v1: the hub side of a DIY frame (ESP32, Raspberry Pi…).
 * The frame wakes, calls GET /of/v1/display with its token, downloads `image_url` if there is
 * one, draws it and sleeps `next_poll_s` seconds. Spec: docs-site/diy/protocol.md.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import type { Frame, FrameConfig } from '../db/schema.js';
import { palettes, type ImageFormat, type Palette } from '../device/drivers/index.js';
import { qrUrl, type Ctx } from '../lib/context.js';
import { pollSeconds, servePull } from '../lib/pull.js';
import { imageUrl } from './routes.js';

export const OPEN_FRAME_VERSION = 1;

type DisplayQuery = {
  battery?: string;
  rssi?: string;
  /** Wi-Fi network name and the frame's address on it. */
  ssid?: string;
  ip?: string;
  /** Local storage, in bytes. */
  storage_free?: string;
  storage_total?: string;
  fw?: string;
  w?: string;
  h?: string;
  format?: string;
  palette?: string;
  notify_url?: string;
  /** Hash of what the frame shows now, so a reboot doesn't redraw the same picture. */
  current?: string;
};

function bearer(req: FastifyRequest) {
  const m = String(req.headers.authorization ?? '').match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? '';
}

export function frameByToken(ctx: Ctx, token: string, kind: Frame['kind']) {
  if (!token) return undefined;
  return ctx.db
    .select()
    .from(schema.frames)
    .where(and(eq(schema.frames.upstreamToken, token), eq(schema.frames.kind, kind)))
    .get();
}

/** What the frame says about itself, as a patch for its row. */
function selfDescription(frame: Frame, q: DisplayQuery): Partial<Frame> {
  const patch: Partial<Frame> = {};
  const config: FrameConfig = { ...frame.config };
  const w = Number(q.w);
  const h = Number(q.h);
  if (w > 0 && h > 0 && w <= 4096 && h <= 4096) {
    Object.assign(patch, { width: Math.min(w, h), height: Math.max(w, h) });
    // First contact decides how it hangs; afterwards that's the user's call.
    if (!frame.lastSeen) patch.orientation = w > h ? 'landscape' : 'portrait';
  }
  if (q.format && ['jpeg', 'png', 'bmp'].includes(q.format)) {
    const format: ImageFormat = { type: q.format as ImageFormat['type'] };
    if (q.palette && palettes.includes(q.palette as Palette)) format.palette = q.palette as Palette;
    config.format = format;
  }
  if (q.notify_url !== undefined) config.notifyUrl = /^https?:\/\//.test(q.notify_url) ? q.notify_url : undefined;
  if (JSON.stringify(config) !== JSON.stringify(frame.config)) patch.config = config;
  if (q.fw) patch.firmware = q.fw.slice(0, 40);
  // Same keys a BLOOMIN8 reports, so the Canvas page reads them the same way for every frame.
  const bytes = (v?: string) => (v !== undefined && Number(v) >= 0 && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const info: Record<string, unknown> = { ...(frame.lastInfo ?? {}), rssi: q.rssi !== undefined ? Number(q.rssi) : undefined, w, h };
  if (q.ssid !== undefined) info.sta_ssid = q.ssid.slice(0, 64) || undefined;
  if (q.ip !== undefined) info.sta_ip = /^[0-9a-fA-F:.]{2,45}$/.test(q.ip) ? q.ip : undefined;
  if (q.storage_free !== undefined) info.free_size = bytes(q.storage_free);
  if (q.storage_total !== undefined) info.total_size = bytes(q.storage_total);
  patch.lastInfo = info;
  return patch;
}

export function openFrameRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Querystring: DisplayQuery }>('/of/v1/display', async (req, reply) => {
    const frame = frameByToken(ctx, bearer(req), 'openframe');
    if (!frame) return reply.code(401).send({ error: 'unknown token' });
    const now = new Date();
    const battery = req.query.battery !== undefined ? Number(req.query.battery) : null;
    const seen = selfDescription(frame, req.query);
    const updated = { ...frame, ...seen };
    const { rendered, next } = await servePull(ctx, updated, { qrUrl: qrUrl(ctx.db, req), battery, seen, now });
    const next_poll_s = pollSeconds(ctx, updated, next, now);
    // A picture already on screen is not sent again (e.g. the welcome after a reboot).
    if (!rendered || rendered.hash === req.query.current) return { action: 'none', next_poll_s };
    const fmt = updated.config?.format ?? { type: 'jpeg' };
    return {
      action: 'show',
      image_url: imageUrl(ctx, req, updated, rendered),
      id: rendered.hash,
      format: fmt.type,
      palette: fmt.palette ?? null,
      width: updated.orientation === 'landscape' ? updated.height : updated.width,
      height: updated.orientation === 'landscape' ? updated.width : updated.height,
      next_poll_s,
    };
  });

  // Optional: anything the frame wants in the hub's log (errors, low battery…).
  app.post<{ Body: { level?: string; message?: string } }>('/of/v1/log', async (req, reply) => {
    const frame = frameByToken(ctx, bearer(req), 'openframe');
    if (!frame) return reply.code(401).send({ error: 'unknown token' });
    const level = req.body?.level === 'error' ? 'error' : req.body?.level === 'warn' ? 'warn' : 'info';
    req.log[level]({ frame: frame.id }, `${frame.name}: ${String(req.body?.message ?? '').slice(0, 500)}`);
    return { ok: true };
  });
}
