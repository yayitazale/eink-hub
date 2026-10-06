import type { FastifyInstance } from 'fastify';
import { getFrame } from '../lib/display.js';
import type { Ctx } from '../lib/context.js';
import { frameStats, statsEnabled } from '../lib/stats.js';

export function statsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  /** Per-Canvas statistics; off (and not recorded) until switched on in Settings. */
  app.get<{ Params: { id: string } }>('/api/frames/:id/stats', async (req) => {
    const f = getFrame(db, +req.params.id);
    if (!statsEnabled(db)) return { enabled: false };
    return { enabled: true, createdAt: f.createdAt, lastSeen: f.lastSeen, ...frameStats(db, f.id) };
  });
}
