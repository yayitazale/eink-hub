import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { schema, setSetting } from '../db/index.js';
import type { DisplayOptions, Frame } from '../db/schema.js';
import { bleStatus, normalizeMac } from '../device/ble.js';
import { DeviceError, FrameClient, type DeviceInfo, type Playlist } from '../device/client.js';
import { discover } from '../device/discovery.js';
import { HttpError, detectLocalUrl, localUrlSetting, qrUrl, type Ctx } from '../lib/context.js';
import { prepareCollection } from '../lib/collections.js';
import { assignmentOptions, chooseNextImage, displayImage, getAssignment, getFrame, infoToFrame, markOnline, pushWelcome } from '../lib/display.js';
import { wakeFrame, withWake } from '../lib/wake.js';
import { nextRun, parseSchedule } from '../lib/schedule.js';
import { requestLang, tr } from '../i18n.js';
import { forgetTestCanvas, isSimulated, remember, startTestCanvas } from '../lib/simulators.js';

export async function refreshFrame(ctx: Ctx, frame: Frame, timeoutMs = 5000) {
  try {
    const info = await new FrameClient(frame.host, timeoutMs).deviceInfo();
    markOnline(ctx.db, frame.id, true, infoToFrame(info));
  } catch {
    markOnline(ctx.db, frame.id, false);
  }
  return getFrame(ctx.db, frame.id);
}

const ACTIONS = ['wake', 'next', 'sleep', 'reboot', 'clear', 'whistle'] as const;

/** "192.168.1.6:80" and "192.168.1.6" are the same device. */
const sameHost = (a: string, b: string) => a.replace(/:80$/, '') === b.replace(/:80$/, '');
/** Serial number: identifies a Canvas even after its IP changes. */
const serialOf = (info: unknown) => {
  const sn = (info as DeviceInfo | null)?.sn;
  return typeof sn === 'string' && sn ? sn : null;
};

/** The frame already added for this host or serial, if any. */
function existingFrame(frames: Frame[], host: string, info?: DeviceInfo | null) {
  const sn = serialOf(info);
  return frames.find((f) => sameHost(f.host, host) || (sn && serialOf(f.lastInfo) === sn));
}

async function addFrame(ctx: Ctx, req: FastifyRequest, host: string, name?: string) {
  const { db } = ctx;
  let info: DeviceInfo | undefined;
  try {
    info = await new FrameClient(host, 6000).deviceInfo();
  } catch {
    // Allow adding an asleep frame; details fill in on first contact.
  }
  const dup = existingFrame(db.select().from(schema.frames).all(), host, info);
  if (dup) throw new HttpError(409, 'canvas_already_added', { name: dup.name });
  const frame = db
    .insert(schema.frames)
    .values({
      name: name?.trim() || String(info?.name ?? host),
      host,
      upstreamToken: crypto.randomBytes(18).toString('base64url'),
      createdAt: Date.now(),
      online: !!info,
      lastSeen: info ? Date.now() : null,
      ...(info ? infoToFrame(info) : {}),
    })
    .returning()
    .get();
  // First contact: greet with the welcome picture (QR to the hub). If asleep, it goes out on first wake.
  if (info) await pushWelcome(ctx, frame, qrUrl(db, req)).catch((err) => req.log.warn({ err }, 'welcome push failed'));
  return frame;
}

export function frameRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const client = (id: number) => new FrameClient(getFrame(db, id).host);

  app.get('/api/frames', async () => {
    const frames = db.select().from(schema.frames).all();
    return frames.map((f) => ({ ...f, assignment: getAssignment(db, f.id) ?? null, simulated: isSimulated(db, f.id) }));
  });

  app.post<{ Body: { subnet?: string; scan?: boolean } }>('/api/frames/discover', async (req) => {
    const frames = db.select().from(schema.frames).all();
    const known = new Set(frames.map((f) => f.host));
    const hubIp = (() => {
      try {
        return new URL(detectLocalUrl(db, req).url).hostname;
      } catch {
        return '';
      }
    })();
    const lanHints = [hubIp, ...[...known].map((h) => h.split(':')[0])].filter((ip) => !ip.startsWith('127.'));
    const found = await discover({ ...(req.body ?? {}), lanHints });
    // Canvases already added never show up. One found at a new IP (DHCP) keeps its entry and follows the address.
    return found.filter((f) => {
      const dup = existingFrame(frames, f.host, f.info);
      if (!dup) return true;
      if (!sameHost(dup.host, f.host)) db.update(schema.frames).set({ host: f.host }).where(eq(schema.frames.id, dup.id)).run();
      return false;
    });
  });

  app.post<{ Body: { host: string; name?: string } }>('/api/frames', async (req) => {
    const host = req.body?.host?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!host) throw new HttpError(400, 'host_missing');
    return getFrame(db, (await addFrame(ctx, req, host, req.body.name)).id);
  });

  // A simulated Canvas living inside the hub, for trying things out without hardware.
  app.post<{ Body: { name?: string } }>('/api/frames/test', async (req) => {
    const count = db.select().from(schema.frames).all().filter((f) => isSimulated(db, f.id)).length;
    const base = tr(requestLang(req, db), 'test_canvas_name');
    const name = req.body?.name?.trim() || (count ? `${base} ${count + 1}` : base);
    const { sim, host } = await startTestCanvas(ctx, name);
    const frame = await addFrame(ctx, req, host, name).catch(async (err) => {
      await sim.close();
      throw err;
    });
    remember(ctx, frame.id, sim, name);
    return { ...getFrame(db, frame.id), simulated: true };
  });


  app.get<{ Params: { id: string } }>('/api/frames/:id', async (req) => {
    const f = getFrame(db, +req.params.id);
    return { ...f, assignment: getAssignment(db, f.id) ?? null, simulated: isSimulated(db, f.id) };
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<Pick<Frame, 'name' | 'host' | 'orientation' | 'rotate' | 'width' | 'height' | 'bleAutoWake'>> & { pullSchedule?: unknown; bleMac?: string | null };
  }>(
    '/api/frames/:id',
    async (req) => {
      const id = +req.params.id;
      getFrame(db, id);
      const b = req.body ?? {};
      const patch: Partial<Frame> = {};
      if (b.name) patch.name = b.name;
      if (b.host) patch.host = b.host;
      if (b.orientation === 'portrait' || b.orientation === 'landscape') patch.orientation = b.orientation;
      if (b.rotate === 90 || b.rotate === 270) patch.rotate = b.rotate;
      if (b.pullSchedule !== undefined) patch.pullSchedule = parseSchedule(b.pullSchedule);
      if (b.width && b.height) Object.assign(patch, { width: Math.min(b.width, b.height), height: Math.max(b.width, b.height) });
      if (b.bleMac !== undefined) {
        const mac = b.bleMac ? normalizeMac(b.bleMac) : null;
        if (b.bleMac && !mac) throw new HttpError(400, 'ble_mac_invalid');
        patch.bleMac = mac;
      }
      if (typeof b.bleAutoWake === 'boolean') patch.bleAutoWake = b.bleAutoWake;
      if (Object.keys(patch).length) db.update(schema.frames).set(patch).where(eq(schema.frames.id, id)).run();
      return getFrame(db, id);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/frames/:id', async (req) => {
    const id = +req.params.id;
    db.delete(schema.assignments).where(eq(schema.assignments.frameId, id)).run();
    db.delete(schema.history).where(eq(schema.history.frameId, id)).run();
    db.delete(schema.frames).where(eq(schema.frames.id, id)).run();
    await forgetTestCanvas(db, id);
    return { ok: true };
  });

  // Whether the hub itself can wake frames over Bluetooth; ?refresh=1 re-probes BlueZ.
  app.get<{ Querystring: { refresh?: string } }>('/api/ble/status', async (req) => bleStatus(!!req.query.refresh));

  app.post<{ Params: { id: string } }>('/api/frames/:id/refresh', async (req) => refreshFrame(ctx, getFrame(db, +req.params.id), 8000));

  app.post<{ Params: { id: string; action: (typeof ACTIONS)[number] } }>('/api/frames/:id/actions/:action', async (req) => {
    const frame = getFrame(db, +req.params.id);
    const c = new FrameClient(frame.host);
    // Asleep and auto-wake on: wake over Bluetooth and retry once. Still no answer: it is asleep
    // (the UI then offers Wake instead of Sleep).
    const awake = <T>(fn: () => Promise<T>) =>
      withWake(ctx, frame, fn).catch((err) => {
        if (err instanceof DeviceError && err.offline) markOnline(db, frame.id, false);
        throw err;
      });
    switch (req.params.action) {
      case 'wake':
        await wakeFrame(ctx, frame);
        return { ok: true };
      case 'next': {
        // With a schedule, "Next" is a manual trigger of it: the next image of its playlist,
        // and the schedule carries on from now. Without one, the Canvas moves on in its own gallery.
        const a = getAssignment(db, frame.id);
        if (!a?.enabled) {
          await awake(() => c.showNext());
          break;
        }
        await prepareCollection(ctx, a.collectionId);
        const imageId = chooseNextImage(db, frame, a);
        const playlist = db.select({ name: schema.collections.name }).from(schema.collections).where(eq(schema.collections.id, a.collectionId)).get()?.name;
        if (!imageId) throw new HttpError(409, 'playlist_empty', { name: playlist ?? '' });
        const { method } = await displayImage(ctx, frame.id, imageId, assignmentOptions(db, a));
        const now = new Date();
        db.update(schema.assignments)
          .set({ lastChange: now.getTime(), nextChange: nextRun(a.schedule, now, a)?.getTime() ?? null })
          .where(eq(schema.assignments.id, a.id))
          .run();
        return { ok: true, playlist, queued: method === 'queued' };
      }
      case 'sleep':
        await c.sleep();
        markOnline(db, frame.id, false);
        return { ok: true };
      case 'reboot':
        await awake(() => c.reboot());
        break;
      case 'clear': {
        // "Limpiar" = back to the welcome picture; delivered on next wake if the Canvas is asleep.
        db.update(schema.frames).set({ welcomeShown: false, pendingImageId: null, pendingOpts: null }).where(eq(schema.frames.id, frame.id)).run();
        try {
          await awake(() => pushWelcome(ctx, frame, qrUrl(db, req)));
        } catch (err) {
          if (err instanceof DeviceError && err.offline) return { ok: true, queued: true };
          throw err;
        }
        return { ok: true };
      }
      case 'whistle':
        await awake(() => c.whistle());
        break;
      default:
        throw new HttpError(400, 'unknown_action');
    }
    markOnline(db, frame.id, true);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { name?: string; sleep_duration?: number; max_idle?: number; idx_wake_sens?: number } }>(
    '/api/frames/:id/device-settings',
    async (req) => {
      const id = +req.params.id;
      const frame = getFrame(db, id);
      await withWake(ctx, frame, () => new FrameClient(frame.host).updateSettings(req.body ?? {}));
      if (req.body?.name) db.update(schema.frames).set({ name: req.body.name }).where(eq(schema.frames.id, id)).run();
      return refreshFrame(ctx, getFrame(db, id));
    },
  );

  app.post<{ Params: { id: string }; Body: { imageId: number } & DisplayOptions }>('/api/frames/:id/display', async (req) => {
    const { imageId, ...opts } = req.body;
    return displayImage(ctx, +req.params.id, imageId, opts);
  });

  app.get<{ Params: { id: string } }>('/api/frames/:id/history', async (req) =>
    db
      .select({
        id: schema.history.id,
        imageId: schema.history.imageId,
        shownAt: schema.history.shownAt,
        method: schema.history.method,
        success: schema.history.success,
        battery: schema.history.battery,
      })
      .from(schema.history)
      .where(eq(schema.history.frameId, +req.params.id))
      .orderBy(desc(schema.history.shownAt))
      .limit(60)
      .all(),
  );

  // --- On-device galleries & playlists -------------------------------------------------
  app.get<{ Params: { id: string } }>('/api/frames/:id/galleries', async (req) => {
    const c = client(+req.params.id);
    const list = (await c.galleryList()) ?? [];
    return Promise.all(
      list.map(async (g) => {
        const content = await c.gallery(g.name, 0, 200).catch(() => null);
        return { name: g.name, total: content?.total ?? 0, images: content?.data ?? [] };
      }),
    );
  });
  app.delete<{ Params: { id: string; name: string } }>('/api/frames/:id/galleries/:name', async (req) => {
    await client(+req.params.id).deleteGallery(req.params.name);
    return { ok: true };
  });
  app.post<{ Params: { id: string; name: string }; Body: { image: string } }>('/api/frames/:id/galleries/:name/delete-image', async (req) => {
    await client(+req.params.id).deleteImage(req.body.image, req.params.name);
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { gallery?: string; image?: string; playlist?: string; duration?: number } }>(
    '/api/frames/:id/play',
    async (req) => {
      const b = req.body ?? {};
      const c = client(+req.params.id);
      if (b.playlist) await c.show({ play_type: 2, playlist: b.playlist });
      else if (b.image && b.gallery) await c.show({ play_type: 0, image: `/gallerys/${b.gallery}/${b.image}` });
      else if (b.gallery) await c.show({ play_type: 1, gallery: b.gallery, duration: b.duration ?? 3600 });
      else throw new HttpError(400, 'play_target_missing');
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string } }>('/api/frames/:id/playlists', async (req) => {
    const c = client(+req.params.id);
    const list = (await c.playlistList()) ?? [];
    return Promise.all(list.map((p) => c.playlist(p.name).catch(() => ({ name: p.name, type: 'duration', list: [] }) as Playlist)));
  });
  app.put<{ Params: { id: string }; Body: Playlist }>('/api/frames/:id/playlists', async (req) => {
    await client(+req.params.id).putPlaylist(req.body);
    return { ok: true };
  });
  app.delete<{ Params: { id: string; name: string } }>('/api/frames/:id/playlists/:name', async (req) => {
    await client(+req.params.id).deletePlaylist(req.params.name);
    return { ok: true };
  });

  // --- Upstream pull mode ----------------------------------------------------------------
  app.post<{ Params: { id: string }; Body: { enabled: boolean; localUrl?: string; pullSchedule?: unknown } }>(
    '/api/frames/:id/pull',
    async (req) => {
      const frame = getFrame(db, +req.params.id);
      const c = new FrameClient(frame.host);
      if (req.body.enabled) {
        const url = (req.body.localUrl || detectLocalUrl(db, req).url).replace(/\/+$/, '');
        if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'public_url_missing');
        if (/localhost|127\.0\.0\.1/.test(url)) throw new HttpError(400, 'public_url_localhost');
        if (!localUrlSetting(db)) setSetting(db, 'localUrl', url);
        await c.whistle().catch(() => {});
        await c.setPullSettings({
          upstream_on: true,
          upstream_url: url,
          token: frame.upstreamToken,
          cron_time: new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        });
        db.update(schema.frames)
          .set({ mode: 'pull', ...(req.body.pullSchedule !== undefined ? { pullSchedule: parseSchedule(req.body.pullSchedule) } : {}), nextWake: Date.now() + 60_000 })
          .where(eq(schema.frames.id, frame.id))
          .run();
      } else {
        await c.setPullSettings({ upstream_on: false, upstream_url: '', token: frame.upstreamToken });
        db.update(schema.frames).set({ mode: 'push', nextWake: null }).where(eq(schema.frames.id, frame.id)).run();
      }
      markOnline(db, frame.id, true);
      return getFrame(db, frame.id);
    },
  );

  app.get<{ Params: { id: string } }>('/api/frames/:id/pull', async (req) => client(+req.params.id).pullSettings());
}
