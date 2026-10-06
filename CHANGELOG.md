# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/): server and
web share a single number (see `VERSION` at the repository root).

Generated automatically from commit messages. The 0.1.0 entry is the only
one written by hand: it summarises everything before the first release.

## [0.1.0] - 2026-10-06

First numbered version: summarises the state of the project before releases
and Conventional Commits were adopted.

### Added

- Self-hosted hub for BLOOMIN8 E-Ink Canvas frames: a single Docker container
  (Node + SQLite) with a web UI in English, Spanish and Basque, light and dark theme,
  installable as a PWA.
- Frame discovery over mDNS and subnet scan, or adding frames by IP.
- Sending photos with an exact preview: smart auto-crop, manual crop, fit with
  border or blurred background.
- Collections: manual uploads, or dynamic ones synced from Immich (album,
  people, favorites, smart CLIP search, "on this day" memories).
- Per-frame rotation with interval, order (random, sequential, newest) and
  active hours.
- Push delivery and Schedule Pull delivery, with photos queued for frames that
  are asleep.
- Management of on-device galleries and playlists, device settings and
  sleep/reboot/clear actions.
- Built-in Test Canvas to try everything without hardware.
- Admin login, and the version shown in the UI and returned by `/api/health`.
