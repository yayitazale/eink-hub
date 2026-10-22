import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: path.join(dataDir, 'hub.db'),
  originalsDir: path.join(dataDir, 'originals'),
  cacheDir: path.join(dataDir, 'cache'),
  /** LAN URL the Canvases use to reach this server (pull mode). PUBLIC_URL is the old name. Overridable from Settings. */
  localUrl: process.env.LOCAL_URL ?? process.env.PUBLIC_URL ?? '',
  /** Optional address people use to open the hub (reverse proxy, Tailscale…); encoded in the welcome QR. */
  externalUrl: process.env.EXTERNAL_URL ?? '',
  /** Optional public https address for cloud frames (SwitchBot) to download pictures from; defaults to externalUrl. */
  cloudUrl: process.env.CLOUD_URL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  authDisabled: ['1', 'true', 'yes'].includes((process.env.AUTH_DISABLED ?? '').toLowerCase()),
  immichUrl: process.env.IMMICH_URL ?? '',
  immichApiKey: process.env.IMMICH_API_KEY ?? '',
  webDist: process.env.WEB_DIST ?? path.resolve(import.meta.dirname, '../../web/dist'),
  schedulerEnabled: process.env.SCHEDULER_DISABLED !== 'true',
  /** Look for new releases on GitHub (a few times a day) and show them in the UI. */
  updateCheck: process.env.UPDATE_CHECK_DISABLED !== 'true',
  /** Bluetooth wake through the host's BlueZ (needs /run/dbus mounted). On unless BLE_DISABLED=true. */
  bleEnabled: process.env.BLE_DISABLED !== 'true',
  /** D-Bus system bus socket; DBUS_SYSTEM_BUS_ADDRESS (unix:path=…) wins, as in dbus-next. */
  dbusSocket: (process.env.DBUS_SYSTEM_BUS_ADDRESS ?? '').match(/unix:path=([^,;]+)/)?.[1] ?? '/run/dbus/system_bus_socket',
};

export function ensureDirs() {
  for (const dir of [config.dataDir, config.originalsDir, config.cacheDir, path.join(config.originalsDir, 'immich')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
