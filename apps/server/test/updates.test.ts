import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUpdate, isNewer, resetUpdateCache } from '../src/lib/updates.js';

const HOUR = 3600_000;

/** versions.json as published with the docs: the latest release flagged, older ones under /vX.Y.Z/. */
const pages = (latest: string, { etag = '"v1"', status = 200 } = {}) =>
  vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const sent = new Headers(init?.headers).get('if-none-match');
    if (sent && sent === etag) return new Response(null, { status: 304, headers: { etag } });
    const body = [
      { version: `v${latest}`, path: '/eink-hub/', latest: true },
      { version: 'v0.3.4', path: '/eink-hub/v0.3.4/', latest: false },
    ];
    return new Response(status === 200 ? JSON.stringify(body) : 'nope', { status, headers: { etag } });
  });

describe('update check', () => {
  beforeEach(resetUpdateCache);

  it('compares x.y.z versions', () => {
    expect(isNewer('0.3.6', '0.3.5')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.3.5', '0.3.5')).toBe(false);
    expect(isNewer('0.3.4', '0.3.5')).toBe(false);
    expect(isNewer('nightly', '0.3.5')).toBe(false);
  });

  it('reads the latest release from the docs’ versions.json, with its notes and both versions of the docs', async () => {
    const fetchFn = pages('0.3.6');
    const info = await checkUpdate({ current: '0.3.5', fetchFn });
    expect(fetchFn.mock.calls[0][0]).toBe('https://yayitazale.github.io/eink-hub/versions.json');
    expect(info).toMatchObject({
      available: true,
      latest: '0.3.6',
      releaseUrl: 'https://github.com/yayitazale/eink-hub/releases/tag/v0.3.6',
      docsUrl: 'https://yayitazale.github.io/eink-hub/v0.3.5/',
      latestDocsUrl: 'https://yayitazale.github.io/eink-hub/',
      changelogUrl: 'https://github.com/yayitazale/eink-hub/blob/v0.3.5/CHANGELOG.md',
    });
  });

  it('is up to date on the latest release (docs at the root)', async () => {
    const info = await checkUpdate({ current: '0.3.6', fetchFn: pages('0.3.6') });
    expect(info).toMatchObject({ available: false, latest: '0.3.6', docsUrl: 'https://yayitazale.github.io/eink-hub/' });
  });

  it('asks at most every two hours (plus up to 20 min of jitter), then only revalidates', async () => {
    const fetchFn = pages('0.3.6');
    await checkUpdate({ current: '0.3.5', fetchFn, now: 0, rand: () => 0.5 });
    await checkUpdate({ current: '0.3.5', fetchFn, now: 2 * HOUR, rand: () => 0.5 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Past 2 h + jitter: asked again with the ETag; the 304 keeps what it knew.
    const info = await checkUpdate({ current: '0.3.5', fetchFn, now: 2.5 * HOUR, rand: () => 0.5 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchFn.mock.calls[1][1]?.headers).get('if-none-match')).toBe('"v1"');
    expect(info).toMatchObject({ available: true, latest: '0.3.6' });
  });

  it('treats failures as "no update" and tries again within the hour', async () => {
    const failing = pages('9.9.9', { status: 503 });
    expect((await checkUpdate({ current: '0.3.5', fetchFn: failing, now: 0 })).available).toBe(false);
    await checkUpdate({ current: '0.3.5', fetchFn: failing, now: HOUR + 1 });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('never asks when turned off', async () => {
    const fetchFn = pages('0.3.6');
    expect((await checkUpdate({ enabled: false, current: '0.3.5', fetchFn })).available).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
