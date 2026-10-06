import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImmichAsset } from '../src/immich/client.js';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-immich-'));
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema, setSetting } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { assetOrientation, matchesOrientation } = await import('../src/immich/client.js');
const { upsertImmichAssets } = await import('../src/lib/images.js');

const exif = (w: number, h: number, orientation?: string) => ({ exifImageWidth: w, exifImageHeight: h, orientation: orientation ?? null });
const ALBUM: ImmichAsset[] = [
  { id: 'land-1', type: 'IMAGE', originalFileName: 'l1.jpg', exifInfo: exif(4000, 3000) },
  { id: 'land-2', type: 'IMAGE', originalFileName: 'l2.jpg', exifInfo: exif(6000, 4000) },
  // Stored landscape but EXIF-rotated: displayed portrait.
  { id: 'rot-portrait', type: 'IMAGE', originalFileName: 'r.jpg', exifInfo: exif(4000, 3000, '6') },
  { id: 'port-1', type: 'IMAGE', originalFileName: 'p1.jpg', exifInfo: exif(3000, 4000) },
  { id: 'square', type: 'IMAGE', originalFileName: 's.jpg', exifInfo: exif(2000, 2000) },
  { id: 'no-exif', type: 'IMAGE', originalFileName: 'n.jpg' },
  { id: 'video', type: 'VIDEO', originalFileName: 'v.mp4', exifInfo: exif(1920, 1080) },
];

describe('orientation helpers', () => {
  it('applies EXIF rotation and falls back to asset width/height', () => {
    expect(ALBUM.map(assetOrientation)).toEqual(['landscape', 'landscape', 'portrait', 'portrait', 'square', null, 'landscape']);
    expect(assetOrientation({ id: 'x', type: 'IMAGE', width: 900, height: 1600 })).toBe('portrait');
  });
  it('filters, keeping unknown sizes only for "all"', () => {
    const ids = (f: 'all' | 'landscape' | 'portrait') => ALBUM.filter((a) => matchesOrientation(a, f)).map((a) => a.id);
    expect(ids('all')).toHaveLength(ALBUM.length);
    expect(ids('portrait')).toEqual(['rot-portrait', 'port-1']);
    expect(ids('landscape')).toEqual(['land-1', 'land-2', 'video']);
  });
});

describe('album sync against a fake Immich', () => {
  const immich = Fastify();
  const db = (ensureDirs(), openDb(config.dbPath));
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeAll(async () => {
    immich.post<{ Body: { albumIds?: string[]; page: number; size: number } }>('/api/search/metadata', async (req) => {
      const items = req.body.albumIds?.includes('album-1') ? ALBUM : [];
      const start = (req.body.page - 1) * req.body.size;
      const page = items.slice(start, start + req.body.size);
      return { assets: { items: page, total: items.length, count: page.length, nextPage: start + req.body.size < items.length ? String(req.body.page + 1) : null } };
    });
    // Like Immich ≥ 1.13x: `for` must be a plain date.
    immich.get<{ Querystring: { for?: string } }>('/api/memories', async (req, reply) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.for ?? '')) return reply.code(400).send({ message: 'Validation failed' });
      return [
        {
          id: 'm1',
          type: 'on_this_day',
          data: { year: 2019 },
          assets: [
            { id: 'mem-a', type: 'IMAGE', localDateTime: `2019-${req.query.for!.slice(5)}T10:00:00.000Z`, exifInfo: exif(4000, 3000) },
            { id: 'mem-v', type: 'VIDEO', localDateTime: '2019-01-01T10:00:00.000Z' },
          ],
        },
      ];
    });
    immich.get('/api/assets/:id/original', async (_req, reply) =>
      reply.header('content-type', 'image/jpeg').send(await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#6f9a76' } }).jpeg().toBuffer()),
    );
    const url = await immich.listen({ port: 0, host: '127.0.0.1' });
    setSetting(db, 'immich.url', url);
    setSetting(db, 'immich.apiKey', 'test');
    app = (await buildApp(db, { logger: false })).app;
  });
  afterAll(async () => {
    await app.close();
    await immich.close();
  });

  const create = async (orientation?: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/collections',
        payload: { name: `Album ${orientation ?? 'all'}`, type: 'immich_album', config: { albumId: 'album-1', ...(orientation ? { orientation } : {}) } },
      })
    ).json();

  it('syncs the whole album (photos only) by default', async () => {
    expect((await create()).itemCount).toBe(6);
  });
  it('keeps only landscape photos', async () => {
    const col = await create('landscape');
    expect(col.itemCount).toBe(2);
    const imgs = (await app.inject({ url: `/api/images?collectionId=${col.id}` })).json().items;
    expect(imgs.map((i: { originalName: string }) => i.originalName).sort()).toEqual(['l1.jpg', 'l2.jpg']);
  });
  it('keeps only portrait photos, honouring EXIF rotation', async () => {
    const col = await create('portrait');
    expect(col.itemCount).toBe(2);
    const imgs = (await app.inject({ url: `/api/images?collectionId=${col.id}` })).json().items;
    const rotated = imgs.find((i: { originalName: string }) => i.originalName === 'r.jpg');
    expect([rotated.width, rotated.height]).toEqual([3000, 4000]);
  });
  it('returns the full album with orientation for the UI', async () => {
    const res = (await app.inject({ method: 'POST', url: '/api/immich/search', payload: { kind: 'metadata', albumId: 'album-1', all: true } })).json();
    expect(res.nextPage).toBeNull();
    expect(res.items.map((a: { orientation: string }) => a.orientation)).toEqual(['landscape', 'landscape', 'portrait', 'portrait', 'square', null]);
  });
  it('memories: plain-date query, fixed daily 00:00 random schedule, date caption on', async () => {
    const memories = (await app.inject({ url: '/api/immich/memories' })).json();
    expect(memories[0].assets.map((a: { id: string }) => a.id)).toEqual(['mem-a']);

    const col = (await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Recuerdos', type: 'immich_memories' } })).json();
    expect(col.itemCount).toBe(1);
    const frameId = db
      .insert(schema.frames)
      .values({ name: 'F', host: '127.0.0.1:1', upstreamToken: 'mem-token', mode: 'pull', welcomeShown: true, createdAt: Date.now() })
      .returning()
      .get().id;
    const a = (
      await app.inject({
        method: 'PUT',
        url: `/api/frames/${frameId}/assignment`,
        payload: { collectionId: col.id, schedule: { kind: 'interval', hours: 1 }, orderMode: 'sequential' },
      })
    ).json();
    expect([a.schedule, a.orderMode, a.showDate]).toEqual([{ kind: 'days', days: 1, at: '00:00' }, 'random', true]);

    const pull = (await app.inject({ url: '/eink_pull?pull_id=m', headers: { 'x-access-token': 'mem-token' } })).json();
    expect(pull.status).toBe(200);
    const next = new Date(pull.data.next_cron_time);
    expect([next.getHours(), next.getMinutes()]).toEqual([0, 0]);
    const img = await app.inject({ url: new URL(pull.data.image_url).pathname });
    expect(img.statusCode).toBe(200);
  });

  it('detects the public URL from the LAN address the UI is browsed at, unless one is saved', async () => {
    const get = (host: string) => app.inject({ url: '/api/settings', headers: { host } }).then((r) => r.json());
    expect(await get('192.168.1.50:8080')).toMatchObject({ localUrl: 'http://192.168.1.50:8080', localUrlSource: 'browser', externalUrl: '' });
    expect((await get('localhost:8080')).localUrlSource).not.toBe('browser');
    setSetting(db, 'localUrl', 'http://10.0.0.5:9000');
    expect(await get('192.168.1.50:8080')).toMatchObject({ localUrl: 'http://10.0.0.5:9000', localUrlSource: 'settings' });
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { externalUrl: 'https://hub.example.ts.net/' } });
    expect((await get('x')).externalUrl).toBe('https://hub.example.ts.net');
    const { qrUrl } = await import('../src/lib/context.js');
    expect(qrUrl(db)).toBe('https://hub.example.ts.net');
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { externalUrl: '' } });
    expect(qrUrl(db)).toBe('http://10.0.0.5:9000');
  });

  it('translates errors to the language the UI asks for', async () => {
    const err = (lang: string) =>
      app.inject({ url: '/api/frames/9999', headers: { 'x-hub-lang': lang } }).then((r) => [r.statusCode, r.json().error]);
    expect(await err('es')).toEqual([404, 'Canvas 9999 no encontrado']);
    expect(await err('eu')).toEqual([404, 'Ez da 9999 Canvasa aurkitu']);
    expect(await err('en')).toEqual([404, 'Canvas 9999 not found']);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/schedule/preview',
      headers: { 'x-hub-lang': 'en' },
      payload: { schedule: { kind: 'cron', expr: '*/5 * * * *' } },
    });
    expect(preview.json()).toEqual({ ok: false, error: 'Changes can be at most hourly: this cron expression runs more often' });
  });

  it('stores the hub language and exposes it before login', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { language: 'eu' } });
    expect((await app.inject({ url: '/api/auth/me' })).json().language).toBe('eu');
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { language: 'klingon' } });
    expect((await app.inject({ url: '/api/auth/me' })).json().language).toBe('eu');
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { language: 'es' } });
  });

  it('importing by bare id does not wipe known metadata', () => {
    const [id] = upsertImmichAssets(db, [{ id: 'land-1', type: 'IMAGE' }]);
    const row = db.select().from(schema.images).all().find((i) => i.id === id)!;
    expect([row.originalName, row.width, row.height]).toEqual(['l1.jpg', 4000, 3000]);
  });
});

describe('removing the Immich configuration', () => {
  it('disconnects Immich even when it came from the environment', async () => {
    const { app } = await buildApp(openDb(config.dbPath), { logger: false });
    config.immichUrl = 'http://env-immich:2283';
    config.immichApiKey = 'env-key';
    try {
      expect((await app.inject({ url: '/api/immich/status' })).json().configured).toBe(true);
      await app.inject({ method: 'DELETE', url: '/api/settings/immich' });
      expect((await app.inject({ url: '/api/immich/status' })).json()).toEqual({ configured: false });
      expect((await app.inject({ url: '/api/settings' })).json()).toMatchObject({ immichUrl: '', immichApiKeySet: false });
    } finally {
      config.immichUrl = '';
      config.immichApiKey = '';
      await app.close();
    }
  });
});
