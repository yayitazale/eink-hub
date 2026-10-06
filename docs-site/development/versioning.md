# Versioning & releases

Releases follow [Semantic Versioning](https://semver.org/). Server and web ship together in one image, so they share one version, kept in the `VERSION` file and propagated by `scripts/release.mjs`.

- Each release is tagged `vX.Y.Z`. CI checks the tag matches `VERSION`, builds and scans the image, publishes `:vX.Y.Z` and `:latest`, and creates the GitLab Release.
- Every merge to `main` publishes `:main` and rebuilds this website.
- The changelog is generated from [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

The details are in [docs/versioning.md](https://gitlab.com/yayitazale/eink-hub/-/blob/main/docs/versioning.md), and every release is listed in the [changelog](https://gitlab.com/yayitazale/eink-hub/-/blob/main/CHANGELOG.md).
