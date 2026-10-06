import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import type { DisplayOptions, Frame } from '../db/schema.js';
import { prepareCollection } from './collections.js';
import type { Ctx } from './context.js';
import { assignmentOptions, chooseNextImage, getAssignment, renderWelcomeFor } from './display.js';
import { getImage, renderFor, type Rendered } from './images.js';
import { firstRun, isDue, nextRun } from './schedule.js';
import { inWindow } from './selection.js';
import { recordBattery } from './stats.js';

export interface PullRequest {
  /** URL encoded in the welcome picture's QR code. */
  qrUrl: string;
  pullId?: string | null;
  battery?: number | null;
  /** Anything else the frame told us about itself (device id, resolution…). */
  seen?: Partial<Frame>;
  now?: Date;
}

export interface PullResult {
  /** What to show now; null when there is nothing new. */
  rendered: Rendered | null;
  imageId: number | null;
  /** When the frame should come back: the next scheduled change, or its pull schedule. */
  next: Date;
}

/**
 * The decision every pull protocol shares (BLOOMIN8 Schedule Pull, Open Frame, TRMNL):
 * queued photo > welcome picture (first contact / "Clear") > scheduled rotation > nothing.
 * Records the visit, the battery and the history row; the caller only formats the answer.
 */
export async function servePull(ctx: Ctx, frame: Frame, req: PullRequest): Promise<PullResult> {
  const now = req.now ?? new Date();
  const battery = req.battery != null && Number.isFinite(req.battery) ? Math.round(req.battery) : null;
  ctx.db
    .update(schema.frames)
    .set({ online: true, lastSeen: now.getTime(), ...(battery !== null ? { battery } : {}), ...req.seen })
    .where(eq(schema.frames.id, frame.id))
    .run();
  if (battery !== null) recordBattery(ctx.db, frame.id, battery);
  frame = { ...frame, ...req.seen };

  const a = getAssignment(ctx.db, frame.id);
  const active = a?.enabled ? a : undefined;
  let imageId: number | null = null;
  let opts: DisplayOptions = assignmentOptions(ctx.db, active);

  const welcome = !frame.pendingImageId && !frame.welcomeShown;
  // A wake before the scheduled change (button press, reboot) only delivers queued photos.
  const due = !welcome && !!active && isDue(active.nextChange, now, active.schedule, active);
  if (frame.pendingImageId) {
    imageId = frame.pendingImageId;
    opts = frame.pendingOpts ?? opts;
  } else if (active && due) {
    await prepareCollection(ctx, active.collectionId).catch((err) => ctx.log.warn({ err }, 'collection refresh failed'));
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

  if (welcome) {
    const r = await renderWelcomeFor(ctx.db, frame, req.qrUrl);
    ctx.db.update(schema.frames).set({ welcomeShown: true, currentImageId: null, currentRender: r.hash }).where(eq(schema.frames.id, frame.id)).run();
    return { rendered: r, imageId: null, next };
  }
  if (!imageId) return { rendered: null, imageId: null, next };

  try {
    const rendered = await renderFor(ctx, getImage(ctx.db, imageId), frame, opts);
    ctx.db
      .insert(schema.history)
      .values({ frameId: frame.id, imageId, shownAt: now.getTime(), method: 'pull', pullId: req.pullId ?? null, battery })
      .run();
    ctx.db.update(schema.frames).set({ pendingImageId: null, pendingOpts: null, welcomeShown: true }).where(eq(schema.frames.id, frame.id)).run();
    if (active && due) ctx.db.update(schema.assignments).set({ lastChange: now.getTime() }).where(eq(schema.assignments.id, active.id)).run();
    ctx.log.info({ frame: frame.id, imageId, pullId: req.pullId }, `pull: image served to ${frame.name}`);
    return { rendered, imageId, next };
  } catch (err) {
    ctx.log.error({ err, frame: frame.id, imageId }, 'pull render failed');
    return { rendered: null, imageId: null, next };
  }
}

export const DEFAULT_MAX_POLL_MINUTES = 60;
const MIN_POLL_S = 60;

/**
 * Seconds a DIY frame should sleep: until the next change, but never longer than its maximum
 * so photos sent by hand don't wait for tomorrow's rotation. Outside the schedule's active
 * hours it sleeps right through to the next change (nights cost nothing).
 */
export function pollSeconds(ctx: Ctx, frame: Frame, next: Date, now = new Date()): number {
  const untilNext = Math.round((next.getTime() - now.getTime()) / 1000);
  const a = getAssignment(ctx.db, frame.id);
  const quiet = !!(a?.enabled && a.activeFrom && a.activeTo && !inWindow(now, a.activeFrom, a.activeTo));
  const max = (frame.config?.maxPollMinutes ?? DEFAULT_MAX_POLL_MINUTES) * 60;
  return Math.max(MIN_POLL_S, quiet ? untilNext : Math.min(untilNext, max));
}
