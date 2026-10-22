import { APP_VERSION } from '../version.js';

const REPO = 'yayitazale/eink-hub';
/** Latest release at the root, older ones under /vX.Y.Z/ (see .github/workflows/release.yml). */
const DOCS_ROOT = 'https://yayitazale.github.io/eink-hub/';
/** Updated by every release (the docs' version switcher reads it): a static file on GitHub's CDN. */
const VERSIONS_URL = `${DOCS_ROOT}versions.json`;
const OK_TTL = 2 * 3600_000;
/** Spreads the checks of many hubs over time instead of all at the same moment after a release. */
const JITTER = 20 * 60_000;
const FAIL_TTL = 3600_000;

export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  /** Docs for the version running here (the root only while it is the latest). */
  docsUrl: string;
  repoUrl: string;
  changelogUrl: string;
  /** Only when an update is available. */
  releaseUrl?: string;
  latestDocsUrl?: string;
}

/** Plain x.y.z comparison; anything that doesn't parse is never "newer". */
export function isNewer(candidate: string, than: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const a = parse(candidate);
  const b = parse(than);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

let cache: { at: number; ttl: number; latest: string | null; etag?: string } | null = null;

/**
 * The latest release, from the docs' versions.json. Only asked when someone opens the hub (the UI
 * calls /api/update), and at most every couple of hours; unchanged answers are an empty 304.
 * Offline or failing just means "no update".
 */
async function latestRelease(fetchFn: typeof fetch, now: number, rand: () => number) {
  if (cache && now - cache.at < cache.ttl) return cache;
  const ttl = OK_TTL + Math.round(rand() * JITTER);
  try {
    const res = await fetchFn(VERSIONS_URL, {
      headers: { accept: 'application/json', 'user-agent': `eink-hub/${APP_VERSION}`, ...(cache?.etag ? { 'if-none-match': cache.etag } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 304 && cache) return (cache = { ...cache, at: now, ttl });
    if (!res.ok) throw new Error(`versions.json ${res.status}`);
    const list = (await res.json()) as { version?: string; latest?: boolean }[];
    const tag = Array.isArray(list) ? list.find((v) => v.latest)?.version : undefined;
    cache = { at: now, ttl, latest: tag?.replace(/^v/, '') ?? null, etag: res.headers.get('etag') ?? undefined };
  } catch {
    cache = { at: now, ttl: FAIL_TTL, latest: cache?.latest ?? null, etag: cache?.etag };
  }
  return cache;
}

export async function checkUpdate({ enabled = true, current = APP_VERSION, fetchFn = fetch, now = Date.now(), rand = Math.random } = {}): Promise<UpdateInfo> {
  const base = {
    current,
    repoUrl: `https://github.com/${REPO}`,
    changelogUrl: `https://github.com/${REPO}/blob/v${current}/CHANGELOG.md`,
  };
  const latest = enabled ? (await latestRelease(fetchFn, now, rand)).latest : null;
  if (!latest || !isNewer(latest, current)) return { ...base, latest, available: false, docsUrl: DOCS_ROOT };
  return {
    ...base,
    latest,
    available: true,
    docsUrl: `${DOCS_ROOT}v${current}/`,
    latestDocsUrl: DOCS_ROOT,
    releaseUrl: `https://github.com/${REPO}/releases/tag/v${latest}`,
  };
}

/** For tests. */
export const resetUpdateCache = () => {
  cache = null;
};
