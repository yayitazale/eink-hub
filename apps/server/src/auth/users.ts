import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { and, eq, gt, sql } from 'drizzle-orm';
import { schema, type DB } from '../db/index.js';
import { roles, type Invite, type Role } from '../db/schema.js';
import { HttpError } from '../lib/context.js';
import { countAdmins, hashPassword, validPassword, validUsername, type StartSession } from './index.js';

const INVITE_MS = 7 * 24 * 3600_000;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('base64url');

/** The pending invite (or reset link) behind a token, if it is still valid. */
export function findInvite(db: DB, token: string): Invite | undefined {
  return db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.tokenHash, hashToken(token)), gt(schema.invites.expiresAt, Date.now())))
    .get();
}

export const consumeInvite = (db: DB, invite: Invite) => db.delete(schema.invites).where(eq(schema.invites.tokenHash, invite.tokenHash)).run();

export const usernameTaken = (db: DB, username: string) =>
  !!db.select({ id: schema.users.id }).from(schema.users).where(sql`${schema.users.username} = ${username} COLLATE NOCASE`).get();

/** Creates the account an invite is for, or returns the one a reset link points at. */
export function accountForInvite(db: DB, invite: Invite, username: string | undefined, passwordHash: string | null) {
  if (invite.userId) {
    if (passwordHash) db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, invite.userId)).run();
    return invite.userId;
  }
  const name = username?.trim();
  if (!validUsername(name)) throw new HttpError(400, 'username_invalid');
  if (usernameTaken(db, name)) throw new HttpError(409, 'username_taken');
  return db.insert(schema.users).values({ username: name, passwordHash, role: invite.role, createdAt: Date.now() }).returning().get().id;
}

/** The address people opened the hub at: invite links (and the passkeys made from them) must use it. */
const origin = (req: FastifyRequest) => `${req.protocol}://${req.host}`;

async function createInvite(db: DB, req: FastifyRequest, role: Role, userId: number | null) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + INVITE_MS;
  db.insert(schema.invites).values({ tokenHash: hashToken(token), role, userId, createdBy: req.user!.id || null, createdAt: Date.now(), expiresAt }).run();
  const url = `${origin(req)}/invite/${token}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1 });
  return { url, qr, expiresAt };
}

export function userRoutes(app: FastifyInstance, db: DB, startSession: StartSession) {
  const getUser = (id: number) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!user) throw new HttpError(404, 'user_not_found');
    return user;
  };

  app.get('/api/users', async () =>
    db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
        lastLoginAt: schema.users.lastLoginAt,
        hasPassword: sql<number>`${schema.users.passwordHash} IS NOT NULL`,
        passkeys: sql<number>`(SELECT count(*) FROM passkeys WHERE passkeys.user_id = ${schema.users.id})`,
      })
      .from(schema.users)
      .orderBy(schema.users.id)
      .all()
      .map((u) => ({ ...u, hasPassword: !!u.hasPassword })),
  );

  app.patch<{ Params: { id: string }; Body: { role: Role } }>('/api/users/:id', async (req) => {
    const user = getUser(+req.params.id);
    const role = req.body?.role;
    if (!roles.includes(role)) throw new HttpError(400, 'role_invalid');
    if (user.role === 'admin' && role !== 'admin' && countAdmins(db, user.id) === 0) throw new HttpError(409, 'last_admin');
    db.update(schema.users).set({ role }).where(eq(schema.users.id, user.id)).run();
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req) => {
    const user = getUser(+req.params.id);
    if (user.role === 'admin' && countAdmins(db, user.id) === 0) throw new HttpError(409, 'last_admin');
    db.delete(schema.users).where(eq(schema.users.id, user.id)).run();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/users/:id/reset', async (req) => {
    const user = getUser(+req.params.id);
    // A new link replaces any earlier one for this account.
    db.delete(schema.invites).where(eq(schema.invites.userId, user.id)).run();
    return createInvite(db, req, user.role, user.id);
  });

  app.get('/api/invites', async () =>
    db
      .select({
        id: schema.invites.tokenHash,
        role: schema.invites.role,
        username: schema.users.username,
        createdAt: schema.invites.createdAt,
        expiresAt: schema.invites.expiresAt,
      })
      .from(schema.invites)
      .leftJoin(schema.users, eq(schema.users.id, schema.invites.userId))
      .where(gt(schema.invites.expiresAt, Date.now()))
      .orderBy(schema.invites.createdAt)
      .all(),
  );

  app.post<{ Body: { role: Role } }>('/api/invites', async (req) => {
    const role = req.body?.role ?? 'member';
    if (!roles.includes(role)) throw new HttpError(400, 'role_invalid');
    return createInvite(db, req, role, null);
  });

  app.delete<{ Params: { id: string } }>('/api/invites/:id', async (req) => {
    db.delete(schema.invites).where(eq(schema.invites.tokenHash, req.params.id)).run();
    return { ok: true };
  });

  // Public: what the invite page needs before the person has an account.
  app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (req) => {
    const invite = findInvite(db, req.params.token);
    if (!invite) return { valid: false };
    const username = invite.userId ? getUser(invite.userId).username : null;
    return { valid: true, role: invite.role, username };
  });

  app.post<{ Params: { token: string }; Body: { username?: string; password: string } }>('/api/auth/invite/:token', async (req, reply) => {
    const invite = findInvite(db, req.params.token);
    if (!invite) throw new HttpError(410, 'invite_invalid');
    if (!validPassword(req.body?.password)) throw new HttpError(400, 'password_min');
    const userId = accountForInvite(db, invite, req.body.username, await hashPassword(req.body.password));
    consumeInvite(db, invite);
    // A reset signs the account out of every other device.
    if (invite.userId) db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
    startSession(reply, userId);
    return { ok: true };
  });
}
