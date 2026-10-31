import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { getSetting, schema, setSetting, type DB } from '../db/index.js';
import type { Role } from '../db/schema.js';
import { requestLang, tr } from '../i18n.js';
import { TRMNL_PATHS } from '../upstream/trmnl.js';
import { passkeyRoutes, passkeyCount } from './passkeys.js';
import { userRoutes } from './users.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'b8hub_session';
const SESSION_MS = 30 * 24 * 3600_000;
const USERNAME = /^[\p{L}\p{N}._-]{1,32}$/u;

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Signed-in user; with AUTH_DISABLED, an implicit admin (id 0). */
    user?: SessionUser;
  }
}

const NO_AUTH_USER: SessionUser = { id: 0, username: 'admin', role: 'admin' };

export async function hashPassword(pw: string) {
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

export const validUsername = (name: unknown): name is string => typeof name === 'string' && USERNAME.test(name);
export const validPassword = (pw: unknown): pw is string => typeof pw === 'string' && pw.length >= 6;

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

/** What only admins may do: hub settings, adding and configuring frames, logs and accounts. */
export function adminOnly(method: string, url: string) {
  const path = url.split('?')[0];
  if (path === '/api/settings') return method !== 'GET';
  if (path === '/api/frames') return method !== 'GET';
  if (/^\/api\/frames\/\d+$/.test(path)) return method !== 'GET';
  return (
    path.startsWith('/api/settings/') ||
    path.startsWith('/api/logs') ||
    /^\/api\/frames\/\d+\/log$/.test(path) ||
    (/^\/api\/frames\/\d+\/(pull|device-settings)$/.test(path) && method !== 'GET') ||
    path === '/api/frames/discover' ||
    path === '/api/frames/test' ||
    path.startsWith('/api/switchbot/') ||
    path.startsWith('/api/users') ||
    path.startsWith('/api/invites')
  );
}

export const countAdmins = (db: DB, exceptId?: number) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(schema.users)
    .where(exceptId === undefined ? eq(schema.users.role, 'admin') : and(eq(schema.users.role, 'admin'), ne(schema.users.id, exceptId)))
    .get()!.n;

export type StartSession = (reply: FastifyReply, userId: number) => void;

export async function setupAuth(app: FastifyInstance, db: DB) {
  const noUsers = () => !db.select({ id: schema.users.id }).from(schema.users).limit(1).get();
  if (config.adminPassword && noUsers())
    db.insert(schema.users).values({ username: 'admin', passwordHash: await hashPassword(config.adminPassword), role: 'admin', createdAt: Date.now() }).run();

  const sessionId = (req: FastifyRequest) => {
    const raw = req.cookies[COOKIE];
    const id = raw ? req.unsignCookie(raw) : undefined;
    return id?.valid && id.value ? id.value : undefined;
  };

  const sessionUser = (req: FastifyRequest): SessionUser | undefined => {
    const id = sessionId(req);
    if (!id) return undefined;
    const row = db
      .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, expiresAt: schema.sessions.expiresAt })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.id, id))
      .get();
    if (!row || row.expiresAt <= Date.now()) return undefined;
    return { id: row.id, username: row.username, role: row.role };
  };

  app.addHook('onRequest', async (req, reply) => {
    req.user = config.authDisabled ? NO_AUTH_USER : sessionUser(req);
    if (config.authDisabled || isPublic(req.url)) return;
    if (!req.user) return reply.code(401).send({ error: tr(requestLang(req, db), 'not_authenticated') });
    if (req.user.role !== 'admin' && adminOnly(req.method, req.url)) return reply.code(403).send({ error: tr(requestLang(req, db), 'forbidden') });
  });

  const startSession: StartSession = (reply, userId) => {
    const id = crypto.randomBytes(32).toString('base64url');
    db.insert(schema.sessions).values({ id, userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_MS }).run();
    db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, userId)).run();
    reply.setCookie(COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', signed: true, maxAge: SESSION_MS / 1000 });
  };

  app.get('/api/auth/me', async (req) => ({
    authenticated: !!req.user,
    authDisabled: config.authDisabled,
    setupRequired: !config.authDisabled && noUsers(),
    user: req.user ?? null,
    // Passkeys this account (or, signed out, anyone) has for the address being browsed.
    passkeys: config.authDisabled ? 0 : passkeyCount(db, req.hostname, req.user?.id),
    // Public so the login screen can use the hub's language.
    language: getSetting(db, 'language') ?? null,
  }));

  app.post<{ Body: { username?: string; password: string } }>('/api/auth/setup', async (req, reply) => {
    if (!noUsers()) return reply.code(409).send({ error: tr(requestLang(req, db), 'already_setup') });
    const username = req.body?.username?.trim() || 'admin';
    if (!validUsername(username)) return reply.code(400).send({ error: tr(requestLang(req, db), 'username_invalid') });
    if (!validPassword(req.body?.password)) return reply.code(400).send({ error: tr(requestLang(req, db), 'password_min') });
    const user = db
      .insert(schema.users)
      .values({ username, passwordHash: await hashPassword(req.body.password), role: 'admin', createdAt: Date.now() })
      .returning()
      .get();
    startSession(reply, user.id);
    return { ok: true };
  });

  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', async (req, reply) => {
    const user = db
      .select()
      .from(schema.users)
      .where(sql`${schema.users.username} = ${req.body?.username?.trim() ?? ''} COLLATE NOCASE`)
      .get();
    if (!user?.passwordHash || !req.body?.password || !(await verifyPassword(req.body.password, user.passwordHash))) {
      await new Promise((r) => setTimeout(r, 500));
      return reply.code(401).send({ error: tr(requestLang(req, db), 'wrong_credentials') });
    }
    startSession(reply, user.id);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const id = sessionId(req);
    if (id) db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post<{ Body: { current: string; password: string } }>('/api/me/password', async (req, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, req.user!.id)).get();
    if (!user) return reply.code(404).send({ error: tr(requestLang(req, db), 'not_authenticated') });
    // Passkey-only accounts set their first password without a current one.
    if (user.passwordHash && !(await verifyPassword(req.body?.current ?? '', user.passwordHash)))
      return reply.code(401).send({ error: tr(requestLang(req, db), 'wrong_current_password') });
    if (!validPassword(req.body?.password)) return reply.code(400).send({ error: tr(requestLang(req, db), 'password_min') });
    db.update(schema.users).set({ passwordHash: await hashPassword(req.body.password) }).where(eq(schema.users.id, user.id)).run();
    // Sign this account out everywhere else.
    db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)).run();
    startSession(reply, user.id);
    return { ok: true };
  });

  userRoutes(app, db, startSession);
  passkeyRoutes(app, db, startSession);
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
  db.delete(schema.invites).where(lt(schema.invites.expiresAt, Date.now())).run();
}
