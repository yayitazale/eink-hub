# Contributing to E-Ink Hub

Thanks for helping out! Bug reports, ideas and merge requests are all welcome.

## Reporting bugs and ideas

Open an issue on GitLab: https://gitlab.com/yayitazale/eink-hub/-/issues

For bugs, include the hub version (shown at the bottom of the sidebar, or
`GET /api/health`), the frame model and firmware, the delivery mode (push or
pull), and the relevant container logs (`docker compose logs eink-hub`).

## Merge requests

1. **Fork** the project and create a branch from `main`, named after the
   change: `feat/blurred-border`, `fix/pull-queue`, `docs/immich-setup`…
2. Make your changes. Keep each MR focused on one thing — small MRs get
   reviewed and merged much faster.
3. Use **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**
   for commit messages and for the MR title:

   ```
   feat(immich): add "on this day" collections
   fix(pull): queue photos sent while the frame is asleep
   ```

   The changelog is generated from these prefixes; commits that don't follow
   the format are left out of it. The full table of prefixes is in
   [docs/versioning.md](docs/versioning.md#commit-message-format).
4. Check that it builds and the tests pass (see below).
5. Open a **merge request against `main`**. Describe what changes and why,
   and how you tested it (real frame model, or the Test Canvas / simulator).
   The MR pipeline (build, tests and `npm audit`) must be green.

Please **don't** bump version numbers or edit `CHANGELOG.md`: releases are cut
by the maintainer with `scripts/release.mjs`, which does both.

## Local development

Requires Node 22.

```bash
npm ci
npm run dev:server          # API on :8080 (tsx watch, data in apps/server/data)
npm run dev:web             # UI on :5173, proxies /api to :8080
npm run fake-frame          # simulated canvas on :8090 (add it as 127.0.0.1:8090)
npm test                    # vitest
npm run build               # type-check and build both apps
```

No hardware? Use **Add Canvas → Create test Canvas** in the UI, or the
`fake-frame` simulator above.

To build and run the Docker image from your checkout:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d --build
```

## Code style

Match the surrounding code: TypeScript everywhere, small modules, comments
that explain *why* rather than *what*. UI strings go through the i18n files in
`apps/web/src/i18n` (English, Spanish and Basque), so please add new keys to
all three; if you can't translate one, copy the English text and mention it in
the MR.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE) of this project.
