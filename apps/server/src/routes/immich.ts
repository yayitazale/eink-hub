import type { FastifyInstance, FastifyReply } from 'fastify';
import { getSetting, setSetting } from '../db/index.js';
import { isLang } from '../i18n.js';
import { ImmichClient, assetOrientation, type ImmichAsset } from '../immich/client.js';
import { addItems, memoriesDay } from '../lib/collections.js';
import { HttpError, detectLocalUrl, externalUrlSetting, immichConfig, immichFor, type Ctx } from '../lib/context.js';
import { displayImage } from '../lib/display.js';
import { upsertImmichAssets } from '../lib/images.js';

const slimAsset = (a: ImmichAsset) => ({
  id: a.id,
  name: a.originalFileName,
  takenAt: a.localDateTime ?? a.fileCreatedAt,
  favorite: a.isFavorite,
  thumbhash: a.thumbhash,
  orientation: assetOrientation(a),
});

async function pipeImage(reply: FastifyReply, res: Response) {
  return reply
    .header('content-type', res.headers.get('content-type') ?? 'image/jpeg')
    .header('cache-control', 'private, max-age=604800')
    .send(Buffer.from(await res.arrayBuffer()));
}

export function immichRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/api/immich/status', async () => {
    const { url, apiKey } = immichConfig(db);
    if (!url || !apiKey) return { configured: false };
    try {
      const c = immichFor(db);
      const [user, version] = await Promise.all([c.me(), c.version().catch(() => null)]);
      return { configured: true, ok: true, user: { name: user.name, email: user.email }, version };
    } catch (err) {
      return { configured: true, ok: false, error: (err as Error).message };
    }
  });

  app.get('/api/immich/albums', async () =>
    (await immichFor(db).albums())
      .filter((a) => a.assetCount > 0)
      .map((a) => ({ id: a.id, name: a.albumName, count: a.assetCount, thumbAssetId: a.albumThumbnailAssetId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  app.get('/api/immich/people', async () =>
    (await immichFor(db).people()).map((p) => ({ id: p.id, name: p.name })).sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || a.name.localeCompare(b.name)),
  );

  app.get<{ Params: { id: string } }>('/api/immich/people/:id/thumbnail', async (req, reply) =>
    pipeImage(reply, await immichFor(db).personThumbnail(req.params.id)),
  );

  app.get<{ Params: { id: string }; Querystring: { size?: 'thumbnail' | 'preview' } }>('/api/immich/assets/:id/thumbnail', async (req, reply) =>
    pipeImage(reply, await immichFor(db).thumbnail(req.params.id, req.query.size === 'preview' ? 'preview' : 'thumbnail')),
  );

  app.post<{
    Body: { kind: 'smart' | 'metadata'; query?: string; albumId?: string; personIds?: string[]; favorites?: boolean; page?: number; all?: boolean };
  }>('/api/immich/search', async (req) => {
    const b = req.body ?? ({} as never);
    const c = immichFor(db);
    // Whole album in one go so "select all" / orientation counts cover every photo, not just a page.
    if (b.all && b.kind === 'metadata' && b.albumId) {
      const items = await c.allMetadata({ albumIds: [b.albumId] });
      return { items: items.filter((a) => a.type === 'IMAGE').map(slimAsset), nextPage: null };
    }
    const page = Math.max(1, b.page ?? 1);
    const res =
      b.kind === 'smart'
        ? await c.searchSmart(b.query ?? '', page, 100)
        : await c.searchMetadata(
            {
              ...(b.albumId ? { albumIds: [b.albumId] } : {}),
              ...(b.personIds?.length ? { personIds: b.personIds } : {}),
              ...(b.favorites ? { isFavorite: true } : {}),
            },
            page,
            100,
          );
    return { items: res.assets.items.filter((a) => a.type === 'IMAGE').map(slimAsset), nextPage: res.assets.nextPage ? page + 1 : null };
  });

  app.get('/api/immich/memories', async () =>
    (await immichFor(db).memories(memoriesDay())).map((m) => ({
      id: m.id,
      year: m.data?.year,
      assets: m.assets.filter((a) => a.type === 'IMAGE').map(slimAsset),
    })),
  );

  /** Bring Immich assets into the hub (as references) and optionally a collection / frame. */
  app.post<{ Body: { assetIds: string[]; collectionId?: number; frameId?: number; fit?: 'cover' | 'contain' | 'blur'; bg?: string } }>(
    '/api/immich/import',
    async (req) => {
      const assetIds = req.body.assetIds ?? [];
      if (!assetIds.length) throw new HttpError(400, 'no_photos_selected');
      const ids = upsertImmichAssets(
        db,
        assetIds.map((id) => ({ id, type: 'IMAGE' })),
      );
      if (req.body.collectionId) addItems(db, req.body.collectionId, ids);
      let display;
      if (req.body.frameId) display = await displayImage(ctx, req.body.frameId, ids[0], { fit: req.body.fit, bg: req.body.bg });
      return { imageIds: ids, display };
    },
  );

  // --- Settings ---------------------------------------------------------------------------
  app.get('/api/settings', async (req) => {
    const { url, apiKey } = immichConfig(db);
    const detected = detectLocalUrl(db, req);
    return {
      immichUrl: url,
      immichApiKeySet: !!apiKey,
      localUrl: detected.url,
      localUrlSource: detected.source,
      externalUrl: externalUrlSetting(db),
      language: getSetting(db, 'language') ?? null,
      defaultFit: getSetting(db, 'defaultFit') ?? 'cover',
    };
  });

  app.put<{ Body: { immichUrl?: string; immichApiKey?: string; localUrl?: string; externalUrl?: string; defaultFit?: string; language?: string } }>('/api/settings', async (req) => {
    const b = req.body ?? {};
    if (isLang(b.language)) setSetting(db, 'language', b.language);
    if (b.immichUrl !== undefined) setSetting(db, 'immich.url', b.immichUrl.trim());
    if (b.immichApiKey) setSetting(db, 'immich.apiKey', b.immichApiKey.trim());
    if (b.externalUrl !== undefined) setSetting(db, 'externalUrl', b.externalUrl.trim().replace(/\/+$/, ''));
    if (b.localUrl !== undefined) setSetting(db, 'localUrl', b.localUrl.trim().replace(/\/+$/, ''));
    if (b.defaultFit) setSetting(db, 'defaultFit', b.defaultFit);
    return { ok: true };
  });

  /** Disconnect Immich. Stored as empty (not deleted) so IMMICH_URL / IMMICH_API_KEY from the env don't come back. */
  app.delete('/api/settings/immich', async () => {
    setSetting(db, 'immich.url', '');
    setSetting(db, 'immich.apiKey', '');
    return { ok: true };
  });

  app.post<{ Body: { url: string; apiKey?: string } }>('/api/settings/immich/test', async (req) => {
    const apiKey = req.body.apiKey || immichConfig(db).apiKey;
    try {
      const me = await new ImmichClient(req.body.url, apiKey).me();
      return { ok: true, user: me.name || me.email };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}
