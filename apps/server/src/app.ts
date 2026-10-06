import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import type { DB } from './db/index.js';
import { cookieSecret, setupAuth } from './auth/index.js';
import { DeviceError } from './device/client.js';
import { ImmichError } from './immich/client.js';
import { HttpError, type Ctx } from './lib/context.js';
import { requestLang, tr } from './i18n.js';
import { frameRoutes } from './routes/frames.js';
import { immichRoutes } from './routes/immich.js';
import { libraryRoutes } from './routes/library.js';
import { logRoutes } from './routes/logs.js';
import { statsRoutes } from './routes/stats.js';
import { createLogStream } from './lib/logbuffer.js';
import { upstreamRoutes } from './upstream/routes.js';
import { APP_VERSION } from './version.js';

export async function buildApp(db: DB, opts: { logger?: boolean; logDir?: string } = {}) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info', stream: createLogStream(opts.logDir) },
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  });
  const ctx: Ctx = { db, log: app.log };

  await app.register(cookie, { secret: cookieSecret(db) });
  await app.register(multipart, { limits: { fileSize: 80 * 1024 * 1024, files: 200 } });

  app.setErrorHandler((err, req, reply) => {
    const lang = requestLang(req, db);
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: tr(lang, err.key, err.vars) });
    if (err instanceof DeviceError)
      return reply.code(err.offline ? 504 : 502).send({ error: err.offline ? tr(lang, 'canvas_offline') : err.message, offline: err.offline });
    if (err instanceof ImmichError) return reply.code(502).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.code(status).send({ error: (err as Error).message });
  });

  await setupAuth(app, db);
  app.get('/api/health', async () => ({ ok: true, version: APP_VERSION }));
  upstreamRoutes(app, ctx);
  frameRoutes(app, ctx);
  libraryRoutes(app, ctx);
  immichRoutes(app, ctx);
  logRoutes(app, ctx);
  statsRoutes(app, ctx);

  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      // A missing build asset must 404, not get the SPA page (it would be loaded as a script).
      if (req.url.startsWith('/api/') || req.url.startsWith('/assets/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return { app, ctx };
}
