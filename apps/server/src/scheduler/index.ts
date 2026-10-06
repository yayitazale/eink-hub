import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { DeviceError } from '../device/client.js';
import { purgeSessions } from '../auth/index.js';
import { needsSync, prepareCollection, syncCollection } from '../lib/collections.js';
import { qrUrl, type Ctx } from '../lib/context.js';
import { assignmentOptions, chooseNextImage, getAssignment, markOnline, pushImage, pushWelcome } from '../lib/display.js';
import { getImage } from '../lib/images.js';
import { isDue, nextRun } from '../lib/schedule.js';
import { pruneBatterySamples } from '../lib/stats.js';
import { withWake } from '../lib/wake.js';
import { refreshFrame } from '../routes/frames.js';

/**
 * Push-mode rotation + housekeeping. Pull-mode frames are driven by their own wake-ups
 * (see upstream/routes.ts); we never poll them since they are asleep.
 */
export async function tick(ctx: Ctx, now = new Date()) {
  const frames = ctx.db.select().from(schema.frames).where(eq(schema.frames.mode, 'push')).all();
  for (const frame of frames) {
    // Only when there is something to send; never just to poll (battery).
    const awake = (fn: () => Promise<void>) => withWake(ctx, frame, fn, { background: true });
    try {
      if (!frame.welcomeShown) {
        await awake(() => pushWelcome(ctx, frame, qrUrl(ctx.db)));
        continue;
      }
      if (frame.pendingImageId) {
        const pending = getImage(ctx.db, frame.pendingImageId);
        await awake(() => pushImage(ctx, frame, pending, frame.pendingOpts ?? {}));
        continue;
      }
      const a = getAssignment(ctx.db, frame.id);
      if (!a?.enabled || !isDue(a.nextChange, now, a.schedule, a)) continue;
      await prepareCollection(ctx, a.collectionId);
      const imageId = chooseNextImage(ctx.db, frame, a);
      if (!imageId) continue;
      await awake(() => pushImage(ctx, frame, getImage(ctx.db, imageId), assignmentOptions(ctx.db, a)));
      ctx.db
        .update(schema.assignments)
        .set({ lastChange: now.getTime(), nextChange: nextRun(a.schedule, now, a)?.getTime() ?? null })
        .where(eq(schema.assignments.id, a.id))
        .run();
    } catch (err) {
      if (err instanceof DeviceError && err.offline) markOnline(ctx.db, frame.id, false);
      else ctx.log.warn({ err, frame: frame.id }, 'push rotation failed');
    }
  }
}

export async function housekeeping(ctx: Ctx) {
  for (const c of ctx.db.select().from(schema.collections).all()) {
    if (needsSync(c)) await syncCollection(ctx, c);
  }
  purgeSessions(ctx.db);
  pruneBatterySamples(ctx.db);
}

export async function pollStatus(ctx: Ctx) {
  const frames = ctx.db.select().from(schema.frames).where(eq(schema.frames.mode, 'push')).all();
  await Promise.all(frames.map((f) => refreshFrame(ctx, f, 4000)));
}

export function startScheduler(ctx: Ctx) {
  const guard = (name: string, fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err) {
      ctx.log.error({ err }, `scheduler ${name} failed`);
    }
  };
  // `protect` skips a run while the previous one is still going.
  const jobs = [
    new Cron('* * * * *', { protect: true }, guard('tick', () => tick(ctx))),
    new Cron('*/5 * * * *', { protect: true }, guard('status', () => pollStatus(ctx))),
    new Cron('*/15 * * * *', { protect: true }, guard('housekeeping', () => housekeeping(ctx))),
  ];
  setTimeout(guard('housekeeping', () => housekeeping(ctx)), 5000);
  return () => jobs.forEach((j) => j.stop());
}
