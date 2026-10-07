import { execFile } from 'node:child_process';
import type { FastifyBaseLogger } from 'fastify';

/**
 * The https address Tailscale Serve publishes the hub at, when the hub runs with Tailscale inside
 * its container: Unraid's "Use Tailscale" injects a hook that starts tailscaled and sets
 * TAILSCALE_SERVE_PORT. Used as the external URL when none is set. TAILSCALE_DETECT=true turns it
 * on for other setups that ship the tailscale CLI in the container.
 */
let detected = '';

export const tailscaleServeUrl = () => detected;

type Env = Record<string, string | undefined>;

export function tailscaleDetectionEnabled(env: Env = process.env): boolean {
  return !!env.TAILSCALE_SERVE_PORT || env.TAILSCALE_DETECT === 'true';
}

/** Builds the Serve URL from `tailscale status --json`; '' when Serve isn't https or the node has no name. */
export function serveUrlFromStatus(status: unknown, env: Env = process.env): string {
  const dns = (status as { Self?: { DNSName?: unknown } } | null)?.Self?.DNSName;
  if (typeof dns !== 'string' || !dns) return '';
  const protocol = (env.TAILSCALE_SERVE_PROTOCOL || 'https').toLowerCase();
  if (protocol !== 'https') return '';
  const port = env.TAILSCALE_SERVE_PROTOCOL_PORT || '443';
  return `https://${dns.replace(/\.$/, '')}${port === '443' ? '' : `:${port}`}`;
}

function tailscaleStatus(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile('tailscale', ['status', '--json'], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Polls Tailscale every few minutes (it may still be logging in when the hub starts). Returns a stop function. */
export function startTailscaleDetection(log: FastifyBaseLogger, every = 5 * 60_000): () => void {
  if (!tailscaleDetectionEnabled()) return () => {};
  const refresh = async () => {
    try {
      const url = serveUrlFromStatus(await tailscaleStatus());
      if (url !== detected) log.info({ url }, 'Tailscale Serve address detected');
      detected = url;
    } catch (err) {
      if (detected) log.warn({ err }, 'could not read the Tailscale address');
      else log.debug({ err }, 'Tailscale not ready yet');
    }
  };
  void refresh();
  // Retry sooner during the first minutes: the node may still be waiting for its login approval.
  let tries = 0;
  const early = setInterval(() => (detected || ++tries > 40 ? clearInterval(early) : void refresh()), 15_000);
  const timer = setInterval(refresh, every);
  early.unref();
  timer.unref();
  return () => {
    clearInterval(early);
    clearInterval(timer);
  };
}
