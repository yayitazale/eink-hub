import fs from 'node:fs';
import os from 'node:os';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getSetting, type DB } from '../db/index.js';
import { ImmichClient } from '../immich/client.js';
import { tr, type MsgKey, type MsgVars } from '../i18n.js';
import { tailscaleServeUrl } from './tailscale.js';

export interface Ctx {
  db: DB;
  log: FastifyBaseLogger;
}

/** User-facing error: carries a message key, translated per request by the error handler. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly key: MsgKey,
    readonly vars: MsgVars = {},
  ) {
    super(tr('en', key, vars));
  }
}

export function immichConfig(db: DB) {
  return {
    url: getSetting(db, 'immich.url') ?? config.immichUrl,
    apiKey: getSetting(db, 'immich.apiKey') ?? config.immichApiKey,
  };
}

export function immichFor(db: DB): ImmichClient {
  const { url, apiKey } = immichConfig(db);
  if (!url || !apiKey) throw new HttpError(412, 'immich_not_configured');
  return new ImmichClient(url, apiKey);
}

const trimSlash = (u: string) => u.trim().replace(/\/+$/, '');

export function localUrlSetting(db: DB): string {
  return trimSlash(getSetting(db, 'localUrl') ?? config.localUrl);
}

export type ExternalUrlSource = 'settings' | 'env' | 'tailscale' | 'none';

/** The external address as configured (Settings, else EXTERNAL_URL); empty when not set. */
export function configuredExternalUrl(db: DB): string {
  return trimSlash(getSetting(db, 'externalUrl') ?? config.externalUrl);
}

/** Address for people (reverse proxy / Tailscale): the configured one, else Tailscale Serve's; empty when neither. */
export function externalUrlSetting(db: DB): string {
  return configuredExternalUrl(db) || tailscaleServeUrl();
}

export function externalUrlSource(db: DB): ExternalUrlSource {
  if (trimSlash(getSetting(db, 'externalUrl') ?? '')) return 'settings';
  if (configuredExternalUrl(db)) return 'env';
  return tailscaleServeUrl() ? 'tailscale' : 'none';
}

/**
 * Where vendor clouds (SwitchBot) download pictures from: must be public and https. Its own
 * setting when only /u/img is exposed (e.g. Tailscale Funnel on another port), else the external URL.
 */
export function cloudUrlSetting(db: DB): string {
  return trimSlash(getSetting(db, 'cloudUrl') ?? config.cloudUrl) || externalUrlSetting(db);
}

/** What the welcome picture's QR code opens: the external address if any, else the LAN one. */
export function qrUrl(db: DB, req?: FastifyRequest): string {
  return externalUrlSetting(db) || detectLocalUrl(db, req).url;
}

const LOCAL_HOST = /^(localhost|127\.|\[?::1\]?|0\.0\.0\.0)/;
/** Tailscale MagicDNS names: only devices in the tailnet reach them, never a Canvas on the LAN. */
const TAILNET_HOST = /\.ts\.net(:\d+)?$/i;
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export type LocalUrlSource = 'settings' | 'env' | 'browser' | 'interface' | 'none';

/**
 * Best guess of the URL a Canvas on the LAN can use to reach the hub:
 * saved setting → LOCAL_URL → the LAN address the UI is being browsed at → this machine's LAN IP.
 */
export function detectLocalUrl(db: DB, req?: FastifyRequest): { url: string; source: LocalUrlSource } {
  const saved = getSetting(db, 'localUrl');
  if (saved) return { url: trimSlash(saved), source: 'settings' };
  if (config.localUrl) return { url: trimSlash(config.localUrl), source: 'env' };
  const host = req?.headers.host;
  if (req && host && !LOCAL_HOST.test(host) && !TAILNET_HOST.test(host)) return { url: `${req.protocol}://${host}`, source: 'browser' };
  const ip = lanAddress();
  if (ip) return { url: `http://${ip}:${config.port}`, source: 'interface' };
  return { url: '', source: 'none' };
}

/** Virtual/VPN adapters whose addresses a Canvas on the LAN can't reach. */
const VIRTUAL_IFACE = /vmware|vmnet|virtualbox|vbox|vethernet|hyper-v|wsl|docker|^br-|^veth|tailscale|zerotier|^zt|^utun|^tun|^tap|wireguard|^wg/i;

/** This machine's LAN IPv4 addresses, skipping virtual/VPN adapters; home-style 192.168.x first. */
export function lanAddresses(): string[] {
  // Inside Docker with bridge networking our own 172.x addresses aren't reachable from the LAN.
  const inDocker = fs.existsSync('/.dockerenv');
  const ips = Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL_IFACE.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal && PRIVATE_IP.test(a.address) && !(inDocker && a.address.startsWith('172.')))
    .map((a) => a.address);
  return [...ips.filter((ip) => ip.startsWith('192.168.')), ...ips.filter((ip) => !ip.startsWith('192.168.'))];
}

export function lanAddress(): string | undefined {
  return lanAddresses()[0];
}
