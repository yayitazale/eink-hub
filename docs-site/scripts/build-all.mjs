#!/usr/bin/env node
/**
 * Builds the docs of every release, so people on an older version can read their own docs.
 *
 *   public/            latest release (what the site opens with)
 *   public/vX.Y.Z/     every older release that has a docs-site/
 *   public/main/       unreleased docs from main
 *   public/versions.json   the list the version switcher reads at runtime
 *
 * GitLab Pages replaces the whole site on every deploy, so all versions are rebuilt from their
 * git tags each time (CI needs the full history and tags: GIT_DEPTH 0).
 *
 * Usage: node docs-site/scripts/build-all.mjs   (from anywhere inside the repo)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT_BASE = process.env.DOCS_ROOT ?? '/eink-hub/';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const repo = git('rev-parse', '--show-toplevel');
const out = path.join(repo, 'public');
const docsHere = path.join(repo, 'docs-site');
// Long form: Windows' 8.3 short temp path (C:\Users\ABCDEF~1) confuses Vite's module resolution.
const tmp = fs.realpathSync.native(os.tmpdir());

const hasDocs = (ref) => {
  try {
    git('cat-file', '-e', `${ref}:docs-site/package.json`);
    return true;
  } catch {
    return false;
  }
};

const releases = git('tag', '--list', 'v*', '--sort=-v:refname')
  .split('\n')
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t) && hasDocs(t));
const latest = releases[0] ?? null;

function build(dir, base, version, outDir) {
  // Each release installs the dependencies it pinned (npm's cache makes this quick). Linking
  // this checkout's node_modules instead breaks Vite's module resolution.
  if (dir !== docsHere && !fs.existsSync(path.join(dir, 'node_modules'))) {
    execFileSync('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  }
  console.log(`\n▶ ${version} → ${base}`);
  execFileSync('npx', ['vitepress', 'build', '--outDir', outDir], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DOCS_BASE: base, DOCS_VERSION: version, DOCS_ROOT: ROOT_BASE },
  });
}

/** A release's docs-site, checked out on the side. */
function checkout(tag) {
  const dir = fs.mkdtempSync(path.join(tmp, `docs-${tag}-`));
  git('worktree', 'add', '--detach', dir, tag);
  return dir;
}

fs.rmSync(out, { recursive: true, force: true });
const versions = [];
const worktrees = [];
try {
  // main: at the root until there is a release with docs, under /main/ afterwards.
  const mainOut = latest ? path.join(out, 'main') : out;
  build(docsHere, latest ? `${ROOT_BASE}main/` : ROOT_BASE, 'main', mainOut);

  for (const tag of releases) {
    const dir = checkout(tag);
    worktrees.push(dir);
    const isLatest = tag === latest;
    const base = isLatest ? ROOT_BASE : `${ROOT_BASE}${tag}/`;
    build(path.join(dir, 'docs-site'), base, tag, isLatest ? path.join(tmp, `docs-root-${tag}`) : path.join(out, tag));
    if (isLatest) fs.cpSync(path.join(tmp, `docs-root-${tag}`), out, { recursive: true });
    versions.push({ version: tag, path: base, latest: isLatest });
  }
  versions.push({ version: 'main', path: latest ? `${ROOT_BASE}main/` : ROOT_BASE, latest: !latest });
  fs.writeFileSync(path.join(out, 'versions.json'), JSON.stringify(versions, null, 2));
  console.log(`\n✔ ${versions.map((v) => v.version).join(', ')}`);
} finally {
  for (const dir of worktrees) git('worktree', 'remove', '--force', dir);
}
