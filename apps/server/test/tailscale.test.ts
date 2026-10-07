import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b8hub-'));
process.env.DATA_DIR = dataDir;
delete process.env.LOCAL_URL;
delete process.env.PUBLIC_URL;

const { ensureDirs, config } = await import('../src/config.js');
const { openDb } = await import('../src/db/index.js');
const { detectLocalUrl } = await import('../src/lib/context.js');
const { serveUrlFromStatus, tailscaleDetectionEnabled } = await import('../src/lib/tailscale.js');

ensureDirs();
const db = openDb(config.dbPath);

describe('Tailscale Serve address', () => {
  const status = { Self: { DNSName: 'eink-hub.tail1234.ts.net.' } };

  it('is only looked for when Unraid set up Serve, or on request', () => {
    expect(tailscaleDetectionEnabled({})).toBe(false);
    expect(tailscaleDetectionEnabled({ TAILSCALE_SERVE_PORT: '8080' })).toBe(true);
    expect(tailscaleDetectionEnabled({ TAILSCALE_DETECT: 'true' })).toBe(true);
  });

  it('builds the https URL from the MagicDNS name', () => {
    expect(serveUrlFromStatus(status, { TAILSCALE_SERVE_PORT: '8080' })).toBe('https://eink-hub.tail1234.ts.net');
  });

  it('adds the port when Serve is not on 443', () => {
    expect(serveUrlFromStatus(status, { TAILSCALE_SERVE_PROTOCOL_PORT: '8443' })).toBe('https://eink-hub.tail1234.ts.net:8443');
  });

  it('gives nothing without https or without a name', () => {
    expect(serveUrlFromStatus(status, { TAILSCALE_SERVE_PROTOCOL: 'tcp' })).toBe('');
    expect(serveUrlFromStatus({ Self: {} }, {})).toBe('');
    expect(serveUrlFromStatus(null, {})).toBe('');
  });
});

describe('local URL guess', () => {
  const req = (host: string) => ({ headers: { host }, protocol: 'https' }) as unknown as FastifyRequest;

  it('uses the address the UI is browsed at on the LAN', () => {
    expect(detectLocalUrl(db, req('192.168.1.10:8080'))).toEqual({ url: 'https://192.168.1.10:8080', source: 'browser' });
  });

  it("ignores a tailnet address, which Canvases on the LAN can't reach", () => {
    expect(detectLocalUrl(db, req('eink-hub.tail1234.ts.net')).source).not.toBe('browser');
    expect(detectLocalUrl(db, req('eink-hub.tail1234.ts.net:8443')).source).not.toBe('browser');
  });
});
