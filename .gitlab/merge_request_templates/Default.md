<!-- Title: use Conventional Commits, e.g. "feat(immich): add memories collection" -->

## What and why

<!-- What does this change, and what problem does it solve? Link the issue if there is one (Closes #12). -->

## How it was tested

<!-- Real frame (model / firmware), Test Canvas, fake-frame simulator, unit tests… -->

## Checklist

- [ ] Commits and MR title follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [ ] `npm run build` and `npm test` pass
- [ ] New UI strings are added to every language in `apps/web/src/i18n` (and `apps/server/src/locales` for API messages)
- [ ] No version bump or `CHANGELOG.md` edit (the release script does that)
