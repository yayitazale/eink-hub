import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImmichAsset } from '../src/immich/client.js';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-location-'));
process.env.AUTH_DISABLED = 'true';

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema, setSetting } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { locationText, photoCaption, upsertImmichAssets, withLocation } = await import('../src/lib/images.js');

const db = (ensureDirs(), openDb(config.dbPath));
const at = (y: number, m: number, d: number) => ({ takenAt: Date.UTC(y, m - 1, d, 12) });
const rowOf = (assetId: string) => db.select().from(schema.images).all().find((i) => i.immichAssetId === assetId)!;

describe('locationText', () => {
  const rome = { city: 'Rome', country: 'Italy' };
  const home = { city: 'Boechout', country: 'Belgium' };

  it('is empty unless a location mode is on', () => {
    expect(locationText(rome, 'off')).toBeNull();
    expect(locationText(rome, undefined)).toBeNull();
    expect(locationText(rome, 'whatever' as never)).toBeNull();
  });
  it('shows the city, or the city and country', () => {
    expect(locationText(rome, 'city')).toBe('Rome');
    expect(locationText(rome, 'city_country')).toBe('Rome, Italy');
  });
  it('leaves out the home country only when asked to, ignoring case and accents', () => {
    expect(locationText(home, 'city_country')).toBe('Boechout, Belgium');
    expect(locationText(home, 'city_country', { hideHomeCountry: true, homeCountry: 'belgium' })).toBe('Boechout');
    expect(locationText({ city: 'Zürich', country: 'Österreich' }, 'city_country', { hideHomeCountry: true, homeCountry: 'osterreich' })).toBe('Zürich');
    expect(locationText(home, 'city_country', { hideHomeCountry: true })).toBe('Boechout, Belgium');
    expect(locationText(rome, 'city_country', { hideHomeCountry: true, homeCountry: 'Belgium' })).toBe('Rome, Italy');
  });
  it('falls back to the country when Immich knows no city, unless it is the hidden home country', () => {
    expect(locationText({ city: '', country: 'Norway' }, 'city')).toBe('Norway');
    expect(locationText({ city: null, country: 'Belgium' }, 'city', { hideHomeCountry: true, homeCountry: 'Belgium' })).toBeNull();
  });
  it('is empty when there is no location at all', () => {
    expect(locationText({ city: null, country: null }, 'city_country')).toBeNull();
    expect(locationText({ city: '', country: '' }, 'city')).toBeNull();
  });
});

describe('photoCaption', () => {
  const img = { ...at(2019, 10, 6), city: 'Rome', country: 'Italy' };

  it('keeps the date-only caption unchanged', () => {
    expect(photoCaption(img, { lang: 'en', showDate: true })).toBe('6 October 2019');
    expect(photoCaption(img, { lang: 'en', showDate: false })).toBeNull();
  });
  it('joins date and location', () => {
    expect(photoCaption(img, { lang: 'en', showDate: true, location: 'city_country' })).toBe('6 October 2019 · Rome, Italy');
  });
  it('shows the location alone when the date is off', () => {
    expect(photoCaption(img, { lang: 'en', location: 'city' })).toBe('Rome');
  });
  it('adds the location to the "on this day" caption', () => {
    const now = new Date();
    const memory = { takenAt: Date.UTC(now.getFullYear() - 3, 0, 1, 12), city: 'Rome', country: 'Italy' };
    expect(photoCaption(memory, { lang: 'en', showDate: true, memories: true, location: 'city' })).toMatch(/3 years ago · Rome$/);
  });
  it('skips the date part when the photo has no date', () => {
    expect(photoCaption({ takenAt: null, city: 'Rome', country: 'Italy' }, { lang: 'en', showDate: true, location: 'city' })).toBe('Rome');
  });
});

describe('storing the location from Immich', () => {
  it('stores city and country, and "" when Immich knows none', () => {
    upsertImmichAssets(db, [
      { id: 'rome', type: 'IMAGE', exifInfo: { city: 'Rome', country: 'Italy' } },
      { id: 'sea', type: 'IMAGE', exifInfo: { city: null, country: null } },
    ]);
    expect([rowOf('rome').city, rowOf('rome').country]).toEqual(['Rome', 'Italy']);
    expect([rowOf('sea').city, rowOf('sea').country]).toEqual(['', '']);
  });
  it('leaves the location unknown (NULL) when the payload says nothing about it', () => {
    upsertImmichAssets(db, [
      { id: 'bare', type: 'IMAGE' },
      { id: 'sizes-only', type: 'IMAGE', exifInfo: { exifImageWidth: 100, exifImageHeight: 50 } },
    ]);
    expect([rowOf('bare').city, rowOf('bare').country]).toEqual([null, null]);
    expect([rowOf('sizes-only').city, rowOf('sizes-only').country]).toEqual([null, null]);
  });
  it('does not wipe a known location when an asset is re-imported by bare id', () => {
    upsertImmichAssets(db, [{ id: 'rome', type: 'IMAGE' }]);
    expect([rowOf('rome').city, rowOf('rome').country]).toEqual(['Rome', 'Italy']);
  });
});

describe('looking up a missing location', () => {
  const immich = Fastify();
  const hits: string[] = [];
  const ctx = { db, log: { debug() {} } } as unknown as Parameters<typeof withLocation>[0];

  beforeAll(async () => {
    immich.get<{ Params: { id: string } }>('/api/assets/:id', async (req, reply) => {
      hits.push(req.params.id);
      if (req.params.id === 'broken') return reply.code(500).send({ message: 'boom' });
      const asset: ImmichAsset = { id: req.params.id, type: 'IMAGE', exifInfo: req.params.id === 'lookup-none' ? { city: null, country: null } : { city: 'Ghent', country: 'Belgium' } };
      return asset;
    });
    setSetting(db, 'immich.url', await immich.listen({ port: 0, host: '127.0.0.1' }));
    setSetting(db, 'immich.apiKey', 'test');
  });
  afterAll(() => immich.close());

  it('asks Immich once and remembers the answer', async () => {
    upsertImmichAssets(db, [{ id: 'lookup-1', type: 'IMAGE' }]);
    const first = await withLocation(ctx, rowOf('lookup-1'));
    expect([first.city, first.country]).toEqual(['Ghent', 'Belgium']);
    expect([rowOf('lookup-1').city, rowOf('lookup-1').country]).toEqual(['Ghent', 'Belgium']);
    await withLocation(ctx, rowOf('lookup-1'));
    expect(hits.filter((h) => h === 'lookup-1')).toHaveLength(1);
  });
  it('remembers "no location" too', async () => {
    upsertImmichAssets(db, [{ id: 'lookup-none', type: 'IMAGE' }]);
    await withLocation(ctx, rowOf('lookup-none'));
    await withLocation(ctx, rowOf('lookup-none'));
    expect([rowOf('lookup-none').city, rowOf('lookup-none').country]).toEqual(['', '']);
    expect(hits.filter((h) => h === 'lookup-none')).toHaveLength(1);
  });
  it('does not ask for local uploads', async () => {
    const local = db.insert(schema.images).values({ source: 'local', createdAt: Date.now() }).returning().get();
    expect(await withLocation(ctx, local)).toBe(local);
  });
  it('keeps going when Immich is unreachable, and retries next time', async () => {
    upsertImmichAssets(db, [{ id: 'broken', type: 'IMAGE' }]);
    const img = await withLocation(ctx, rowOf('broken'));
    expect([img.city, img.country]).toEqual([null, null]);
    expect([rowOf('broken').city, rowOf('broken').country]).toEqual([null, null]);
  });
});

describe('settings and assignment options', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  beforeAll(async () => {
    app = (await buildApp(db, { logger: false })).app;
  });
  afterAll(() => app.close());

  it('stores the home country', async () => {
    expect((await app.inject({ url: '/api/settings' })).json().homeCountry).toBe('');
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { homeCountry: '  Belgium ' } });
    expect((await app.inject({ url: '/api/settings' })).json().homeCountry).toBe('Belgium');
  });

  it('saves the location options on an assignment, and keeps them for older clients', async () => {
    const frame = db.insert(schema.frames).values({ name: 'Test', host: '127.0.0.1:1', upstreamToken: 'location-test', mode: 'push', createdAt: Date.now() }).returning().get();
    const col = (await app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Manual', type: 'manual' } })).json();
    const put = async (payload: object) =>
      (await app.inject({ method: 'PUT', url: `/api/frames/${frame.id}/assignment`, payload: { collectionId: col.id, ...payload } })).json();

    expect(await put({})).toMatchObject({ showLocation: 'off', hideHomeCountry: false });
    expect(await put({ showLocation: 'city_country', hideHomeCountry: true })).toMatchObject({ showLocation: 'city_country', hideHomeCountry: true });
    expect(await put({ fit: 'contain' })).toMatchObject({ showLocation: 'city_country', hideHomeCountry: true });
    expect(await put({ showLocation: 'nonsense' })).toMatchObject({ showLocation: 'city_country' });
  });
});
