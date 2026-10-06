import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema>;

/** Ordered, append-only migrations. Never edit a shipped entry; add a new one. */
export const migrations: string[] = [
  `
  CREATE TABLE frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    device_id TEXT,
    model TEXT,
    firmware TEXT,
    width INTEGER NOT NULL DEFAULT 1200,
    height INTEGER NOT NULL DEFAULT 1600,
    orientation TEXT NOT NULL DEFAULT 'portrait',
    rotate INTEGER NOT NULL DEFAULT 90,
    battery INTEGER,
    online INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER,
    last_info TEXT,
    mode TEXT NOT NULL DEFAULT 'push',
    upstream_token TEXT NOT NULL,
    pull_interval_min INTEGER NOT NULL DEFAULT 60,
    pending_image_id INTEGER,
    pending_opts TEXT,
    current_image_id INTEGER,
    current_render TEXT,
    next_wake INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX frames_token ON frames(upstream_token);

  CREATE TABLE images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    immich_asset_id TEXT UNIQUE,
    file_path TEXT,
    original_name TEXT,
    width INTEGER,
    height INTEGER,
    taken_at INTEGER,
    favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE image_crops (
    image_id INTEGER NOT NULL,
    aspect TEXT NOT NULL,
    x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
    PRIMARY KEY (image_id, aspect)
  );

  CREATE TABLE collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    last_sync INTEGER,
    sync_error TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE collection_items (
    collection_id INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, image_id)
  );
  CREATE INDEX collection_items_image ON collection_items(image_id);

  CREATE TABLE assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL UNIQUE,
    collection_id INTEGER NOT NULL,
    order_mode TEXT NOT NULL DEFAULT 'random',
    interval_min INTEGER NOT NULL DEFAULT 60,
    active_from TEXT,
    active_to TEXT,
    fit TEXT NOT NULL DEFAULT 'cover',
    bg TEXT NOT NULL DEFAULT '#ffffff',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_change INTEGER
  );

  CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frame_id INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    shown_at INTEGER NOT NULL,
    method TEXT NOT NULL,
    pull_id TEXT,
    success INTEGER,
    battery INTEGER
  );
  CREATE INDEX history_frame ON history(frame_id, shown_at DESC);
  CREATE INDEX history_pull ON history(pull_id);

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  `,
  // v2: minute intervals → schedule presets (min 1 h; ≥ 1 day becomes "daily at 07:00").
  `
  ALTER TABLE assignments ADD COLUMN schedule TEXT NOT NULL DEFAULT '{"kind":"days","days":1,"at":"07:00"}';
  ALTER TABLE assignments ADD COLUMN next_change INTEGER;
  UPDATE assignments SET schedule = CASE
    WHEN interval_min <= 60 THEN '{"kind":"interval","hours":1}'
    WHEN interval_min <= 180 THEN '{"kind":"interval","hours":3}'
    WHEN interval_min <= 360 THEN '{"kind":"interval","hours":6}'
    WHEN interval_min < 1440 THEN '{"kind":"interval","hours":12}'
    ELSE '{"kind":"days","days":1,"at":"07:00"}' END;
  UPDATE assignments SET active_from = NULL, active_to = NULL WHERE interval_min >= 1440;
  ALTER TABLE assignments DROP COLUMN interval_min;

  ALTER TABLE frames ADD COLUMN pull_schedule TEXT NOT NULL DEFAULT '{"kind":"days","days":1,"at":"07:00"}';
  UPDATE frames SET pull_schedule = CASE
    WHEN pull_interval_min <= 60 THEN '{"kind":"interval","hours":1}'
    WHEN pull_interval_min <= 180 THEN '{"kind":"interval","hours":3}'
    WHEN pull_interval_min <= 360 THEN '{"kind":"interval","hours":6}'
    WHEN pull_interval_min < 1440 THEN '{"kind":"interval","hours":12}'
    ELSE '{"kind":"days","days":1,"at":"07:00"}' END;
  ALTER TABLE frames DROP COLUMN pull_interval_min;
  `,
  // v3: optional date caption on rotated photos (on by default for "on this day" memories).
  `
  ALTER TABLE assignments ADD COLUMN show_date INTEGER NOT NULL DEFAULT 0;
  UPDATE assignments SET show_date = 1
    WHERE collection_id IN (SELECT id FROM collections WHERE type = 'immich_memories');
  `,
  // v4: welcome picture (logo + QR to the hub) on first contact; existing canvases already have content.
  `
  ALTER TABLE frames ADD COLUMN welcome_shown INTEGER NOT NULL DEFAULT 0;
  UPDATE frames SET welcome_shown = 1;
  `,
  // v5: the single "public URL" becomes the LAN URL; a separate external URL feeds the QR code.
  `
  UPDATE settings SET key = 'localUrl' WHERE key = 'publicUrl';
  `,
];

function migrate(sqlite: Database.Database) {
  const current = sqlite.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(migrations[v]);
      sqlite.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(file: string): DB {
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

export function getSetting(db: DB, key: string): string | undefined {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value;
}

export function setSetting(db: DB, key: string, value: string) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export { schema };
