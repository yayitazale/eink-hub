/**
 * BLOOMIN8 "Schedule Pull" upstream protocol. The canvas wakes at `cron_time`, calls
 * GET {upstream_url}/eink_pull, downloads `image_url`, shows it, reports to /eink_signal
 * and sleeps until `next_cron_time`. Business status lives in the JSON body; the HTTP
 * status must always be 200.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { config } from '../config.js';
import { schema } from '../db/index.js';
import type { Frame } from '../db/schema.js';
import { formatMime } from '../imaging/pipeline.js';
import { localUrlSetting, qrUrl, type Ctx } from '../lib/context.js';
import type { Rendered } from '../lib/images.js';
import { servePull } from '../lib/pull.js';

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The frame just reached us at this host, so it can reach the image there too. */
function baseUrl(ctx: Ctx, req: FastifyRequest) {
  return req.headers.host ? `${req.protocol}://${req.headers.host}` : localUrlSetting(ctx.db);
}

/** Where a frame downloads a render from; the token keeps other people's pictures private. */
export function imageUrl(ctx: Ctx, req: FastifyRequest, frame: Frame, r: Pick<Rendered, 'hash' | 'ext'>) {
  return `${baseUrl(ctx, req)}/u/img/${frame.upstreamToken}/${r.hash}_${frame.orientation === 'landscape' ? 'L' : 'P'}.${r.ext}`;
}

export function upstreamRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Querystring: { device_id?: string; pull_id?: string; cron_time?: string; battery?: string } }>(
    '/eink_pull',
    async (req) => {
      const token = String(req.headers['x-access-token'] ?? '');
      const frame = token ? ctx.db.select().from(schema.frames).where(eq(schema.frames.upstreamToken, token)).get() : undefined;
      const now = new Date();
      if (!frame) {
        req.log.warn({ device: req.query.device_id }, 'eink_pull with unknown token');
        return { status: 204, data: { next_cron_time: iso(new Date(now.getTime() + 3600_000)) } };
      }

      const battery = req.query.battery !== undefined ? Number(req.query.battery) : null;
      const { rendered, next } = await servePull(ctx, frame, {
        qrUrl: qrUrl(ctx.db, req),
        pullId: req.query.pull_id,
        battery,
        seen: req.query.device_id ? { deviceId: req.query.device_id } : {},
        now,
      });
      if (!rendered) return { status: 204, data: { next_cron_time: iso(next) } };
      return { status: 200, type: 'SHOW', data: { image_url: imageUrl(ctx, req, frame, rendered), next_cron_time: iso(next) } };
    },
  );

  app.get<{ Querystring: { pull_id?: string; success?: string } }>('/eink_signal', async (req) => {
    const token = String(req.headers['x-access-token'] ?? '');
    const frame = token ? ctx.db.select().from(schema.frames).where(eq(schema.frames.upstreamToken, token)).get() : undefined;
    const pullId = req.query.pull_id;
    if (frame && pullId) {
      const success = req.query.success === '1';
      const h = ctx.db
        .update(schema.history)
        .set({ success })
        .where(and(eq(schema.history.frameId, frame.id), eq(schema.history.pullId, pullId)))
        .returning()
        .get();
      if (h && success) ctx.db.update(schema.frames).set({ currentImageId: h.imageId }).where(eq(schema.frames.id, frame.id)).run();
    }
    return { status: 200, message: 'Feedback recorded' };
  });

  // Served as a plain Buffer: Fastify sets Content-Length; no chunking, no compression.
  app.get<{ Params: { token: string; file: string } }>('/u/img/:token/:file', async (req, reply) => {
    const m = req.params.file.match(/^([a-f0-9]{40})_[PL]\.(jpg|png|bmp)$/);
    const frame = ctx.db.select().from(schema.frames).where(eq(schema.frames.upstreamToken, req.params.token)).get();
    if (!m || !frame) return reply.code(404).send();
    try {
      const buf = await fs.readFile(path.join(config.cacheDir, `${m[1]}.${m[2]}`));
      ctx.db.update(schema.frames).set({ currentRender: m[1] }).where(eq(schema.frames.id, frame.id)).run();
      return reply.header('content-type', formatMime(m[2])).header('cache-control', 'no-transform').send(buf);
    } catch {
      return reply.code(404).send();
    }
  });
}
