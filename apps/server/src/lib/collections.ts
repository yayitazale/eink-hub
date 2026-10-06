import { eq, sql } from 'drizzle-orm';
import { schema, type DB } from '../db/index.js';
import type { Collection } from '../db/schema.js';
import { matchesOrientation, type ImmichAsset, type ImmichClient, type OrientationFilter } from '../immich/client.js';
import { HttpError, immichFor, type Ctx } from './context.js';
import { upsertImmichAssets } from './images.js';

export function getCollection(db: DB, id: number): Collection {
  const c = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!c) throw new HttpError(404, 'collection_not_found', { id });
  return c;
}

export function refreshCount(db: DB, collectionId: number) {
  db.update(schema.collections)
    .set({
      itemCount: sql`(SELECT COUNT(*) FROM collection_items WHERE collection_id = ${collectionId})`,
    })
    .where(eq(schema.collections.id, collectionId))
    .run();
}

export function addItems(db: DB, collectionId: number, imageIds: number[]) {
  db.transaction((tx) => {
    const max =
      tx
        .select({ m: sql<number>`COALESCE(MAX(position), -1)` })
        .from(schema.collectionItems)
        .where(eq(schema.collectionItems.collectionId, collectionId))
        .get()?.m ?? -1;
    imageIds.forEach((imageId, i) =>
      tx.insert(schema.collectionItems).values({ collectionId, imageId, position: max + 1 + i }).onConflictDoNothing().run(),
    );
  });
  refreshCount(db, collectionId);
}

/** Replace a dynamic collection's members with the given images, keeping source order. */
function replaceItems(db: DB, collectionId: number, imageIds: number[]) {
  db.transaction((tx) => {
    tx.delete(schema.collectionItems).where(eq(schema.collectionItems.collectionId, collectionId)).run();
    const seen = new Set<number>();
    imageIds.forEach((imageId, position) => {
      if (seen.has(imageId)) return;
      seen.add(imageId);
      tx.insert(schema.collectionItems).values({ collectionId, imageId, position }).run();
    });
  });
}

async function fetchAssets(immich: ImmichClient, c: Collection): Promise<ImmichAsset[]> {
  const cfg = c.config as Record<string, unknown>;
  switch (c.type) {
    case 'immich_album':
      return immich.allMetadata({ albumIds: [String(cfg.albumId)] });
    case 'immich_person':
      return immich.allMetadata({ personIds: (cfg.personIds as string[]) ?? [] });
    case 'immich_favorites':
      return immich.allMetadata({ isFavorite: true });
    case 'immich_smart':
      return immich.smartTop(String(cfg.query ?? ''), Number(cfg.limit ?? 100));
    case 'immich_memories':
      return (await immich.memories(memoriesDay())).flatMap((m) => m.assets);
    default:
      return [];
  }
}

export async function syncCollection(ctx: Ctx, c: Collection) {
  if (c.type === 'manual') return c;
  try {
    const filter = (c.config as { orientation?: OrientationFilter }).orientation;
    const assets = (await fetchAssets(immichFor(ctx.db), c)).filter((a) => matchesOrientation(a, filter));
    const ids = upsertImmichAssets(ctx.db, assets);
    replaceItems(ctx.db, c.id, ids);
    ctx.db.update(schema.collections).set({ lastSync: Date.now(), syncError: null }).where(eq(schema.collections.id, c.id)).run();
  } catch (err) {
    ctx.log.warn({ err, collection: c.id }, 'collection sync failed');
    ctx.db.update(schema.collections).set({ syncError: (err as Error).message }).where(eq(schema.collections.id, c.id)).run();
  }
  refreshCount(ctx.db, c.id);
  return getCollection(ctx.db, c.id);
}

const SYNC_EVERY_MS = 6 * 3600_000;

/**
 * Local day (YYYY-MM-DD) whose "on this day" memories to show. Shifted 15 min ahead so a
 * frame that wakes a few minutes before its 00:00 change already gets the new day.
 */
export function memoriesDay(now = new Date()): string {
  const d = new Date(now.getTime() + 15 * 60_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Re-sync a dynamic collection right before picking from it if it's stale (e.g. memories at midnight). */
export async function prepareCollection(ctx: Ctx, collectionId: number) {
  const c = ctx.db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  if (c && needsSync(c)) await syncCollection(ctx, c);
}

export function needsSync(c: Collection, now = new Date()): boolean {
  if (c.type === 'manual') return false;
  if (!c.lastSync) return true;
  if (c.type === 'immich_memories') return memoriesDay(new Date(c.lastSync)) !== memoriesDay(now);
  return now.getTime() - c.lastSync > SYNC_EVERY_MS;
}
