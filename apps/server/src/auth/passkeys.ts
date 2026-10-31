import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { schema, type DB } from '../db/index.js';
import { HttpError } from '../lib/context.js';
import { validUsername, type StartSession } from './index.js';
import { accountForInvite, consumeInvite, findInvite, usernameTaken } from './users.js';

const RP_NAME = 'E-Ink Hub';
const COOKIE = 'b8hub_webauthn';
const CHALLENGE_MS = 5 * 60_000;

interface Pending {
  challenge: string;
  expires: number;
  /** Registering for a signed-in account… */
  userId?: number;
  /** …or from an invite link, with the username picked there. */
  inviteHash?: string;
  username?: string;
}

/** Ceremonies in progress, keyed by an id in a short-lived signed cookie. Each is used once. */
const pending = new Map<string, Pending>();

function remember(reply: FastifyReply, p: Omit<Pending, 'expires'>) {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  const id = crypto.randomBytes(16).toString('base64url');
  pending.set(id, { ...p, expires: now + CHALLENGE_MS });
  reply.setCookie(COOKIE, id, { path: '/api/', httpOnly: true, sameSite: 'strict', signed: true, maxAge: CHALLENGE_MS / 1000 });
}

function takePending(req: FastifyRequest, reply: FastifyReply): Pending {
  const raw = req.cookies[COOKIE];
  const id = raw ? req.unsignCookie(raw) : undefined;
  reply.clearCookie(COOKIE, { path: '/api/' });
  const p = id?.valid && id.value ? pending.get(id.value) : undefined;
  if (id?.value) pending.delete(id.value);
  if (!p || p.expires < Date.now()) throw new HttpError(400, 'passkey_expired');
  return p;
}

/**
 * A passkey belongs to the hostname it was made on (the WebAuthn RP ID). Behind a proxy the
 * scheme can be lost on the way in, so both are accepted for that same host.
 */
const rpId = (req: FastifyRequest) => req.hostname;
const origins = (req: FastifyRequest) => [`https://${req.host}`, `http://${req.host}`];

export function passkeyCount(db: DB, hostname: string, userId?: number) {
  const where = userId ? and(eq(schema.passkeys.rpId, hostname), eq(schema.passkeys.userId, userId)) : eq(schema.passkeys.rpId, hostname);
  return db.select({ n: sql<number>`count(*)` }).from(schema.passkeys).where(where).get()!.n;
}

const cleanName = (name: unknown) => (typeof name === 'string' ? name.trim().slice(0, 40) : '') || 'Passkey';

export function passkeyRoutes(app: FastifyInstance, db: DB, startSession: StartSession) {
  const registrationOptions = (req: FastifyRequest, userName: string, userId?: number) =>
    generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId(req),
      userName,
      userID: userId ? new TextEncoder().encode(`user-${userId}`) : undefined,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: userId
        ? db
            .select({ id: schema.passkeys.id, transports: schema.passkeys.transports })
            .from(schema.passkeys)
            .where(and(eq(schema.passkeys.userId, userId), eq(schema.passkeys.rpId, rpId(req))))
            .all()
            .map((c) => ({ id: c.id, transports: c.transports ?? undefined }))
        : [],
    });

  /** Checks a new credential; nothing is stored yet. */
  const verifyNew = async (req: FastifyRequest, p: Pending, response: RegistrationResponseJSON) => {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: p.challenge,
      expectedOrigin: origins(req),
      expectedRPID: rpId(req),
      requireUserVerification: true,
    }).catch(() => undefined);
    if (!result?.verified) throw new HttpError(400, 'passkey_failed');
    return result.registrationInfo.credential;
  };

  const store = (req: FastifyRequest, credential: Awaited<ReturnType<typeof verifyNew>>, name: unknown, userId: number) =>
    db
      .insert(schema.passkeys)
      .values({
        id: credential.id,
        userId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        rpId: rpId(req),
        name: cleanName(name),
        createdAt: Date.now(),
      })
      .run();

  // --- Sign in (public) ---

  app.post('/api/auth/passkey/login/options', async (req, reply) => {
    const options = await generateAuthenticationOptions({ rpID: rpId(req), userVerification: 'required' });
    remember(reply, { challenge: options.challenge });
    return options;
  });

  app.post<{ Body: { response: AuthenticationResponseJSON } }>('/api/auth/passkey/login/verify', async (req, reply) => {
    const p = takePending(req, reply);
    const response = req.body?.response;
    const pk = response?.id
      ? db.select().from(schema.passkeys).where(and(eq(schema.passkeys.id, response.id), eq(schema.passkeys.rpId, rpId(req)))).get()
      : undefined;
    const result = pk
      ? await verifyAuthenticationResponse({
          response,
          expectedChallenge: p.challenge,
          expectedOrigin: origins(req),
          expectedRPID: rpId(req),
          credential: { id: pk.id, publicKey: new Uint8Array(pk.publicKey), counter: pk.counter, transports: (pk.transports ?? undefined) as never },
          requireUserVerification: true,
        }).catch(() => undefined)
      : undefined;
    if (!pk || !result?.verified) {
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, 'passkey_failed');
    }
    db.update(schema.passkeys).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: Date.now() }).where(eq(schema.passkeys.id, pk.id)).run();
    startSession(reply, pk.userId);
    return { ok: true };
  });

  // --- Sign up / reset from an invite link (public) ---

  app.post<{ Params: { token: string }; Body: { username?: string } }>('/api/auth/invite/:token/passkey/options', async (req, reply) => {
    const invite = findInvite(db, req.params.token);
    if (!invite) throw new HttpError(410, 'invite_invalid');
    let userName: string;
    if (invite.userId) {
      userName = db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, invite.userId)).get()!.username;
    } else {
      const name = req.body?.username?.trim();
      if (!validUsername(name)) throw new HttpError(400, 'username_invalid');
      if (usernameTaken(db, name)) throw new HttpError(409, 'username_taken');
      userName = name;
    }
    const options = await registrationOptions(req, userName, invite.userId ?? undefined);
    remember(reply, { challenge: options.challenge, inviteHash: invite.tokenHash, username: userName });
    return options;
  });

  app.post<{ Params: { token: string }; Body: { response: RegistrationResponseJSON; name?: string } }>(
    '/api/auth/invite/:token/passkey/verify',
    async (req, reply) => {
      const p = takePending(req, reply);
      const invite = findInvite(db, req.params.token);
      if (!invite || invite.tokenHash !== p.inviteHash) throw new HttpError(410, 'invite_invalid');
      // Verify before creating the account, so a failed ceremony leaves nothing behind.
      const credential = await verifyNew(req, p, req.body?.response);
      const userId = db.transaction(() => {
        const id = accountForInvite(db, invite, p.username, null);
        store(req, credential, req.body?.name, id);
        return id;
      });
      consumeInvite(db, invite);
      if (invite.userId) db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
      startSession(reply, userId);
      return { ok: true };
    },
  );

  // --- The signed-in account's own passkeys ---

  const me = (req: FastifyRequest) => {
    // AUTH_DISABLED has no real account to attach a passkey to.
    if (!req.user?.id) throw new HttpError(400, 'passkey_no_account');
    return req.user;
  };

  app.get('/api/passkeys', async (req) =>
    db
      .select({ id: schema.passkeys.id, name: schema.passkeys.name, rpId: schema.passkeys.rpId, createdAt: schema.passkeys.createdAt, lastUsedAt: schema.passkeys.lastUsedAt })
      .from(schema.passkeys)
      .where(eq(schema.passkeys.userId, me(req).id))
      .orderBy(schema.passkeys.createdAt)
      .all(),
  );

  app.post('/api/passkeys/register/options', async (req, reply) => {
    const user = me(req);
    const options = await registrationOptions(req, user.username, user.id);
    remember(reply, { challenge: options.challenge, userId: user.id });
    return options;
  });

  app.post<{ Body: { response: RegistrationResponseJSON; name?: string } }>('/api/passkeys/register/verify', async (req, reply) => {
    const user = me(req);
    const p = takePending(req, reply);
    if (p.userId !== user.id) throw new HttpError(400, 'passkey_expired');
    store(req, await verifyNew(req, p, req.body?.response), req.body?.name, user.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/passkeys/:id', async (req) => {
    db.delete(schema.passkeys)
      .where(and(eq(schema.passkeys.id, req.params.id), eq(schema.passkeys.userId, me(req).id)))
      .run();
    return { ok: true };
  });
}
