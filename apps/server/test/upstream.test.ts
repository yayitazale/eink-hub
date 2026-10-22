import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { saveLocalUpload } = await import('../src/lib/images.js');
const { isBaselineJpeg } = await import('../src/imaging/pipeline.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });

afterAll(async () => {
  await app.close();
});

describe('upstream pull protocol', () => {
  let frameId: number;
  let imageId: number;
  const token = 'test-token-123';

  beforeAll(async () => {
    // Unreachable host: pushes fail as "offline" and get queued for the next pull.
    frameId = db
      .insert(schema.frames)
      .values({ name: 'Test', host: '127.0.0.1:1', upstreamToken: token, mode: 'pull', createdAt: Date.now() })
      .returning()
      .get().id;
    const photo = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#e07a5f' } }).jpeg().toBuffer();
    imageId = (await saveLocalUpload(db, photo, 'test.jpg')).id;
  });

  it('answers 204 (in body, HTTP 200) for unknown tokens', async () => {
    const res = await app.inject({ url: '/eink_pull?device_id=x&pull_id=a&battery=50', headers: { 'x-access-token': 'nope' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe(204);
  });

  it('queues a display request when the frame is asleep', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/frames/${frameId}/display`, payload: { imageId, fit: 'contain' } });
    expect(res.json()).toEqual({ method: 'queued' });
  });

  it('delivers the queued image on the next pull, with a baseline JPEG and Content-Length', async () => {
    const res = await app.inject({
      url: '/eink_pull?device_id=dev1&pull_id=p1&battery=42&cron_time=2026-01-01T00:00:00Z',
      headers: { 'x-access-token': token, host: 'hub.local:8080' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe(200);
    expect(body.type).toBe('SHOW');
    expect(body.data.image_url).toMatch(/^http:\/\/hub\.local:8080\/u\/img\/test-token-123\/[a-f0-9]{40}_P\.jpg$/);
    expect(body.data.next_cron_time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

    const img = await app.inject({ url: new URL(body.data.image_url).pathname });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(Number(img.headers['content-length'])).toBe(img.rawPayload.length);
    expect(img.headers['transfer-encoding']).toBeUndefined();
    expect(isBaselineJpeg(img.rawPayload)).toBe(true);
    const meta = await sharp(img.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);

    const frame = (await app.inject({ url: `/api/frames/${frameId}` })).json();
    expect(frame.battery).toBe(42);
    expect(frame.deviceId).toBe('dev1');
    expect(frame.pendingImageId).toBeNull();
  });

  it('records the display signal', async () => {
    const res = await app.inject({ url: '/eink_signal?pull_id=p1&success=1', headers: { 'x-access-token': token } });
    expect(res.json().status).toBe(200);
    const hist = (await app.inject({ url: `/api/frames/${frameId}/history` })).json();
    expect(hist[0]).toMatchObject({ imageId, method: 'pull', success: true, battery: 42 });
  });

  it('rotates through an assigned collection and schedules the next wake', async () => {
    const col = (
      await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Test', type: 'manual', imageIds: [imageId] } })
    ).json();
    expect(col.itemCount).toBe(1);
    const put = await app.inject({
      method: 'PUT',
      url: `/api/frames/${frameId}/assignment`,
      payload: { collectionId: col.id, schedule: { kind: 'interval', hours: 3 } },
    });
    expect(put.json().nextChange).toBeNull();
    const body = (await app.inject({ url: '/eink_pull?pull_id=p2', headers: { 'x-access-token': token } })).json();
    expect(body.status).toBe(200);
    const next = Date.parse(body.data.next_cron_time) - Date.now();
    expect(next).toBeGreaterThan(179 * 60_000);
    expect(next).toBeLessThan(181 * 60_000);
  });

  it('an early wake does not change the photo and keeps the scheduled time', async () => {
    const before = (await app.inject({ url: `/api/frames/${frameId}` })).json().assignment.nextChange;
    const body = (await app.inject({ url: '/eink_pull?pull_id=p3', headers: { 'x-access-token': token } })).json();
    expect(body.status).toBe(204);
    expect(Date.parse(body.data.next_cron_time)).toBe(Math.floor(before / 1000) * 1000);
  });

  it('daily schedules wake at the chosen local time', async () => {
    const colId = (await app.inject({ url: `/api/frames/${frameId}` })).json().assignment.collectionId;
    const put = await app.inject({
      method: 'PUT',
      url: `/api/frames/${frameId}/assignment`,
      payload: { collectionId: colId, schedule: { kind: 'days', days: 1, at: '07:00' }, activeFrom: '08:00', activeTo: '22:00' },
    });
    const a = put.json();
    // Timing changed: no immediate change, next run is tomorrow (or today) at 07:00; window dropped.
    expect([a.activeFrom, a.activeTo]).toEqual([null, null]);
    const next = new Date(a.nextChange);
    expect([next.getHours(), next.getMinutes()]).toEqual([7, 0]);
  });

  it('shows the welcome picture on first pull, then not again until "Limpiar"', async () => {
    const id = db
      .insert(schema.frames)
      .values({ name: 'Nuevo', host: '127.0.0.1:1', upstreamToken: 'welcome-token', mode: 'pull', createdAt: Date.now() })
      .returning()
      .get().id;
    const pull = () => app.inject({ url: '/eink_pull?pull_id=w', headers: { 'x-access-token': 'welcome-token' } }).then((r) => r.json());

    const first = await pull();
    expect(first.status).toBe(200);
    const img = await app.inject({ url: new URL(first.data.image_url).pathname });
    expect(isBaselineJpeg(img.rawPayload)).toBe(true);
    expect((await pull()).status).toBe(204);

    // Canvas asleep: "Limpiar" is queued for the next wake.
    const clear = await app.inject({ method: 'POST', url: `/api/frames/${id}/actions/clear` });
    expect(clear.json()).toEqual({ ok: true, queued: true });
    const again = await pull();
    expect(again.status).toBe(200);
    expect(again.data.image_url).toBe(first.data.image_url);
  });

  it('pushes the welcome picture when a reachable Canvas is added', async () => {
    const uploads: string[] = [];
    const device = Fastify();
    await device.register(multipart);
    device.get('/deviceInfo', async () => ({ name: 'Real', screen_model: 'X', width: 1200, height: 1600, battery: 90 }));
    device.post<{ Querystring: { filename: string; show_now: string } }>('/upload', async (req) => {
      await (await req.file())!.toBuffer();
      uploads.push(`${req.query.filename}:${req.query.show_now}`);
      return { status: 100 };
    });
    const addr = await device.listen({ port: 0, host: '127.0.0.1' });
    try {
      const frame = (await app.inject({ method: 'POST', url: '/api/frames', payload: { host: addr.replace('http://', '') } })).json();
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatch(/^welcome_[a-f0-9]{10}_P\.jpg:1$/);
      expect(frame.welcomeShown).toBe(true);
      expect(frame.currentRender).toMatch(/^[a-f0-9]{40}$/);
    } finally {
      await device.close();
    }
  });

  it('adds a Canvas hung landscape and greets it with the landscape welcome picture', async () => {
    const uploads: { name: string; buf: Buffer }[] = [];
    const device = Fastify();
    await device.register(multipart);
    device.get('/deviceInfo', async () => ({ name: 'Wide', screen_model: 'Y', width: 1200, height: 1600, battery: 90 }));
    device.post<{ Querystring: { filename: string } }>('/upload', async (req) => {
      uploads.push({ name: req.query.filename, buf: await (await req.file())!.toBuffer() });
      return { status: 100 };
    });
    const addr = await device.listen({ port: 0, host: '127.0.0.1' });
    try {
      const frame = (await app.inject({ method: 'POST', url: '/api/frames', payload: { host: addr.replace('http://', ''), orientation: 'landscape' } })).json();
      expect(frame.orientation).toBe('landscape');
      expect(uploads.map((u) => u.name)).toEqual([expect.stringMatching(/^welcome_[a-f0-9]{10}_L\.jpg$/)]);
      // Stored in the panel's portrait buffer, rotated.
      const meta = await sharp(uploads[0].buf).metadata();
      expect([meta.width, meta.height]).toEqual([1200, 1600]);

      // Turned back to portrait: the welcome picture is redrawn and sent again.
      await app.inject({ method: 'PATCH', url: `/api/frames/${frame.id}`, payload: { orientation: 'portrait' } });
      await vi.waitFor(() => expect(uploads).toHaveLength(2));
      expect(uploads[1].name).toMatch(/_P\.jpg$/);
      // Other edits leave the screen alone.
      await app.inject({ method: 'PATCH', url: `/api/frames/${frame.id}`, payload: { name: 'Wide 2' } });
      await new Promise((r) => setTimeout(r, 200));
      expect(uploads).toHaveLength(2);
    } finally {
      await device.close();
    }
  });

  it('queues the redrawn welcome picture for a pull frame that changes orientation', async () => {
    const id = db
      .insert(schema.frames)
      .values({ name: 'Turned', host: '127.0.0.1:1', upstreamToken: 'turn-token', mode: 'pull', createdAt: Date.now(), welcomeShown: true })
      .returning()
      .get().id;
    await app.inject({ method: 'PATCH', url: `/api/frames/${id}`, payload: { orientation: 'landscape' } });
    await vi.waitFor(() => expect(db.select().from(schema.frames).where(eq(schema.frames.id, id)).get()!.welcomeShown).toBe(false));
    const pull = await app.inject({ url: '/eink_pull?pull_id=t', headers: { 'x-access-token': 'turn-token' } }).then((r) => r.json());
    expect(pull.status).toBe(200);
    expect(pull.data.image_url).toMatch(/_L\.jpg$/);
  });

  it('rejects schedules more frequent than hourly', async () => {
    const colId = (await app.inject({ url: `/api/frames/${frameId}` })).json().assignment.collectionId;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/frames/${frameId}/assignment`,
      payload: { collectionId: colId, schedule: { kind: 'cron', expr: '*/15 * * * *' } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('adding Canvases', () => {
  it('refuses a Canvas that is already added', async () => {
    db.insert(schema.frames).values({ name: 'Salón', host: '127.0.0.1:2', upstreamToken: 'dup-token', createdAt: Date.now() }).run();
    const res = await app.inject({ method: 'POST', url: '/api/frames', payload: { host: 'http://127.0.0.1:2/' }, headers: { 'x-hub-lang': 'es' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('Salón');
  });
});

describe('sending a photo from the gallery', () => {
  it('can label it with the date it was taken, like a schedule does', async () => {
    const id = db
      .insert(schema.frames)
      .values({ name: 'Galería', host: '127.0.0.1:1', upstreamToken: 'gallery-token', mode: 'pull', createdAt: Date.now(), welcomeShown: true })
      .returning()
      .get().id;
    const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3a7bd5' } }).jpeg().toBuffer();
    const imageId = (await saveLocalUpload(db, photo, 'dated.jpg')).id;
    db.update(schema.images).set({ takenAt: Date.UTC(2019, 9, 6, 12) }).where(eq(schema.images.id, imageId)).run();

    const preview = (showDate: boolean) =>
      app.inject({ method: 'POST', url: '/api/render/preview', payload: { imageId, frameId: id, fit: 'cover', showDate } }).then((r) => r.rawPayload);
    const [plain, dated] = [await preview(false), await preview(true)];
    expect(Buffer.compare(plain, dated)).not.toBe(0);
    // Same white label in the bottom-left corner as the schedule's (see pipeline.test.ts).
    const { data, info } = await sharp(dated).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const inset = Math.round(Math.min(info.width, info.height) * 0.04);
    expect(px(inset + 12, info.height - inset - 20).every((c) => c > 240)).toBe(true);

    const res = await app.inject({ method: 'POST', url: `/api/frames/${id}/display`, payload: { imageId, fit: 'cover', showDate: true } });
    expect(res.json()).toEqual({ method: 'queued' });
    expect(db.select().from(schema.frames).where(eq(schema.frames.id, id)).get()!.pendingOpts).toMatchObject({ showDate: true });
  });
});
