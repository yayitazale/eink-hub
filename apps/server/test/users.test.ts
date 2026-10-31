import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-users-'));
process.env.DATA_DIR = dataDir;
delete process.env.AUTH_DISABLED;
delete process.env.ADMIN_PASSWORD;

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema, migrations } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');
const { adminOnly } = await import('../src/auth/index.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });

afterAll(async () => {
  await app.close();
});

/** The session cookie a response set, ready for a `cookie` header. */
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => {
  const c = res.cookies.find((c) => c.name === 'b8hub_session');
  if (!c) throw new Error('no session cookie');
  return `b8hub_session=${c.value}`;
};

const tokenOf = (url: string) => url.split('/invite/')[1];

describe('migration v10', () => {
  it('turns the admin password into the "admin" account and keeps open sessions', () => {
    const file = path.join(dataDir, 'old.db');
    const old = new Database(file);
    for (const m of migrations.slice(0, 9)) old.exec(m);
    old.pragma('user_version = 9');
    old.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('auth.hash', 'scrypt$salt$key');
    old.prepare('INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)').run('s1', 1, Date.now() + 1000);
    old.close();

    const migrated = openDb(file);
    const users = migrated.select().from(schema.users).all();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: 'admin', role: 'admin', passwordHash: 'scrypt$salt$key' });
    expect(migrated.select().from(schema.sessions).get()?.userId).toBe(users[0].id);
    expect(migrated.select().from(schema.settings).where(eq(schema.settings.key, 'auth.hash')).get()).toBeUndefined();
  });
});

describe('admin-only routes', () => {
  it.each([
    ['PUT', '/api/settings', true],
    ['GET', '/api/settings', false],
    ['POST', '/api/frames', true],
    ['GET', '/api/frames', false],
    ['PATCH', '/api/frames/3', true],
    ['DELETE', '/api/frames/3', true],
    ['POST', '/api/frames/3/display', false],
    ['POST', '/api/frames/3/actions/wake', false],
    ['POST', '/api/frames/3/pull', true],
    ['GET', '/api/frames/3/log', true],
    ['GET', '/api/logs?limit=5', true],
    ['POST', '/api/settings/immich/test', true],
    ['PUT', '/api/frames/3/assignment', false],
    ['POST', '/api/images', false],
    ['GET', '/api/users', true],
    ['POST', '/api/invites', true],
  ])('%s %s → admin only: %s', (method, url, expected) => {
    expect(adminOnly(method, url)).toBe(expected);
  });
});

describe('accounts and invites', () => {
  let admin: string;
  let member: string;
  let memberId: number;

  beforeAll(async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'Ana', password: 'secret1' } });
    expect(res.statusCode).toBe(200);
    admin = cookieOf(res);
  });

  it('reports the signed-in user', async () => {
    const me = (await app.inject({ url: '/api/auth/me', headers: { cookie: admin } })).json();
    expect(me).toMatchObject({ authenticated: true, setupRequired: false, user: { username: 'Ana', role: 'admin' } });
  });

  it('signs in by username, ignoring case, and rejects a wrong password', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ana', password: 'secret1' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ana', password: 'nope00' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'ghost', password: 'secret1' } })).statusCode).toBe(401);
  });

  it('signs up a member from a one-time invite', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie: admin, host: 'hub.test' }, payload: { role: 'member' } })).json();
    expect(created.url).toMatch(/^http:\/\/hub\.test\/invite\//);
    expect(created.qr).toContain('<svg');
    const token = tokenOf(created.url);

    expect((await app.inject({ url: `/api/auth/invite/${token}` })).json()).toEqual({ valid: true, role: 'member', username: null });
    const res = await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { username: 'luis', password: 'secret2' } });
    expect(res.statusCode).toBe(200);
    member = cookieOf(res);
    memberId = db.select().from(schema.users).where(eq(schema.users.username, 'luis')).get()!.id;

    // Used once: gone.
    expect((await app.inject({ url: `/api/auth/invite/${token}` })).json()).toEqual({ valid: false });
    const again = await app.inject({ method: 'POST', url: `/api/auth/invite/${token}`, payload: { username: 'eva', password: 'secret3' } });
    expect(again.statusCode).toBe(410);
  });

  it('rejects an expired invite and a taken username', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie: admin }, payload: { role: 'member' } })).json();
    const taken = await app.inject({ method: 'POST', url: `/api/auth/invite/${tokenOf(url)}`, payload: { username: 'LUIS', password: 'secret3' } });
    expect(taken.statusCode).toBe(409);
    db.update(schema.invites).set({ expiresAt: Date.now() - 1 }).run();
    const expired = await app.inject({ method: 'POST', url: `/api/auth/invite/${tokenOf(url)}`, payload: { username: 'eva', password: 'secret3' } });
    expect(expired.statusCode).toBe(410);
  });

  it('lets a member use the hub but not change it', async () => {
    const as = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
      app.inject({ method, url, headers: { cookie: member }, payload }).then((r) => r.statusCode);
    expect(await as('GET', '/api/frames')).toBe(200);
    expect(await as('GET', '/api/collections')).toBe(200);
    expect(await as('GET', '/api/settings')).toBe(200);
    expect(await as('PUT', '/api/settings', { language: 'en' })).toBe(403);
    expect(await as('POST', '/api/frames', { host: '127.0.0.1:1' })).toBe(403);
    expect(await as('GET', '/api/users')).toBe(403);
    expect(await as('POST', '/api/invites', { role: 'admin' })).toBe(403);
  });

  it('never leaves the hub without an admin', async () => {
    const adminId = db.select().from(schema.users).where(eq(schema.users.username, 'Ana')).get()!.id;
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${adminId}`, headers: { cookie: admin }, payload: { role: 'member' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${adminId}`, headers: { cookie: admin } })).statusCode).toBe(409);
    // With a second admin, the first can step down.
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${memberId}`, headers: { cookie: admin }, payload: { role: 'admin' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${adminId}`, headers: { cookie: admin }, payload: { role: 'member' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/users/${adminId}`, headers: { cookie: member }, payload: { role: 'admin' } })).statusCode).toBe(200);
  });

  it('resets an account with a link that signs it out elsewhere', async () => {
    const { url } = (await app.inject({ method: 'POST', url: `/api/users/${memberId}/reset`, headers: { cookie: admin } })).json();
    expect((await app.inject({ url: `/api/auth/invite/${tokenOf(url)}` })).json()).toMatchObject({ valid: true, username: 'luis' });
    const res = await app.inject({ method: 'POST', url: `/api/auth/invite/${tokenOf(url)}`, payload: { password: 'newpass' } });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: member } })).json().authenticated).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'luis', password: 'newpass' } })).statusCode).toBe(200);
  });

  it('deleting a user ends their sessions', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie: admin }, payload: { role: 'member' } })).json();
    const eva = cookieOf(await app.inject({ method: 'POST', url: `/api/auth/invite/${tokenOf(url)}`, payload: { username: 'eva', password: 'secret3' } }));
    const evaId = db.select().from(schema.users).where(eq(schema.users.username, 'eva')).get()!.id;
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${evaId}`, headers: { cookie: admin } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/frames', headers: { cookie: eva } })).statusCode).toBe(401);
  });
});
