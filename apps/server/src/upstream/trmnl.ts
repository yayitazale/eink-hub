/**
 * TRMNL "Bring Your Own Server" API, so anything running TRMNL firmware (TRMNL, Waveshare
 * PhotoPainter, Seeed reTerminal E100x…) can use the hub as its server without new firmware.
 * https://docs.trmnl.com/go/diy/byos
 *
 * The device is added in the hub first (by MAC); /api/setup then hands it its token. Unknown
 * devices get nothing, so a stray TRMNL on the network can't register itself.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import type { Frame } from '../db/schema.js';
import { formatExt } from '../imaging/pipeline.js';
import { renderTarget } from '../device/drivers/index.js';
import { qrUrl, type Ctx } from '../lib/context.js';
import { pollSeconds, servePull } from '../lib/pull.js';
import { frameByToken } from './openframe.js';
import { imageUrl } from './routes.js';

/** Paths TRMNL firmware calls; they skip the session check (auth/index.ts) and use their own token. */
export const TRMNL_PATHS = /^\/api\/(display|setup|log)(\?|$)/;

const header = (req: FastifyRequest, name: string) => String(req.headers[name.toLowerCase()] ?? '');

/** LiPo voltage → rough percentage (3.0 V empty, 4.2 V full). Some firmwares already send a percentage. */
export function batteryPercent(v: string): number | null {
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return null;
  if (n > 5) return Math.max(0, Math.min(100, Math.round(n)));
  return Math.max(0, Math.min(100, Math.round(((n - 3.0) / 1.2) * 100)));
}

function byMac(ctx: Ctx, mac: string) {
  if (!mac) return undefined;
  return ctx.db
    .select()
    .from(schema.frames)
    .where(and(eq(schema.frames.kind, 'trmnl'), eq(schema.frames.deviceId, mac.trim().toUpperCase())))
    .get();
}

export function trmnlRoutes(app: FastifyInstance, ctx: Ctx) {
  const setup = async (req: FastifyRequest) => {
    const frame = byMac(ctx, header(req, 'ID'));
    if (!frame) {
      req.log.warn({ id: header(req, 'ID') }, 'TRMNL setup from a device not added in the hub');
      return { status: 404, api_key: null, friendly_id: null, image_url: null, message: 'Add this device (by MAC address) in the hub first' };
    }
    req.log.info({ frame: frame.id }, `TRMNL ${frame.name} set up`);
    return { status: 200, api_key: frame.upstreamToken, friendly_id: String(frame.id), image_url: null, message: `Linked to ${frame.name}` };
  };
  app.get('/api/setup', setup);
  app.post('/api/setup', setup);

  app.get('/api/display', async (req) => {
    const frame = frameByToken(ctx, header(req, 'Access-Token'), 'trmnl');
    if (!frame) return { status: 202, image_url: null, filename: null, refresh_rate: 300, reset_firmware: false, update_firmware: false, firmware_url: null };
    const now = new Date();
    const w = Number(header(req, 'Width'));
    const h = Number(header(req, 'Height'));
    const seen: Partial<Frame> = {
      ...(header(req, 'FW-Version') ? { firmware: header(req, 'FW-Version').slice(0, 40) } : {}),
      ...(w > 0 && h > 0 ? { width: Math.min(w, h), height: Math.max(w, h) } : {}),
      ...(w > 0 && h > 0 && !frame.lastSeen ? { orientation: w > h ? ('landscape' as const) : ('portrait' as const) } : {}),
      ...(header(req, 'Model') ? { model: `TRMNL ${header(req, 'Model')}` } : {}),
      lastInfo: { rssi: Number(header(req, 'RSSI')) || null, voltage: Number(header(req, 'Battery-Voltage')) || null },
    };
    const updated = { ...frame, ...seen };
    const { rendered, next } = await servePull(ctx, updated, { qrUrl: qrUrl(ctx.db, req), battery: batteryPercent(header(req, 'Battery-Voltage')), seen, now });
    const refresh_rate = pollSeconds(ctx, updated, next, now);
    const base = { status: 0, refresh_rate, reset_firmware: false, update_firmware: false, firmware_url: null, special_function: 'identify' };
    if (rendered) return { ...base, image_url: imageUrl(ctx, req, updated, rendered), filename: rendered.hash };
    // Nothing new: same filename as what is on screen, so the firmware doesn't redraw.
    if (!updated.currentRender) return { ...base, image_url: null, filename: null };
    const ext = formatExt(renderTarget(updated).format);
    return { ...base, image_url: imageUrl(ctx, req, updated, { hash: updated.currentRender, ext }), filename: updated.currentRender };
  });

  app.post<{ Body: { logs?: { message?: string }[] } & Record<string, unknown> }>('/api/log', async (req, reply) => {
    const frame = frameByToken(ctx, header(req, 'Access-Token'), 'trmnl');
    if (!frame) return reply.code(401).send({ error: 'unknown token' });
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [req.body];
    for (const l of logs.slice(0, 20)) req.log.info({ frame: frame.id }, `${frame.name}: ${JSON.stringify(l).slice(0, 500)}`);
    return { status: 200 };
  });
}
