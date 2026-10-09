# Versioning & releases

Server and web always ship together in the same image, so they share **a
single version number**. The source of truth is the `VERSION` file at the
root; `scripts/release.mjs` propagates it to every other place that needs it:

| File | Purpose |
| --- | --- |
| `VERSION` | Source of truth. CI reads it to check the tag |
| `package.json`, `apps/*/package.json`, `package-lock.json` | npm `version` field |
| `apps/server/src/version.ts` | Returned by `/api/health` |
| `apps/web/src/lib/version.ts` | Shown in the sidebar (and in Settings on mobile) |

None of them is edited by hand.

## What the number means

[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

While we are on **0.x**, a breaking change bumps the *minor*, not the
*major* — SemVer 0.x promises no stability. The jump to **1.0.0** is reserved
for a stable public launch and is done by hand.

## Commit message format

The changelog is generated from the commits, so they need a prefix a machine
can read: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
The description is short, in the imperative mood:

```
feat(immich): add "on this day" collections
fix(pull): queue photos sent while the frame is asleep
docs: document the release process
chore(deps): bump vite to 8
```

The scope in parentheses is optional.

| Prefix | Changelog section | Bumps the version |
| --- | --- | --- |
| `feat` | Added | minor (0.3.0 → 0.4.0) |
| `fix` | Fixed | patch (0.3.0 → 0.3.1) |
| `perf` | Performance | patch |
| `refactor` | Changed | patch |
| `docs` | Documentation | no |
| `chore`, `build`, `ci`, `test`, `style` | Maintenance | no |
| `revert` | Reverted | patch |

For a breaking change, add `!` before the colon (`feat(api)!: ...`) or a
`BREAKING CHANGE:` line in the body.

A commit that doesn't follow the format **doesn't appear in the changelog**.
That is what automatically drops the merge commits GitLab creates when
accepting an MR.

## The workflow

A tag **is not a branch**: it's a label pinned to one specific commit. Nobody
works on it or merges it. It goes at the end, not the beginning.

Day-to-day work doesn't change: branches from `main` and merge requests. There
is only one extra step, and only when you want to publish.

```
main    --*--------*------------*----------*-----
          |        ^            ^          ^
          |      merge        merge      release
          |                              (tag v0.4.0)
          +--o--o--+
         your branch
```

1. Branch from `main` (`feat/blurred-border`).
2. Commit using the format above (`feat: ...`, `fix: ...`).
3. Open an MR and merge it into `main`.
4. Repeat 1-3 as often as you like.
5. When what has accumulated deserves a release, from `main`:
   `node scripts/release.mjs`.

**A tag isn't "an improvement", it's "a release"**, and it can group several
merged branches: you can merge four branches over two weeks and publish a
single `v0.4.0` that includes them all. The changelog lists them all, grouped
by type.

The maintainer decides when there is a release. Nothing is published
automatically, and even after running the script, the commit and tag stay
local until you `push` -- until then GitLab knows nothing and it can be undone
with no consequences.

Merges to `main` publish no image: only releases reach the registry. Every
merge request builds the Docker image without pushing it, and it can only be
merged once the tests and that build pass.

## Cutting a release

From `main`, with everything merged and no pending changes:

```bash
node scripts/release.mjs
```

The script checks the repository is clean, that you are on `main` and that it
matches `origin/main`; computes the next version from the commits since the
last tag; updates the version files; adds the new section to `CHANGELOG.md`;
**shows you the diff and waits for confirmation**; and creates the
`chore(release): vX.Y.Z` commit and the tag.

To force a specific number (for example the jump to 1.0.0):

```bash
node scripts/release.mjs 1.0.0
```

**The script doesn't push, on purpose.** Publishing is a deliberate act,
because the tag triggers the release build. Once reviewed:

```bash
git push origin main --follow-tags
```

To back out before pushing:

```bash
git tag -d vX.Y.Z
git reset --hard HEAD~1
```

## What GitLab does when the tag arrives

1. **`check-version`** fails the pipeline if the tag doesn't match `VERSION`.
   It's the safety net against tagging without bumping the version.
2. **`test`** builds both apps and runs the test suite.
3. **`build-image`** builds and publishes the image as `:vX.Y.Z` **and**
   `:latest` in `registry.gitlab.com/yayitazale/eink-hub`.
4. **`trivy-image`** scans that same image (informational, never blocks).
5. **`release`** creates the entry in GitLab's *Releases* tab.

Pushes to `main` without a tag only run the tests.
**Images, and `:latest`, only move when a tag is published**, so whoever
deploys by pulling `:latest` gets deliberately released versions and not
every merge.

Tags also rebuild this website (the `pages` job): the latest release at the
root and older releases under `/vX.Y.Z/`. Docs merged to `main` go live with
the next release, which can be a docs-only one; merge requests still check
the docs build (`docs-build`).

Merge requests run `test`, `npm-audit` and `docker-build` (plus `docs-build` when they touch
the docs or examples); they never publish an image.

## The changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and is generated by [git-cliff](https://git-cliff.org) using `cliff.toml`. The
script uses `--prepend`: it **adds** the new section on top without
regenerating the rest, so what has already been published — including the
hand-written `0.1.0` entry — never changes.

Nothing needs installing: the script calls `npx git-cliff@2`.
