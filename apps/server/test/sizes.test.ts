import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-sizes-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { inferDiagonal } = await import('../src/device/sizes.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });

afterAll(async () => {
  await app.close();
});

describe('inferDiagonal', () => {
  it('reads the E Ink part number', () => {
    expect(inferDiagonal({ model: 'EL133UF1', width: 1, height: 1 })).toBe(13.3);
    expect(inferDiagonal({ model: 'EL073TF1', width: 1, height: 1 })).toBe(7.3);
    expect(inferDiagonal({ model: 'EL285QF1', width: 1, height: 1 })).toBe(28.5);
  });

  it('reads inches from the model name', () => {
    expect(inferDiagonal({ model: 'AI Art Frame 31.5"', width: 1, height: 1 })).toBe(31.5);
  });

  it('falls back to known resolutions, then gives up', () => {
    expect(inferDiagonal({ model: null, width: 800, height: 480 })).toBe(7.3);
    expect(inferDiagonal({ model: 'FAKE', width: 1200, height: 1600 })).toBe(13.3);
    expect(inferDiagonal({ model: null, width: 2160, height: 3060 })).toBe(28.5);
    expect(inferDiagonal({ model: null, width: 600, height: 448 })).toBeNull();
  });
});

describe('frame size and appearance', () => {
  const insert = () =>
    db
      .insert(schema.frames)
      .values({ name: 'Test', host: '127.0.0.1:1', model: 'EL133UF1', upstreamToken: String(Math.random()), createdAt: Date.now() })
      .returning()
      .get();

  it('exposes the inferred size until one is set by hand', async () => {
    const f = insert();
    let res = await app.inject({ url: `/api/frames/${f.id}` });
    expect(res.json()).toMatchObject({ diagonal: 13.3, diagonalInferred: true, appearance: {} });

    res = await app.inject({ method: 'PATCH', url: `/api/frames/${f.id}`, payload: { diagonal: 28.54 } });
    expect(res.json()).toMatchObject({ diagonal: 28.5, diagonalInferred: false });

    res = await app.inject({ method: 'PATCH', url: `/api/frames/${f.id}`, payload: { diagonal: 2 } });
    expect(res.statusCode).toBe(400);

    res = await app.inject({ method: 'PATCH', url: `/api/frames/${f.id}`, payload: { diagonal: null } });
    expect(res.json()).toMatchObject({ diagonal: 13.3, diagonalInferred: true });
  });

  it('merges valid appearance fields and ignores the rest', async () => {
    const f = insert();
    let res = await app.inject({ method: 'PATCH', url: `/api/frames/${f.id}`, payload: { appearance: { color: 'walnut', style: 'classic' } } });
    expect(res.json().appearance).toEqual({ color: 'walnut', style: 'classic' });

    res = await app.inject({ method: 'PATCH', url: `/api/frames/${f.id}`, payload: { appearance: { mat: false, color: 'pink', style: 'baroque' } } });
    expect(res.json().appearance).toEqual({ color: 'walnut', style: 'classic', mat: false });
  });
});
