import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_DISABLED = 'true';

/** A fake BlueZ: one adapter, Canvases that answer the wake pulse by calling `onPulse`. */
const bluez = {
  adapters: ['hci0'],
  powered: true,
  /** MACs BlueZ already knows; others only appear after discovery starts. */
  cached: new Set<string>(),
  nearby: new Set<string>(),
  discovering: false,
  writes: [] as { mac: string; char: string; bytes: number[] }[],
  disconnects: [] as string[],
  sessions: 0,
  connected: 0,
  maxConnected: 0,
  failConnect: false,
  onPulse: (_mac: string) => {},
};

function fakeDevice(mac: string) {
  return {
    async connect() {
      bluez.maxConnected = Math.max(bluez.maxConnected, ++bluez.connected);
      await new Promise((r) => setTimeout(r, 20));
      if (bluez.failConnect) throw new Error('le-connection-abort-by-local');
    },
    async disconnect() {
      bluez.connected--;
      bluez.disconnects.push(mac);
    },
    async gatt() {
      return {
        async getPrimaryService(uuid: string) {
          if (uuid !== '0000f000-0000-1000-8000-00805f9b34fb') throw new Error('Service not available');
          return {
            async getCharacteristic(char: string) {
              return {
                async writeValueWithoutResponse(buf: Buffer) {
                  bluez.writes.push({ mac, char, bytes: [...buf] });
                  if (buf[0] === 1) bluez.onPulse(mac);
                },
              };
            },
          };
        },
      };
    },
  };
}

const adapter = {
  isPowered: async () => bluez.powered,
  isDiscovering: async () => bluez.discovering,
  startDiscovery: async () => {
    bluez.discovering = true;
  },
  stopDiscovery: async () => {
    bluez.discovering = false;
  },
  async getDevice(mac: string) {
    if (!bluez.cached.has(mac)) throw new Error('Device not found');
    return fakeDevice(mac);
  },
  async waitDevice(mac: string) {
    if (bluez.discovering && bluez.nearby.has(mac)) return fakeDevice(mac);
    throw new Error('operation timed out');
  },
};

vi.mock('node-ble', () => ({
  createBluetooth: () => {
    bluez.sessions++;
    return {
      bluetooth: {
        dbus: new EventEmitter(),
        adapters: async () => bluez.adapters,
        getAdapter: async () => adapter,
        defaultAdapter: async () => adapter,
      },
      destroy: () => {},
    };
  },
}));

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { bleStatus, bleWake, normalizeMac, resetBle } = await import('../src/device/ble.js');
const { wakeFrame } = await import('../src/lib/wake.js');
const { startSimulator } = await import('../src/device/simulator.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app, ctx } = await buildApp(db, { logger: false });
// Stand-in for /run/dbus/system_bus_socket.
config.dbusSocket = path.join(dataDir, 'system_bus_socket');
fs.writeFileSync(config.dbusSocket, '');

const MAC = 'F4:90:42:16:3F:47';
const sims: { close: () => Promise<void> }[] = [];

afterAll(async () => {
  await Promise.all(sims.map((s) => s.close()));
  await app.close();
});

beforeEach(() => {
  resetBle();
  Object.assign(bluez, {
    adapters: ['hci0'],
    powered: true,
    discovering: false,
    writes: [],
    disconnects: [],
    connected: 0,
    maxConnected: 0,
    failConnect: false,
    onPulse: () => {},
  });
  bluez.cached = new Set([MAC]);
  bluez.nearby = new Set();
  config.bleEnabled = true;
});

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

describe('normalizeMac', () => {
  it('accepts the deviceInfo form and common separators', () => {
    expect(normalizeMac('F49042163F47')).toBe(MAC);
    expect(normalizeMac('f4-90-42-16-3f-47')).toBe(MAC);
    expect(normalizeMac(MAC)).toBe(MAC);
  });
  it('rejects anything else', () => {
    expect(normalizeMac('F4:90:42')).toBeNull();
    expect(normalizeMac(undefined)).toBeNull();
  });
});

describe('bleStatus', () => {
  it('reports why Bluetooth cannot be used', async () => {
    config.bleEnabled = false;
    expect(await bleStatus(true)).toEqual({ available: false, reason: 'disabled' });
    config.bleEnabled = true;

    const socket = config.dbusSocket;
    config.dbusSocket = path.join(dataDir, 'missing');
    expect(await bleStatus(true)).toEqual({ available: false, reason: 'no_dbus' });
    config.dbusSocket = socket;

    bluez.adapters = [];
    expect(await bleStatus(true)).toEqual({ available: false, reason: 'no_adapter' });
    bluez.adapters = ['hci0'];

    bluez.powered = false;
    expect(await bleStatus(true)).toMatchObject({ available: false, reason: 'powered_off' });
    bluez.powered = true;

    expect(await bleStatus(true)).toEqual({ available: true, adapter: 'hci0' });
  });

  it('is exposed to the UI', async () => {
    const res = await app.inject({ url: '/api/ble/status?refresh=1' });
    expect(res.json()).toEqual({ available: true, adapter: 'hci0' });
  });
});

describe('bleWake', () => {
  it('sends the 0x01/0x00 pulse to 0xF001 and disconnects', async () => {
    const r = await bleWake('F49042163F47');
    expect(r.skipped).toBe(false);
    expect(bluez.writes).toEqual([
      { mac: MAC, char: '0000f001-0000-1000-8000-00805f9b34fb', bytes: [1] },
      { mac: MAC, char: '0000f001-0000-1000-8000-00805f9b34fb', bytes: [0] },
    ]);
    expect(bluez.disconnects).toEqual([MAC]);
  });

  it('does not pulse the same frame twice within the cooldown', async () => {
    await bleWake(MAC);
    expect((await bleWake(MAC)).skipped).toBe(true);
    expect(bluez.writes.filter((w) => w.bytes[0] === 1)).toHaveLength(1);
  });

  it('scans for a frame BlueZ has not seen yet, and stops scanning afterwards', async () => {
    bluez.cached.clear();
    bluez.nearby.add(MAC);
    await bleWake(MAC);
    expect(bluez.writes).toHaveLength(2);
    expect(bluez.discovering).toBe(false);
  });

  it('fails clearly when the frame is out of range', async () => {
    bluez.cached.clear();
    await expect(bleWake(MAC)).rejects.toThrow(/not found over Bluetooth/);
    expect(bluez.discovering).toBe(false);
  });

  it('always disconnects, even when the connection fails', async () => {
    bluez.failConnect = true;
    await expect(bleWake(MAC)).rejects.toThrow(/abort/);
    expect(bluez.disconnects).toEqual([MAC]);
  });

  it('runs one operation at a time', async () => {
    const other = 'AA:BB:CC:DD:EE:FF';
    bluez.cached.add(other);
    await Promise.all([bleWake(MAC), bleWake(other)]);
    expect(bluez.maxConnected).toBe(1);
    expect(bluez.writes).toHaveLength(4);
  });
});

describe('waking a frame', () => {
  const insert = (host: string, extra: Partial<typeof schema.frames.$inferInsert> = {}) =>
    db
      .insert(schema.frames)
      .values({ name: 'Sleepy', host, upstreamToken: `t-${Math.random()}`, createdAt: Date.now(), ...extra })
      .returning()
      .get();

  it('wakes an asleep frame and fills in its details once it answers', async () => {
    const port = await freePort();
    const frame = insert(`127.0.0.1:${port}`, { bleMac: MAC });
    // The frame "boots" its HTTP API when it receives the pulse.
    bluez.onPulse = () => {
      startSimulator({ port, host: '127.0.0.1', name: 'Woken', logger: app.log }).then((s) => sims.push(s));
    };
    const woken = await wakeFrame(ctx, frame, { settleMs: 50, budgetMs: 5000 });
    expect(woken.online).toBe(true);
    expect(woken.model).toBe('EL133UF1-fake');
    // deviceInfo.bt_mac from the simulator replaces the address.
    expect(woken.bleMac).toMatch(/^02:00:00:0/);
  });

  it('does not pulse a frame that is already awake', async () => {
    const sim = await startSimulator({ port: 0, host: '127.0.0.1', name: 'Awake', logger: app.log });
    sims.push(sim);
    const frame = insert(`127.0.0.1:${sim.port}`, { bleMac: MAC });
    await wakeFrame(ctx, frame);
    expect(bluez.writes).toHaveLength(0);
  });

  it('explains what is missing through the wake action', async () => {
    const port = await freePort();
    const noMac = insert(`127.0.0.1:${port}`);
    let res = await app.inject({ method: 'POST', url: `/api/frames/${noMac.id}/actions/wake`, headers: { 'x-hub-lang': 'en' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Bluetooth address/);

    const withMac = insert(`127.0.0.1:${port}`, { bleMac: MAC });
    bluez.adapters = [];
    await bleStatus(true);
    res = await app.inject({ method: 'POST', url: `/api/frames/${withMac.id}/actions/wake`, headers: { 'x-hub-lang': 'en' } });
    expect(res.statusCode).toBe(503);
  });

  it('validates and normalizes the address on PATCH', async () => {
    const frame = insert('127.0.0.1:1');
    let res = await app.inject({ method: 'PATCH', url: `/api/frames/${frame.id}`, payload: { bleMac: 'f49042163f47', bleAutoWake: true } });
    expect(res.json()).toMatchObject({ bleMac: MAC, bleAutoWake: true });
    res = await app.inject({ method: 'PATCH', url: `/api/frames/${frame.id}`, payload: { bleMac: 'nope' } });
    expect(res.statusCode).toBe(400);
    res = await app.inject({ method: 'PATCH', url: `/api/frames/${frame.id}`, payload: { bleMac: '' } });
    expect(res.json().bleMac).toBeNull();
  });

  it('auto-wakes before showing a photo instead of queueing it', { timeout: 20_000 }, async () => {
    const sharp = (await import('sharp')).default;
    const { saveLocalUpload } = await import('../src/lib/images.js');
    const photo = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#3d405b' } }).jpeg().toBuffer();
    const imageId = (await saveLocalUpload(db, photo, 'wake.jpg')).id;

    const port = await freePort();
    const frame = insert(`127.0.0.1:${port}`, { bleMac: MAC, bleAutoWake: true, welcomeShown: true });
    bluez.onPulse = () => {
      startSimulator({ port, host: '127.0.0.1', name: 'Auto', logger: app.log }).then((s) => sims.push(s));
    };
    const res = await app.inject({ method: 'POST', url: `/api/frames/${frame.id}/display`, payload: { imageId } });
    expect(res.json()).toEqual({ method: 'push' });
    expect(bluez.writes.filter((w) => w.bytes[0] === 1)).toHaveLength(1);
  });

  it('still queues when auto-wake is off', async () => {
    const { saveLocalUpload } = await import('../src/lib/images.js');
    const sharp = (await import('sharp')).default;
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#81b29a' } }).jpeg().toBuffer();
    const imageId = (await saveLocalUpload(db, photo, 'queued.jpg')).id;
    const frame = insert(`127.0.0.1:${await freePort()}`, { bleMac: MAC });
    const res = await app.inject({ method: 'POST', url: `/api/frames/${frame.id}/display`, payload: { imageId } });
    expect(res.json()).toEqual({ method: 'queued' });
    expect(bluez.writes).toHaveLength(0);
  });

  it('delivers the queued photo as soon as the Canvas is found awake (woken by the phone)', { timeout: 20_000 }, async () => {
    const { saveLocalUpload } = await import('../src/lib/images.js');
    const sharp = (await import('sharp')).default;
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#e07a5f' } }).jpeg().toBuffer();
    const imageId = (await saveLocalUpload(db, photo, 'later.jpg')).id;
    const port = await freePort();
    const frame = insert(`127.0.0.1:${port}`, { bleMac: MAC, welcomeShown: true });
    const queued = await app.inject({ method: 'POST', url: `/api/frames/${frame.id}/display`, payload: { imageId } });
    expect(queued.json()).toEqual({ method: 'queued' });

    // Woken from elsewhere: the UI's refresh finds it awake.
    sims.push(await startSimulator({ port, host: '127.0.0.1', name: 'Phone', logger: app.log }));
    const f = (await app.inject({ method: 'POST', url: `/api/frames/${frame.id}/refresh` })).json();
    expect(f).toMatchObject({ online: true, pendingImageId: null, currentImageId: imageId });
    const history = (await app.inject({ url: `/api/frames/${frame.id}/history` })).json();
    expect(history[0]).toMatchObject({ imageId, method: 'push', success: true });
  });
});
