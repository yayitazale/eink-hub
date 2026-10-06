import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq, lt } from 'drizzle-orm';
import { config } from '../config.js';
import { getSetting, schema, setSetting, type DB } from '../db/index.js';
import { requestLang, tr } from '../i18n.js';
import { TRMNL_PATHS } from '../upstream/trmnl.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'b8hub_session';
const SESSION_MS = 30 * 24 * 3600_000;

async function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(pw: string, stored: string) {
  const [, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Paths reachable without a session: the device-facing APIs (own tokens) and the SPA shell. */
function isPublic(url: string) {
  return (
    url.startsWith('/eink_pull') ||
    url.startsWith('/of/v1/') ||
    TRMNL_PATHS.test(url) ||
    url.startsWith('/eink_signal') ||
    url.startsWith('/u/img/') ||
    url.startsWith('/api/auth/') ||
    url === '/api/health' ||
    !url.startsWith('/api/')
  );
}

export async function setupAuth(app: FastifyInstance, db: DB) {
  if (config.adminPassword && !getSetting(db, 'auth.hash')) setSetting(db, 'auth.hash', await hashPassword(config.adminPassword));

  const validSession = (req: FastifyRequest) => {
    const raw = req.cookies[COOKIE];
    const id = raw ? req.unsignCookie(raw) : undefined;
    if (!id?.valid || !id.value) return false;
    const s = db.select().from(schema.sessions).where(eq(schema.sessions.id, id.value)).get();
    return !!s && s.expiresAt > Date.now();
  };

  app.addHook('onRequest', async (req, reply) => {
    if (config.authDisabled || isPublic(req.url)) return;
    if (!validSession(req)) return reply.code(401).send({ error: tr(requestLang(req, db), 'not_authenticated') });
  });

  const startSession = (reply: FastifyReply) => {
    const id = crypto.randomBytes(32).toString('base64url');
    db.insert(schema.sessions).values({ id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_MS }).run();
    reply.setCookie(COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', signed: true, maxAge: SESSION_MS / 1000 });
  };

  app.get('/api/auth/me', async (req) => ({
    authenticated: config.authDisabled || validSession(req),
    authDisabled: config.authDisabled,
    setupRequired: !config.authDisabled && !getSetting(db, 'auth.hash'),
    // Public so the login screen can use the hub's language.
    language: getSetting(db, 'language') ?? null,
  }));

  app.post<{ Body: { password: string } }>('/api/auth/setup', async (req, reply) => {
    if (getSetting(db, 'auth.hash')) return reply.code(409).send({ error: tr(requestLang(req, db), 'already_setup') });
    if (!req.body?.password || req.body.password.length < 6) return reply.code(400).send({ error: tr(requestLang(req, db), 'password_min') });
    setSetting(db, 'auth.hash', await hashPassword(req.body.password));
    startSession(reply);
    return { ok: true };
  });

  app.post<{ Body: { password: string } }>('/api/auth/login', async (req, reply) => {
    const stored = getSetting(db, 'auth.hash');
    if (!stored || !req.body?.password || !(await verifyPassword(req.body.password, stored))) {
      await new Promise((r) => setTimeout(r, 500));
      return reply.code(401).send({ error: tr(requestLang(req, db), 'wrong_password') });
    }
    startSession(reply);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[COOKIE];
    const id = raw ? req.unsignCookie(raw) : undefined;
    if (id?.valid && id.value) db.delete(schema.sessions).where(eq(schema.sessions.id, id.value)).run();
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post<{ Body: { current: string; password: string } }>('/api/settings/password', async (req, reply) => {
    const stored = getSetting(db, 'auth.hash');
    if (stored && !(await verifyPassword(req.body?.current ?? '', stored))) return reply.code(401).send({ error: tr(requestLang(req, db), 'wrong_current_password') });
    if (!req.body?.password || req.body.password.length < 6) return reply.code(400).send({ error: tr(requestLang(req, db), 'password_min') });
    setSetting(db, 'auth.hash', await hashPassword(req.body.password));
    db.delete(schema.sessions).run();
    startSession(reply);
    return { ok: true };
  });
}

export function cookieSecret(db: DB) {
  let secret = getSetting(db, 'auth.cookieSecret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting(db, 'auth.cookieSecret', secret);
  }
  return secret;
}

export function purgeSessions(db: DB) {
  db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now())).run();
}
