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
import type { DisplayOptions } from '../db/schema.js';
import { localUrlSetting, qrUrl, type Ctx } from '../lib/context.js';
import { assignmentOptions, chooseNextImage, getAssignment, renderWelcomeFor } from '../lib/display.js';
import { getImage, renderFor } from '../lib/images.js';
import { firstRun, isDue, nextRun } from '../lib/schedule.js';
import { recordBattery } from '../lib/stats.js';
import { prepareCollection } from '../lib/collections.js';

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The frame just reached us at this host, so it can reach the image there too. */
function baseUrl(ctx: Ctx, req: FastifyRequest) {
  return req.headers.host ? `${req.protocol}://${req.headers.host}` : localUrlSetting(ctx.db);
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
      ctx.db
        .update(schema.frames)
        .set({
          online: true,
          lastSeen: now.getTime(),
          ...(battery !== null && Number.isFinite(battery) ? { battery } : {}),
          ...(req.query.device_id ? { deviceId: req.query.device_id } : {}),
        })
        .where(eq(schema.frames.id, frame.id))
        .run();

      if (battery !== null && Number.isFinite(battery)) recordBattery(ctx.db, frame.id, battery);
      const a = getAssignment(ctx.db, frame.id);
      const active = a?.enabled ? a : undefined;
      let imageId: number | null = null;
      let opts: DisplayOptions = assignmentOptions(ctx.db, active);

      // Priority: queued photo > welcome picture (first contact / "Limpiar") > scheduled rotation.
      const welcome = !frame.pendingImageId && !frame.welcomeShown;
      // A wake before the scheduled change (button press, reboot) only delivers queued photos.
      const due = !welcome && !!active && isDue(active.nextChange, now, active.schedule, active);
      if (frame.pendingImageId) {
        imageId = frame.pendingImageId;
        opts = frame.pendingOpts ?? opts;
      } else if (active && due) {
        await prepareCollection(ctx, active.collectionId).catch((err) => req.log.warn({ err }, 'collection refresh failed'));
        imageId = chooseNextImage(ctx.db, frame, active);
      }

      let next: Date | null;
      if (active) {
        next = due || active.nextChange == null ? nextRun(active.schedule, now, active) : new Date(active.nextChange);
        // A rotation that was due but deferred (welcome shown instead) restarts from now.
        if (next && next <= now) next = firstRun(active.schedule, now, active);
        if (due) ctx.db.update(schema.assignments).set({ nextChange: next?.getTime() ?? null }).where(eq(schema.assignments.id, active.id)).run();
      } else {
        next = nextRun(frame.pullSchedule, now);
      }
      next ??= new Date(now.getTime() + 24 * 3600_000);
      ctx.db.update(schema.frames).set({ nextWake: next.getTime() }).where(eq(schema.frames.id, frame.id)).run();

      const imageUrl = (hash: string) => `${baseUrl(ctx, req)}/u/img/${token}/${hash}_${frame.orientation === 'landscape' ? 'L' : 'P'}.jpg`;

      if (welcome) {
        const r = await renderWelcomeFor(ctx.db, frame, qrUrl(ctx.db, req));
        ctx.db.update(schema.frames).set({ welcomeShown: true, currentImageId: null, currentRender: r.hash }).where(eq(schema.frames.id, frame.id)).run();
        return { status: 200, type: 'SHOW', data: { image_url: imageUrl(r.hash), next_cron_time: iso(next) } };
      }

      if (!imageId) return { status: 204, data: { next_cron_time: iso(next) } };

      try {
        const img = getImage(ctx.db, imageId);
        const rendered = await renderFor(ctx, img, frame, opts);
        ctx.db
          .insert(schema.history)
          .values({ frameId: frame.id, imageId, shownAt: now.getTime(), method: 'pull', pullId: req.query.pull_id ?? null, battery })
          .run();
        ctx.db.update(schema.frames).set({ pendingImageId: null, pendingOpts: null, welcomeShown: true }).where(eq(schema.frames.id, frame.id)).run();
        req.log.info({ frame: frame.id, imageId, pullId: req.query.pull_id }, `eink_pull: image served to ${frame.name}`);
        if (active && due) ctx.db.update(schema.assignments).set({ lastChange: now.getTime() }).where(eq(schema.assignments.id, active.id)).run();
        return {
          status: 200,
          type: 'SHOW',
          data: {
            image_url: imageUrl(rendered.hash),
            next_cron_time: iso(next),
          },
        };
      } catch (err) {
        req.log.error({ err, frame: frame.id, imageId }, 'eink_pull render failed');
        return { status: 204, data: { next_cron_time: iso(next) } };
      }
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
    const m = req.params.file.match(/^([a-f0-9]{40})_[PL]\.jpg$/);
    const frame = ctx.db.select().from(schema.frames).where(eq(schema.frames.upstreamToken, req.params.token)).get();
    if (!m || !frame) return reply.code(404).send();
    try {
      const buf = await fs.readFile(path.join(config.cacheDir, `${m[1]}.jpg`));
      ctx.db.update(schema.frames).set({ currentRender: m[1] }).where(eq(schema.frames.id, frame.id)).run();
      return reply.header('content-type', 'image/jpeg').header('cache-control', 'no-transform').send(buf);
    } catch {
      return reply.code(404).send();
    }
  });
}
