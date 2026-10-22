import { APP_VERSION } from '../version.js';

const REPO = 'yayitazale/eink-hub';
/** Latest release at the root, older ones under /vX.Y.Z/ (see .github/workflows/release.yml). */
const DOCS_ROOT = 'https://yayitazale.github.io/eink-hub/';
const OK_TTL = 6 * 3600_000;
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

let cache: { at: number; ttl: number; latest: string | null; url?: string } | null = null;

/** Asks GitHub for the latest release, at most every few hours; offline or rate-limited just means "no update". */
async function latestRelease(fetchFn: typeof fetch, now: number) {
  if (cache && now - cache.at < cache.ttl) return cache;
  try {
    const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `eink-hub/${APP_VERSION}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const r = (await res.json()) as { tag_name?: string; html_url?: string };
    cache = { at: now, ttl: OK_TTL, latest: r.tag_name?.replace(/^v/, '') ?? null, url: r.html_url };
  } catch {
    cache = { at: now, ttl: FAIL_TTL, latest: cache?.latest ?? null, url: cache?.url };
  }
  return cache;
}

export async function checkUpdate({ enabled = true, current = APP_VERSION, fetchFn = fetch, now = Date.now() } = {}): Promise<UpdateInfo> {
  const base = {
    current,
    repoUrl: `https://github.com/${REPO}`,
    changelogUrl: `https://github.com/${REPO}/blob/v${current}/CHANGELOG.md`,
  };
  const latest = enabled ? (await latestRelease(fetchFn, now)).latest : null;
  if (!latest || !isNewer(latest, current)) return { ...base, latest, available: false, docsUrl: DOCS_ROOT };
  return {
    ...base,
    latest,
    available: true,
    docsUrl: `${DOCS_ROOT}v${current}/`,
    latestDocsUrl: DOCS_ROOT,
    releaseUrl: cache?.url ?? `https://github.com/${REPO}/releases/tag/v${latest}`,
  };
}

/** For tests. */
export const resetUpdateCache = () => {
  cache = null;
};
