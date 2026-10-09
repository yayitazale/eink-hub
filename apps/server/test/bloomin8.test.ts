import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-bloomin8-'));
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { startSimulator } = await import('../src/device/simulator.js');
const { Bloomin8Driver, HUB_GALLERY } = await import('../src/device/drivers/bloomin8.js');
const { stillAwake } = await import('../src/routes/frames.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });

afterAll(async () => {
  vi.useRealTimers();
  await app.close();
});

describe('BLOOMIN8 hub gallery', () => {
  it('keeps only the newest 20 pushed pictures on the Canvas', async () => {
    const sim = await startSimulator({ port: 0, host: '127.0.0.1', logger: app.log });
    const driver = new Bloomin8Driver({ host: `127.0.0.1:${sim.port}` });
    const buf = await sharp({ create: { width: 12, height: 16, channels: 3, background: '#888' } }).jpeg().toBuffer();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 1; i <= 25; i++) {
        vi.setSystemTime(new Date(2026, 9, 9, 10, i));
        await driver.show({ buf, deviceName: `h${i}.jpg`, hash: String(i), file: '', ext: 'jpg' });
      }
    } finally {
      vi.useRealTimers();
    }
    const g = await driver.client.gallery(HUB_GALLERY, 0, 200);
    const names = g.data.map((d) => d.name).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    expect(names).toEqual(Array.from({ length: 20 }, (_, i) => `h${i + 6}.jpg`));
    await sim.close();
  });
});

describe('BLOOMIN8 sleep state', () => {
  const now = 1_800_000_000_000;
  const seen = (secondsAgo: number) => ({ online: true, lastSeen: now - secondsAgo * 1000, lastInfo: { max_idle: 120 } });

  it('counts a Canvas as asleep once max_idle has passed since it last answered', () => {
    expect(stillAwake(seen(60), now)).toBe(true);
    expect(stillAwake(seen(121), now)).toBe(false);
    expect(stillAwake({ ...seen(60), online: false }, now)).toBe(false);
    // Unknown idle time: trust the last answer.
    expect(stillAwake({ ...seen(3600), lastInfo: {} }, now)).toBe(true);
  });

  it('reports a Canvas that stopped answering as asleep, and Sleep on it as done', async () => {
    const id = db
      .insert(schema.frames)
      .values({ name: 'Asleep', host: '127.0.0.1:1', upstreamToken: 'asleep', mode: 'push', online: true, lastSeen: Date.now() - 600_000, lastInfo: { max_idle: 120 }, createdAt: Date.now() })
      .returning()
      .get().id;
    expect((await app.inject({ url: `/api/frames/${id}` })).json().online).toBe(false);
    const res = await app.inject({ method: 'POST', url: `/api/frames/${id}/actions/sleep` });
    expect(res.statusCode).toBe(200);
  });
});
