import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-drivers-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema, setSetting } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { saveLocalUpload } = await import('../src/lib/images.js');
const { ditherToPalette, encodeBmp, PALETTES } = await import('../src/imaging/dither.js');
const { signHeaders } = await import('../src/device/drivers/switchbot.js');
const { TRMNL_PATHS, batteryPercent } = await import('../src/upstream/trmnl.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });
let imageId: number;

beforeAll(async () => {
  const photo = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#3d85c6' } }).jpeg().toBuffer();
  imageId = (await saveLocalUpload(db, photo, 'blue.jpg')).id;
});

afterAll(async () => {
  await app.close();
});

describe('dithering and encoders', () => {
  it('only uses palette colours', () => {
    const rgb = new Uint8Array(4 * 4 * 3).fill(128);
    const idx = ditherToPalette(rgb, 4, 4, PALETTES.bw);
    expect(new Set(idx)).toEqual(new Set([0, 1]));
  });

  it('writes a 1-bit BMP with a black/white colour table', () => {
    const rgb = Buffer.alloc(10 * 2 * 3, 255);
    const bmp = encodeBmp(rgb, 10, 2, true);
    expect(bmp.toString('ascii', 0, 2)).toBe('BM');
    expect(bmp.readUInt16LE(28)).toBe(1);
    expect(bmp.readInt32LE(18)).toBe(10);
    // Rows padded to 4 bytes: 2 rows × 4 bytes after a 62-byte header.
    expect(bmp.length).toBe(62 + 8);
    expect(bmp[62]).toBe(0xff);
  });
});

describe('Open Frame protocol', () => {
  let token: string;
  let frameId: number;
  const poll = (q = '') =>
    app.inject({ url: `/of/v1/display${q}`, headers: { authorization: `Bearer ${token}`, host: 'hub.local:8080' } }).then((r) => r.json());

  it('adds a DIY frame with a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/frames', payload: { kind: 'openframe', name: 'ESP32', width: 800, height: 480 } });
    expect(res.statusCode).toBe(200);
    const f = res.json();
    expect(f).toMatchObject({ kind: 'openframe', mode: 'pull', width: 480, height: 800, orientation: 'landscape' });
    expect(f.capabilities).toMatchObject({ push: false, pull: true });
    expect(f.wakeModel).toBe('scheduled-pull');
    token = f.upstreamToken;
    frameId = f.id;
  });

  it('rejects unknown tokens', async () => {
    const res = await app.inject({ url: '/of/v1/display', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('sends the welcome picture first, in the format the frame asks for', async () => {
    const body = await poll('?w=800&h=480&format=png&palette=spectra6&battery=88&fw=1.0');
    expect(body).toMatchObject({ action: 'show', format: 'png', palette: 'spectra6', width: 800, height: 480 });
    expect(body.image_url).toMatch(/^http:\/\/hub\.local:8080\/u\/img\/.+_L\.png$/);
    const img = await app.inject({ url: new URL(body.image_url).pathname });
    expect(img.headers['content-type']).toBe('image/png');
    const meta = await sharp(img.rawPayload).metadata();
    expect([meta.width, meta.height]).toEqual([800, 480]);
    const f = (await app.inject({ url: `/api/frames/${frameId}` })).json();
    expect(f.battery).toBe(88);
    expect(f.firmware).toBe('1.0');
  });

  it('then nothing, with a sleep capped to the maximum poll interval', async () => {
    const body = await poll();
    expect(body.action).toBe('none');
    expect(body.next_poll_s).toBeGreaterThanOrEqual(60);
    expect(body.next_poll_s).toBeLessThanOrEqual(3600);
  });

  it('keeps the Wi-Fi, address and storage the frame reports, under the same keys as a BLOOMIN8', async () => {
    await poll('?ssid=Casa%20WiFi&ip=192.168.1.42&storage_free=7000000000&storage_total=8000000000&fw=1.2');
    const f = (await app.inject({ url: `/api/frames/${frameId}` })).json();
    expect(f.lastInfo).toMatchObject({ sta_ssid: 'Casa WiFi', sta_ip: '192.168.1.42', free_size: 7e9, total_size: 8e9 });
    expect(f.firmware).toBe('1.2');
    // Junk is dropped rather than shown.
    await poll('?ip=not%20an%20ip&storage_free=-5');
    const g = (await app.inject({ url: `/api/frames/${frameId}` })).json();
    expect(g.lastInfo.sta_ip).toBeUndefined();
    expect(g.lastInfo.free_size).toBeUndefined();
    expect(g.lastInfo.sta_ssid).toBe('Casa WiFi');
  });

  it('queues a photo sent by hand and delivers it on the next poll', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/frames/${frameId}/display`, payload: { imageId } });
    expect(res.json()).toEqual({ method: 'queued' });
    const body = await poll();
    expect(body.action).toBe('show');
    // Dithered to the six Spectra colours.
    const img = await app.inject({ url: new URL(body.image_url).pathname });
    const { data } = await sharp(img.rawPayload).raw().toBuffer({ resolveWithObject: true });
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 3) colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    const allowed = new Set(PALETTES.spectra6.map((c) => c.join(',')));
    expect([...colours].every((c) => allowed.has(c))).toBe(true);
    expect((await poll(`?current=${body.id}`)).action).toBe('none');
  });

  it('pokes an always-on frame when a photo is sent', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url} ${(init.headers as Record<string, string>).authorization}`);
      return new Response('ok');
    });
    await poll('?notify_url=http://192.168.1.50:8080/of/v1/notify');
    await app.inject({ method: 'POST', url: `/api/frames/${frameId}/display`, payload: { imageId } });
    vi.unstubAllGlobals();
    expect(calls).toEqual([`POST http://192.168.1.50:8080/of/v1/notify Bearer ${token}`]);
  });

  it('refuses BLOOMIN8-only features', async () => {
    expect((await app.inject({ url: `/api/frames/${frameId}/galleries` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/frames/${frameId}/actions/wake` })).statusCode).toBe(400);
  });
});

describe('TRMNL BYOS', () => {
  const mac = 'AA:BB:CC:DD:EE:FF';

  it('only exempts the device paths from the session check', () => {
    expect(TRMNL_PATHS.test('/api/display')).toBe(true);
    expect(TRMNL_PATHS.test('/api/setup?x=1')).toBe(true);
    expect(TRMNL_PATHS.test('/api/log')).toBe(true);
    expect(TRMNL_PATHS.test('/api/logs')).toBe(false);
    expect(TRMNL_PATHS.test('/api/logs/download')).toBe(false);
  });

  it('converts battery voltage to a percentage', () => {
    expect(batteryPercent('4.2')).toBe(100);
    expect(batteryPercent('3.6')).toBe(50);
    expect(batteryPercent('77')).toBe(77);
    expect(batteryPercent('')).toBeNull();
  });

  it('sets up a device added by MAC and serves it 1-bit BMPs', async () => {
    expect((await app.inject({ url: '/api/setup', headers: { id: mac } })).json().status).toBe(404);
    const added = (await app.inject({ method: 'POST', url: '/api/frames', payload: { kind: 'trmnl', mac: mac.toLowerCase() } })).json();
    expect(added.deviceId).toBe(mac);

    const setup = (await app.inject({ url: '/api/setup', headers: { id: mac } })).json();
    expect(setup.status).toBe(200);
    const headers = { 'access-token': setup.api_key, id: mac, width: '800', height: '480', 'battery-voltage': '3.9', host: 'hub.local' };
    const first = (await app.inject({ url: '/api/display', headers })).json();
    expect(first.status).toBe(0);
    expect(first.image_url).toMatch(/\.bmp$/);
    const img = await app.inject({ url: new URL(first.image_url).pathname });
    expect(img.headers['content-type']).toBe('image/bmp');
    expect(img.rawPayload.readUInt16LE(28)).toBe(1);
    expect([img.rawPayload.readInt32LE(18), img.rawPayload.readInt32LE(22)]).toEqual([800, 480]);

    // Nothing new: same filename, so the firmware keeps what it shows.
    const second = (await app.inject({ url: '/api/display', headers })).json();
    expect(second.filename).toBe(first.filename);
    expect(second.refresh_rate).toBeLessThanOrEqual(3600);
    expect((await app.inject({ url: '/api/display', headers: { 'access-token': 'nope' } })).json().status).toBe(202);
  });
});

describe('SwitchBot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs requests with HMAC-SHA256 of token + t + nonce', () => {
    const h = signHeaders('tok', 'sec', 1700000000000, 'n-1');
    expect(h.sign).toBe(crypto.createHmac('sha256', 'sec').update('tok1700000000000n-1').digest('base64'));
    expect(h).toMatchObject({ Authorization: 'tok', t: '1700000000000', nonce: 'n-1' });
  });

  it('needs a public https URL, then uploads through the cloud', async () => {
    const payload = { kind: 'switchbot', token: 'tok', secret: 'sec', deviceId: 'ART1', size: '13.3' };
    expect((await app.inject({ method: 'POST', url: '/api/frames', payload })).statusCode).toBe(400);
    setSetting(db, 'externalUrl', 'https://hub.example.com');

    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body as string | undefined });
      return new Response(JSON.stringify({ statusCode: 100, body: { battery: 70, imageUrl: '' } }));
    });
    const f = (await app.inject({ method: 'POST', url: '/api/frames', payload })).json();
    expect(f).toMatchObject({ kind: 'switchbot', battery: 70, width: 1200, height: 1600, wakeModel: 'cloud' });
    // Secrets are never sent back.
    expect(f.config.token).toBeUndefined();
    expect(f.config.secret).toBeUndefined();

    const res = await app.inject({ method: 'POST', url: `/api/frames/${f.id}/display`, payload: { imageId } });
    expect(res.json()).toEqual({ method: 'push' });
    const upload = calls.find((c) => c.url.endsWith('/devices/ART1/commands'))!;
    const body = JSON.parse(upload.body!);
    expect(body).toMatchObject({ commandType: 'command', command: 'uploadImage' });
    expect(body.parameter.imageUrl).toMatch(/^https:\/\/hub\.example\.com\/u\/img\/.+_L\.jpg$/);
    const hist = (await app.inject({ url: `/api/frames/${f.id}/history` })).json();
    expect(hist[0].success).toBeNull();

    const stored = db.select().from(schema.frames).all().find((x) => x.id === f.id)!;
    expect(stored.config.secret).toBe('sec');
  });
});
