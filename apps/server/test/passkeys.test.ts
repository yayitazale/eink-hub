import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-passkeys-'));
process.env.DATA_DIR = dataDir;
delete process.env.AUTH_DISABLED;
delete process.env.ADMIN_PASSWORD;

const { ensureDirs, config } = await import('../src/config.js');
const { openDb, schema } = await import('../src/db/index.js');
const { buildApp } = await import('../src/app.js');

ensureDirs();
const db = openDb(config.dbPath);
const { app } = await buildApp(db, { logger: false });

afterAll(async () => {
  await app.close();
});

const cookie = (res: { cookies: { name: string; value: string }[] }, name: string) => {
  const c = res.cookies.find((c) => c.name === name);
  if (!c) throw new Error(`no ${name} cookie`);
  return `${name}=${c.value}`;
};

const fakeAssertion = (id: string) => ({
  id,
  rawId: id,
  type: 'public-key',
  response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA' },
  clientExtensionResults: {},
});

describe('passkeys', () => {
  let session: string;
  let userId: number;

  beforeAll(async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'ana', password: 'secret1' } });
    session = cookie(res, 'b8hub_session');
    userId = db.select().from(schema.users).get()!.id;
    db.insert(schema.passkeys)
      .values({ id: 'cred-1', userId, publicKey: Buffer.from([1, 2, 3]), rpId: 'hub.test', name: 'iPhone', createdAt: Date.now() })
      .run();
  });

  it('needs a session to register or list passkeys', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/passkeys/register/options' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/passkeys' })).statusCode).toBe(401);
  });

  it('offers registration for the hostname being browsed, excluding passkeys already there', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/passkeys/register/options', headers: { cookie: session, host: 'hub.test:8443' } });
    const options = res.json();
    expect(options.rp).toEqual({ name: 'E-Ink Hub', id: 'hub.test' });
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
    expect(options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual(['cred-1']);
  });

  it('counts passkeys per hostname on /api/auth/me', async () => {
    expect((await app.inject({ url: '/api/auth/me', headers: { host: 'hub.test' } })).json().passkeys).toBe(1);
    expect((await app.inject({ url: '/api/auth/me', headers: { host: 'other.test' } })).json().passkeys).toBe(0);
  });

  it('rejects a sign-in without a pending challenge', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/passkey/login/verify', headers: { host: 'hub.test' }, payload: { response: fakeAssertion('cred-1') } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a bad assertion, and the challenge cannot be reused', async () => {
    const options = await app.inject({ method: 'POST', url: '/api/auth/passkey/login/options', headers: { host: 'hub.test' } });
    expect(options.json().rpId).toBe('hub.test');
    const challenge = cookie(options, 'b8hub_webauthn');
    const verify = () =>
      app.inject({ method: 'POST', url: '/api/auth/passkey/login/verify', headers: { host: 'hub.test', cookie: challenge }, payload: { response: fakeAssertion('cred-1') } });
    const first = await verify();
    expect(first.statusCode).toBe(401);
    expect(first.cookies.find((c) => c.name === 'b8hub_session')).toBeUndefined();
    expect((await verify()).statusCode).toBe(400);
  });

  it('only finds a passkey on the hostname it was made on', async () => {
    const options = await app.inject({ method: 'POST', url: '/api/auth/passkey/login/options', headers: { host: 'other.test' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/login/verify',
      headers: { host: 'other.test', cookie: cookie(options, 'b8hub_webauthn') },
      payload: { response: fakeAssertion('cred-1') },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lists and deletes only the account's own passkeys", async () => {
    expect((await app.inject({ url: '/api/passkeys', headers: { cookie: session } })).json()).toMatchObject([{ id: 'cred-1', name: 'iPhone', rpId: 'hub.test' }]);
    await app.inject({ method: 'DELETE', url: '/api/passkeys/cred-1', headers: { cookie: session } });
    expect((await app.inject({ url: '/api/passkeys', headers: { cookie: session } })).json()).toEqual([]);
  });

  it('cascades passkeys when the user is deleted', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie: session }, payload: { role: 'member' } })).json();
    await app.inject({ method: 'POST', url: `/api/auth/invite/${url.split('/invite/')[1]}`, payload: { username: 'luis', password: 'secret2' } });
    const luis = db.select().from(schema.users).all().find((u) => u.username === 'luis')!;
    db.insert(schema.passkeys).values({ id: 'cred-2', userId: luis.id, publicKey: Buffer.from([1]), rpId: 'hub.test', name: 'Android', createdAt: Date.now() }).run();
    await app.inject({ method: 'DELETE', url: `/api/users/${luis.id}`, headers: { cookie: session } });
    expect(db.select().from(schema.passkeys).all()).toEqual([]);
  });
});
