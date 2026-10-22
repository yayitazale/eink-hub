import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkUpdate, isNewer, resetUpdateCache } from '../src/lib/updates.js';

const github = (tag: string, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ tag_name: tag, html_url: `https://github.com/yayitazale/eink-hub/releases/tag/${tag}` }), { status: ok ? 200 : 403 }));

describe('update check', () => {
  beforeEach(resetUpdateCache);

  it('compares x.y.z versions', () => {
    expect(isNewer('0.3.6', '0.3.5')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.3.5', '0.3.5')).toBe(false);
    expect(isNewer('0.3.4', '0.3.5')).toBe(false);
    expect(isNewer('nightly', '0.3.5')).toBe(false);
  });

  it('reports a newer release with its notes and both versions of the docs', async () => {
    const info = await checkUpdate({ current: '0.3.5', fetchFn: github('v0.3.6') });
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
    const info = await checkUpdate({ current: '0.3.6', fetchFn: github('v0.3.6') });
    expect(info).toMatchObject({ available: false, latest: '0.3.6', docsUrl: 'https://yayitazale.github.io/eink-hub/' });
  });

  it('asks GitHub at most every few hours, and treats failures as "no update"', async () => {
    const fetchFn = github('v0.3.6');
    await checkUpdate({ current: '0.3.5', fetchFn, now: 0 });
    await checkUpdate({ current: '0.3.5', fetchFn, now: 3600_000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resetUpdateCache();
    const failing = github('v9.9.9', false);
    expect((await checkUpdate({ current: '0.3.5', fetchFn: failing })).available).toBe(false);
  });

  it('never calls GitHub when turned off', async () => {
    const fetchFn = github('v0.3.6');
    expect((await checkUpdate({ enabled: false, current: '0.3.5', fetchFn })).available).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
