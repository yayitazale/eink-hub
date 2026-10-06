import { Bonjour } from 'bonjour-service';
import { FrameClient, type DeviceInfo } from './client.js';
import { lanAddresses } from '../lib/context.js';

export interface DiscoveredFrame {
  host: string;
  name: string;
  info: DeviceInfo;
}

/** A host is a BLOOMIN8 canvas if /deviceInfo answers with its characteristic fields. */
async function probe(host: string, timeoutMs: number): Promise<DiscoveredFrame | null> {
  try {
    const info = await new FrameClient(host, timeoutMs).deviceInfo();
    if (!info || typeof info !== 'object' || !('screen_model' in info || 'board_model' in info)) return null;
    return { host, name: String(info.name ?? host), info };
  } catch {
    return null;
  }
}

/**
 * Browse mDNS on each LAN interface: with several adapters (VMware, WSL, VPN…) the
 * default socket often ends up on a virtual one and hears nothing.
 * Note: multicast doesn't cross Docker's bridge NAT, so in a bridged container this finds nothing.
 */
async function mdnsCandidates(waitMs: number, interfaces: string[]): Promise<string[]> {
  const hosts = new Set<string>();
  await Promise.all(
    (interfaces.length ? interfaces : [undefined]).map(async (iface) => {
      // The options go straight to multicast-dns, which accepts `interface` (missing from the typings).
      const bonjour = new Bonjour((iface ? { interface: iface } : {}) as ConstructorParameters<typeof Bonjour>[0]);
      try {
        const browser = bonjour.find({ type: 'http' }, (svc) => {
          const ip = svc.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
          if (ip) hosts.add(svc.port && svc.port !== 80 ? `${ip}:${svc.port}` : ip);
        });
        await new Promise((r) => setTimeout(r, waitMs));
        browser.stop();
      } finally {
        bonjour.destroy();
      }
    }),
  );
  return [...hosts];
}

const prefix24 = (ip: string) => ip.split('.').slice(0, 3).join('.');

async function scanSubnet(prefix: string, timeoutMs: number, concurrency = 64): Promise<DiscoveredFrame[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  const found: DiscoveredFrame[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < hosts.length) {
        const r = await probe(hosts[next++], timeoutMs);
        if (r) found.push(r);
      }
    }),
  );
  return found;
}

export interface DiscoverOptions {
  subnet?: string;
  scan?: boolean;
  /**
   * IPs known to be on the LAN (hub local URL, frames already added). A bridged
   * container only sees its own 172.x network, so these tell it which /24 to scan.
   */
  lanHints?: string[];
}

export async function discover(opts: DiscoverOptions = {}): Promise<DiscoveredFrame[]> {
  const results = new Map<string, DiscoveredFrame>();
  const own = lanAddresses();
  const candidates = await mdnsCandidates(3000, own).catch(() => []);
  for (const r of await Promise.all(candidates.map((h) => probe(h, 2500)))) if (r) results.set(r.host, r);

  if (opts.scan || opts.subnet) {
    const ipv4 = /^\d+\.\d+\.\d+\.\d+$/;
    const subnets = opts.subnet
      ? [prefix24(opts.subnet)]
      : [...new Set([...(opts.lanHints ?? []), ...own].filter((ip) => ipv4.test(ip)).map(prefix24))];
    // Subnets are independent: scan them in parallel.
    for (const found of await Promise.all(subnets.map((p) => scanSubnet(p, 1200)))) for (const r of found) results.set(r.host, r);
  }
  return [...results.values()];
}
