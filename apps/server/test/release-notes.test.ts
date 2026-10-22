import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS release tooling, no type declarations
import { changelogSection, releaseNotes } from '../../../scripts/release-notes.mjs';

const changelog = [
  '# Changelog',
  '',
  'Intro.',
  '',
  '## [0.5.0] - 2026-10-22',
  '',
  '### Added',
  '',
  '- New thing',
  '',
  '## [0.4.0] - 2026-10-21',
  '',
  '### Fixed',
  '',
  '- Old bug',
  '',
].join('\r\n');

describe('release notes', () => {
  it('takes one version’s section, without its heading, CRLF or not', () => {
    expect(changelogSection(changelog, 'v0.5.0')).toBe('### Added\n\n- New thing');
    expect(changelogSection(changelog, '0.4.0')).toBe('### Fixed\n\n- Old bug');
    expect(changelogSection(changelog, 'v0.3.0')).toBeNull();
  });

  it('puts the image first and the section, then a link to the whole changelog', () => {
    expect(releaseNotes(changelog, 'v0.4.0')).toBe(
      'Image: `ghcr.io/yayitazale/eink-hub:v0.4.0`\n\n### Fixed\n\n- Old bug\n\n' +
        '[Full changelog](https://github.com/yayitazale/eink-hub/blob/v0.4.0/CHANGELOG.md)\n',
    );
    expect(releaseNotes(changelog, 'v0.3.0')).toContain('See [Full changelog]');
  });

  it('finds every released version in the real CHANGELOG.md', () => {
    const real = fs.readFileSync(path.resolve(import.meta.dirname, '../../../CHANGELOG.md'), 'utf8');
    const versions = [...real.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(changelogSection(real, `v${v}`), v).toMatch(/\S/);
  });
});
