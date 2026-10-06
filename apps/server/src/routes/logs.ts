import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { getFrame } from '../lib/display.js';
import type { Ctx } from '../lib/context.js';
import { formatEntry, queryLogs, type LogLevel } from '../lib/logbuffer.js';
import { APP_VERSION } from '../version.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];
const level = (v?: string) => (LEVELS.includes(v ?? '') ? (v as LogLevel) : undefined);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const attachment = (name: string) => `attachment; filename="${name}"`;

export function logRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get<{ Querystring: { level?: string; frame?: string; q?: string; limit?: string } }>('/api/logs', async (req) => {
    const { frame, q, limit } = req.query;
    return queryLogs({ level: level(req.query.level), frame: frame ? +frame : undefined, q, limit: Math.min(+(limit ?? 500) || 500, 2000) });
  });

  app.get<{ Querystring: { level?: string } }>('/api/logs/download', async (req, reply) => {
    const lines = queryLogs({ level: level(req.query.level) ?? 'debug' }).map(formatEntry);
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', attachment(`eink-hub-${stamp()}.log`))
      .send(lines.join('\n') + '\n');
  });

  /** Everything the Hub knows about one Canvas: its state, recent images shown and its log lines. */
  app.get<{ Params: { id: string } }>('/api/frames/:id/log', async (req, reply) => {
    const f = getFrame(db, +req.params.id);
    const history = db
      .select()
      .from(schema.history)
      .where(eq(schema.history.frameId, f.id))
      .orderBy(desc(schema.history.shownAt))
      .limit(200)
      .all();
    const { upstreamToken: _token, ...state } = f;
    const out = [
      `E-Ink Hub v${APP_VERSION} · Canvas "${f.name}" (id ${f.id}) · ${new Date().toISOString()}`,
      '',
      '== State ==',
      JSON.stringify(state, null, 2),
      '',
      `== Images shown (last ${history.length}) ==`,
      ...history.map((h) => `${new Date(h.shownAt).toISOString()} ${h.method} image=${h.imageId} ${h.success === false ? 'FAILED' : 'ok'}${h.battery != null ? ` battery=${h.battery}` : ''}`),
      '',
      '== Log ==',
      ...queryLogs({ level: 'debug', frame: f.id }).map(formatEntry),
    ];
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', attachment(`canvas-${f.id}-${stamp()}.log`))
      .send(out.join('\n') + '\n');
  });
}
