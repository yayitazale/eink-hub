import { buildApp } from './app.js';
import { config, ensureDirs } from './config.js';
import { openDb } from './db/index.js';
import { startScheduler } from './scheduler/index.js';
import { restoreTestCanvases, stopTestCanvases } from './lib/simulators.js';

ensureDirs();
const db = openDb(config.dbPath);
const { app, ctx } = await buildApp(db);
const stopScheduler = config.schedulerEnabled ? startScheduler(ctx) : () => {};

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopScheduler();
    await stopTestCanvases();
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
await restoreTestCanvases(ctx).catch((err) => app.log.error({ err }, 'could not restart test Canvases'));
if (config.authDisabled) app.log.warn('AUTH_DISABLED=true — the web UI is open to anyone on the network');
