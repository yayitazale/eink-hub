import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { getSetting, schema, setSetting, type DB } from '../db/index.js';
import { startSimulator, type Simulator, type SimulatorOptions } from '../device/simulator.js';
import type { Ctx } from './context.js';

/**
 * Test Canvases: simulators running inside the hub process on a loopback port, so no
 * extra port has to be published. They are remembered in settings and restarted with the hub.
 */
interface SimRecord {
  frameId: number;
  port: number;
  name: string;
}

const KEY = 'simulators';
const running = new Map<number, Simulator>();

function records(db: DB): SimRecord[] {
  try {
    return JSON.parse(getSetting(db, KEY) ?? '[]');
  } catch {
    return [];
  }
}
const save = (db: DB, list: SimRecord[]) => setSetting(db, KEY, JSON.stringify(list));

export const isSimulated = (db: DB, frameId: number) => records(db).some((r) => r.frameId === frameId);

function launch(ctx: Ctx, opts: { port: number; name: string; pull?: SimulatorOptions['pull'] }) {
  return startSimulator({
    ...opts,
    host: '127.0.0.1',
    hubOrigin: `http://127.0.0.1:${config.port}`,
    logger: ctx.log.child({ module: 'test-canvas' }),
  });
}

/** Start a new simulator; the caller adds it as a frame and then calls `remember`. */
export async function startTestCanvas(ctx: Ctx, name: string) {
  const sim = await launch(ctx, { port: 0, name });
  return { sim, host: `127.0.0.1:${sim.port}` };
}

export function remember(ctx: Ctx, frameId: number, sim: Simulator, name: string) {
  running.set(frameId, sim);
  save(ctx.db, [...records(ctx.db).filter((r) => r.frameId !== frameId), { frameId, port: sim.port, name }]);
}

export async function forgetTestCanvas(db: DB, frameId: number) {
  await running.get(frameId)?.close();
  running.delete(frameId);
  save(db, records(db).filter((r) => r.frameId !== frameId));
}

/** Bring test Canvases back after a restart, resuming pull mode where it was. */
export async function restoreTestCanvases(ctx: Ctx) {
  const kept: SimRecord[] = [];
  for (const r of records(ctx.db)) {
    const frame = ctx.db.select().from(schema.frames).where(eq(schema.frames.id, r.frameId)).get();
    if (!frame) continue;
    const pull =
      frame.mode === 'pull'
        ? { upstream_url: `http://127.0.0.1:${config.port}`, token: frame.upstreamToken, next_cron_time: Math.floor((frame.nextWake ?? Date.now() + 60_000) / 1000) }
        : undefined;
    // Same port if it is still free, otherwise a new one (and the frame follows it).
    const sim = await launch(ctx, { port: r.port, name: frame.name, pull }).catch(() => launch(ctx, { port: 0, name: frame.name, pull }));
    if (sim.port !== r.port) ctx.db.update(schema.frames).set({ host: `127.0.0.1:${sim.port}` }).where(eq(schema.frames.id, frame.id)).run();
    running.set(frame.id, sim);
    kept.push({ ...r, port: sim.port });
  }
  save(ctx.db, kept);
}

export async function stopTestCanvases() {
  await Promise.all([...running.values()].map((s) => s.close()));
  running.clear();
}
