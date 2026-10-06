// Copyright (c) 2026 Joseba Egia
// SPDX-License-Identifier: MIT

/**
 * Cuts a release: syncs the version, regenerates the changelog, commits and
 * creates the tag. See docs/versioning.md.
 *
 *   node scripts/release.mjs            # version computed from the commits
 *   node scripts/release.mjs 1.0.0      # version forced by hand
 *
 * Written in Node rather than shell because development happens on Windows:
 * it doesn't depend on Git Bash.
 *
 * It does not push on purpose (see the end): publishing must always be a
 * deliberate act, because the tag is what triggers the release build on GitLab.
 */

import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Pinned to major 2: `@latest` would let a git-cliff format change alter the
// changelog without anyone touching anything here.
const GIT_CLIFF = 'npx --yes git-cliff@2'

// Every file that carries the version number. Nothing else should hold it.
const VERSION_FILES = [
  'VERSION',
  'package.json',
  'package-lock.json',
  'apps/server/package.json',
  'apps/web/package.json',
  'apps/server/src/version.ts',
  'apps/web/src/lib/version.ts',
]

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const cliff = (args) => {
  try {
    return execSync(`${GIT_CLIFF} ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    // stderr is captured rather than inherited: git-cliff warns on every run
    // about commits that don't follow Conventional Commits and are skipped on
    // purpose. That warning only matters if something actually failed.
    process.stderr.write(error.stderr ?? '')
    return abort('git-cliff failed. Check the message above.')
  }
}

const abort = (message) => {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

/** Replaces the version value inside a file without touching anything else
 *  (line endings included, which are CRLF on Windows). `expected` is how many
 *  occurrences must be found, so a format change can't go unnoticed. */
function replace(relativePath, pattern, replacement, expected = 1) {
  const path = join(ROOT, relativePath)
  const before = readFileSync(path, 'utf8')
  const found = before.match(new RegExp(pattern.source, 'g'))?.length ?? 0
  if (found !== expected) abort(`Expected ${expected} version occurrence(s) in ${relativePath}, found ${found}. Has the format changed?`)
  writeFileSync(path, before.replace(new RegExp(pattern.source, 'g'), replacement))
}

// --- 1. The repository must be in a publishable state -----------------------

if (git('status', '--porcelain')) {
  abort('There are uncommitted changes. Commit them or `git stash` them before releasing.')
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') {
  abort(`Releases are cut from main, and you are on "${branch}". Merge your branch first.`)
}

console.log('  · Checking that main is up to date with origin…')
git('fetch', 'origin', '--tags', '--quiet')
if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
  abort('main and origin/main differ. Run `git pull` (or `git push`) before releasing.')
}

// --- 2. Decide the version ---------------------------------------------------

const forced = process.argv[2]
if (forced && !/^\d+\.\d+\.\d+$/.test(forced)) {
  abort(`"${forced}" is not a valid version. Expected format: 1.2.3`)
}

const version = forced ?? cliff('--bumped-version').replace(/^v/, '')
const current = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()

if (version === current) {
  abort(
    `Nothing to release: the version would still be ${current}.\n` +
    '    There are no feat/fix/perf/refactor commits since the last tag.\n' +
    '    To release anyway, pass the version by hand: node scripts/release.mjs 1.2.3'
  )
}

console.log(`\n  Releasing ${current} → ${version}\n`)

// --- 3. Propagate the version ------------------------------------------------

writeFileSync(join(ROOT, 'VERSION'), `${version}\n`)
for (const file of ['package.json', 'apps/server/package.json', 'apps/web/package.json']) {
  // Only the top-level field (two-space indent), never a dependency's version.
  replace(file, /(\n  "version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`)
}
// The root package appears twice in the lockfile (top level and packages[""]),
// plus one entry per workspace.
replace(
  'package-lock.json',
  /("name": "(?:eink-hub|@eink-hub\/server|@eink-hub\/web)",\s*"version":\s*")\d+\.\d+\.\d+(")/,
  `$1${version}$2`,
  4,
)
for (const file of ['apps/server/src/version.ts', 'apps/web/src/lib/version.ts']) {
  replace(file, /(APP_VERSION = ')\d+\.\d+\.\d+(')/, `$1${version}$2`)
}

// --- 4. Add the new section to the changelog --------------------------------

// --prepend (not -o): keeps what is already written, including the 0.1.0
// entry that was written by hand.
cliff(`--unreleased --tag v${version} --prepend CHANGELOG.md`)

// --- 5. Review before touching history ----------------------------------------

console.log(execSync('git --no-pager diff', { cwd: ROOT, encoding: 'utf8' }))

const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = (await rl.question(`  Commit and create tag v${version}? [y/N] `)).trim().toLowerCase()
rl.close()

if (answer !== 'y' && answer !== 'yes') {
  git('checkout', '--', 'CHANGELOG.md', ...VERSION_FILES)
  console.log('\n  Cancelled. Files have been left as they were.\n')
  process.exit(0)
}

// --- 6. Commit and tag --------------------------------------------------------

git('add', 'CHANGELOG.md', ...VERSION_FILES)
git('commit', '-m', `chore(release): v${version}`)
git('tag', '-a', `v${version}`, '-m', `v${version}`)

// --- 7. A person pushes ------------------------------------------------------

console.log(`
  ✓ Commit and tag v${version} created locally.

    Review with:   git show v${version}
    Publish with:  git push origin main --follow-tags

    When the tag arrives, GitLab checks it matches VERSION, builds the image
    as :v${version} and :latest, and creates the Release.

    If something is wrong, undo it before pushing:
      git tag -d v${version} && git reset --hard HEAD~1
`)
