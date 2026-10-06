/**
 * In-memory BLOOMIN8 Canvas simulator for trying the hub without hardware.
 * Used by `npm run fake-frame` and by the hub itself ("test Canvas" button).
 * Implements the local REST API, and when upstream pull is enabled it wakes at
 * cron_time, calls /eink_pull, downloads the image (checking it is baseline JPEG
 * at native resolution), reports /eink_signal and schedules the next wake.
 * GET /current.jpg returns what is "on screen".
 */
import crypto from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { isBaselineJpeg } from '../imaging/pipeline.js';

export interface SimulatorOptions {
  /** 0 picks a free port. */
  port?: number;
  host?: string;
  width?: number;
  height?: number;
  name?: string;
  /** Compress every wait to 5 s so the pull loop can be watched live. */
  fast?: boolean;
  /**
   * Reach the hub here instead of the configured upstream URL. Inside the hub's own
   * container the LAN address may not loop back, but the hub always listens locally.
   */
  hubOrigin?: string;
  /** Pull settings to resume with (the simulator keeps no state across restarts). */
  pull?: { upstream_url: string; token: string; next_cron_time: number };
  /** Log through this logger (e.g. the hub's) instead of a new one. */
  logger?: FastifyBaseLogger;
}

export interface Simulator {
  app: FastifyInstance;
  port: number;
  current: () => Buffer | null;
  close: () => Promise<void>;
}

export async function startSimulator(o: SimulatorOptions = {}): Promise<Simulator> {
  const width = o.width ?? 1200;
  const height = o.height ?? 1600;
  let port = o.port ?? 8090;

  const state = {
    name: o.name ?? 'Fake Canvas',
    battery: 87,
    sleep_duration: 86400,
    max_idle: 300,
    galleries: new Map<string, Map<string, { data: Buffer; time: number }>>([['default', new Map()]]),
    playlists: new Map<string, unknown>(),
    current: null as Buffer | null,
    currentPath: '',
    pull: o.pull ? { upstream_on: true, ...o.pull } : { upstream_on: false, upstream_url: '', token: '', next_cron_time: 0 },
  };
  let pullTimer: NodeJS.Timeout | undefined;

  const app: FastifyInstance = o.logger
    ? Fastify({ loggerInstance: o.logger, disableRequestLogging: true })
    : Fastify({ logger: { level: 'info' } });
  await app.register(multipart);

  /** URL to fetch, redirected to the hub's local origin when one is given. */
  const viaHub = (url: string) => {
    if (!o.hubOrigin) return url;
    const u = new URL(url);
    return o.hubOrigin.replace(/\/+$/, '') + u.pathname + u.search;
  };

  async function display(buf: Buffer, path: string) {
    const meta = await sharp(buf).metadata();
    const problems = [];
    if (!isBaselineJpeg(buf)) problems.push('not baseline JPEG');
    if (meta.width !== width || meta.height !== height) problems.push(`size ${meta.width}x${meta.height} ≠ ${width}x${height}`);
    if (problems.length) app.log.warn({ path, problems }, '⚠ image would not display correctly');
    state.current = buf;
    state.currentPath = path;
    app.log.info({ canvas: state.name, path }, '🖼  now showing');
  }

  app.get('/deviceInfo', async () => ({
    name: state.name,
    version: '1.0.0-fake',
    board_model: 'FAKE',
    screen_model: `EL133UF1-fake`,
    battery: state.battery,
    fs_ready: true,
    total_size: 8e9,
    free_size: 7e9,
    sleep_duration: state.sleep_duration,
    max_idle: state.max_idle,
    network_type: 1,
    width,
    height,
    sta_ssid: 'fake',
    sta_ip: `127.0.0.1:${port}`,
    image: state.currentPath,
    next_time: state.pull.next_cron_time,
    gallery: 'default',
    playlist: '',
    play_type: 0,
  }));
  app.get('/state', async () => ({ status: 0, msg: 'idle' }));
  app.get('/whistle', async () => ({ status: 100 }));
  for (const p of ['/showNext', '/sleep', '/reboot', '/clearScreen']) app.post(p, async () => ({ status: 100 }));
  app.post<{ Body: Record<string, number | string> }>('/settings', async (req) => {
    Object.assign(state, req.body);
    return { status: 100 };
  });
  app.post<{ Body: { image?: string } }>('/show', async (req) => {
    const [, , g, f] = (req.body.image ?? '').split('/');
    const img = state.galleries.get(g)?.get(f);
    if (img) await display(img.data, req.body.image!);
    return { status: 100 };
  });

  app.post<{ Querystring: { filename: string; gallery?: string; show_now?: string } }>('/upload', async (req) => {
    const file = await req.file();
    if (!file) return { status: 400 };
    const data = await file.toBuffer();
    const g = req.query.gallery ?? 'default';
    if (!state.galleries.has(g)) state.galleries.set(g, new Map());
    state.galleries.get(g)!.set(req.query.filename, { data, time: Math.floor(Date.now() / 1000) });
    const path = `/gallerys/${g}/${req.query.filename}`;
    if (req.query.show_now === '1') await display(data, path);
    return { status: 100, path };
  });
  app.post<{ Querystring: { image: string; gallery?: string } }>('/image/delete', async (req) => {
    state.galleries.get(req.query.gallery ?? 'default')?.delete(req.query.image);
    return { status: 100 };
  });

  app.get('/gallery/list', async () => [...state.galleries.keys()].map((name) => ({ name })));
  app.put<{ Querystring: { name: string } }>('/gallery', async (req) => {
    state.galleries.set(req.query.name, new Map());
    return { status: 100 };
  });
  app.delete<{ Querystring: { name: string } }>('/gallery', async (req) => {
    state.galleries.delete(req.query.name);
    return { status: 100 };
  });
  app.get<{ Querystring: { gallery_name: string; offset: string; limit: string } }>('/gallery', async (req) => {
    const items = [...(state.galleries.get(req.query.gallery_name) ?? new Map()).entries()].map(([name, v]) => ({
      name,
      size: v.data.length,
      time: v.time,
    }));
    const offset = Number(req.query.offset ?? 0);
    const limit = Number(req.query.limit ?? 100);
    return { data: items.slice(offset, offset + limit), total: items.length, offset, limit };
  });

  app.get('/playlist/list', async () => [...state.playlists.keys()].map((name) => ({ name, time: 0 })));
  app.get<{ Querystring: { name: string } }>('/playlist', async (req) => state.playlists.get(req.query.name) ?? {});
  app.put<{ Body: { name: string } }>('/playlist', async (req) => {
    state.playlists.set(req.body.name, req.body);
    return { status: 100 };
  });
  app.delete<{ Querystring: { name: string } }>('/playlist', async (req) => {
    state.playlists.delete(req.query.name);
    return { status: 100 };
  });

  app.get('/upstream/pull_settings', async () => state.pull);
  app.put<{ Body: { upstream_on: boolean; upstream_url: string; token: string; cron_time?: string } }>('/upstream/pull_settings', async (req) => {
    const b = req.body;
    state.pull = {
      upstream_on: b.upstream_on,
      upstream_url: b.upstream_url,
      token: b.token,
      next_cron_time: b.cron_time ? Math.floor(Date.parse(b.cron_time) / 1000) : 0,
    };
    schedulePull();
    return { status: 100 };
  });

  app.get('/current.jpg', async (_req, reply) =>
    state.current ? reply.header('content-type', 'image/jpeg').send(state.current) : reply.code(404).send('nothing shown yet'),
  );

  function schedulePull() {
    clearTimeout(pullTimer);
    if (!state.pull.upstream_on || !state.pull.next_cron_time) return;
    const wait = o.fast ? 5000 : Math.max(1000, state.pull.next_cron_time * 1000 - Date.now());
    app.log.info({ canvas: state.name, at: new Date(Date.now() + wait).toISOString() }, '😴 sleeping until next pull');
    pullTimer = setTimeout(doPull, wait);
  }

  async function doPull() {
    const pullId = crypto.randomUUID();
    const headers = { 'X-Access-Token': state.pull.token };
    const q = new URLSearchParams({
      device_id: 'fake-' + port,
      pull_id: pullId,
      cron_time: new Date(state.pull.next_cron_time * 1000).toISOString(),
      battery: String(state.battery),
    });
    try {
      const res = await fetch(viaHub(`${state.pull.upstream_url}/eink_pull?${q}`), { headers });
      const body = (await res.json()) as { status: number; data: { image_url?: string; next_cron_time: string | null } };
      app.log.info({ canvas: state.name, http: res.status, body }, '⬇ eink_pull');
      if (body.status === 200 && body.data.image_url) {
        const img = await fetch(viaHub(body.data.image_url));
        const ok = img.ok && img.headers.get('content-type') === 'image/jpeg' && !!img.headers.get('content-length');
        if (!img.headers.get('content-length')) app.log.warn('⚠ image response has no Content-Length');
        const buf = Buffer.from(await img.arrayBuffer());
        if (ok) await display(buf, body.data.image_url);
        await fetch(viaHub(`${state.pull.upstream_url}/eink_signal?pull_id=${pullId}&success=${ok ? 1 : 0}`), { headers });
      }
      state.battery = Math.max(1, state.battery - 1);
      state.pull.next_cron_time = body.data.next_cron_time ? Math.floor(Date.parse(body.data.next_cron_time) / 1000) : 0;
      if (!body.data.next_cron_time) state.pull.upstream_on = false;
    } catch (err) {
      app.log.error({ err }, 'pull failed; retrying in 10 min');
      state.pull.next_cron_time = Math.floor(Date.now() / 1000) + 600;
    }
    schedulePull();
  }

  await app.listen({ port, host: o.host ?? '0.0.0.0' });
  port = (app.server.address() as { port: number }).port;
  schedulePull();

  return {
    app,
    port,
    current: () => state.current,
    close: async () => {
      clearTimeout(pullTimer);
      await app.close();
    },
  };
}
