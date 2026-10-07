# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/): server and
web share a single number (see `VERSION` at the repository root).

Generated automatically from commit messages. The 0.1.0 entry is the only
one written by hand: it summarises everything before the first release.

## [0.2.0] - 2026-10-07

### Added

- Wake frames over Bluetooth from the hub or the phone ([4f93a7aa](https://gitlab.com/yayitazale/eink-hub/-/commit/4f93a7aac8ad75ea521bef32fc811254bf00926c))
- Next triggers the Canvas schedule and toasts say what happened ([8f10b979](https://gitlab.com/yayitazale/eink-hub/-/commit/8f10b9795350085476506af229366d2ad1b1df08))
- Server logs page, per-Canvas log download and tabbed Settings ([6b44ca1c](https://gitlab.com/yayitazale/eink-hub/-/commit/6b44ca1c942494f15ce8a1a24b08024e8fbfe024))
- **web**: Same fit options and hints for a Canvas default as when sending a photo ([9e607fc3](https://gitlab.com/yayitazale/eink-hub/-/commit/9e607fc39959324490cfc04ddffd19b6faee5afe))
- Optional per-Canvas statistics ([19841a11](https://gitlab.com/yayitazale/eink-hub/-/commit/19841a112ffe835fe6fa36ee7264538581dbfce8))
- Default language is English ([883a85a8](https://gitlab.com/yayitazale/eink-hub/-/commit/883a85a8ae7215016ba4cdec4a2587bbf20f42b3))
- **server**: Frame drivers for SwitchBot, Open Frame (DIY) and TRMNL ([35610c55](https://gitlab.com/yayitazale/eink-hub/-/commit/35610c558381b7893543ebe19cd0e78946fffc39))
- **web**: Add SwitchBot, TRMNL and DIY frames from the UI ([a321af54](https://gitlab.com/yayitazale/eink-hub/-/commit/a321af549e35def010f785825c0571a82447c41c))
- Frame type chip, and a public address just for cloud frames ([2e76462e](https://gitlab.com/yayitazale/eink-hub/-/commit/2e76462e32f41839240f362f2f567302bcca00c9))
- **docker**: Bridge networking by default, host networking for mDNS optional ([33e32ca6](https://gitlab.com/yayitazale/eink-hub/-/commit/33e32ca6b80ca0238eb3818cf14bf682b19acf2b))
- **i18n**: 14 more languages, plural rules and a parity test ([5b9bd867](https://gitlab.com/yayitazale/eink-hub/-/commit/5b9bd86734113e5319879f84f301e4b3f9686f29))
- Frame size from the model and per-canvas frame look ([40670ccc](https://gitlab.com/yayitazale/eink-hub/-/commit/40670ccc6f56119929927d5696edde10adefd17d))

### Fixed

- **docker**: Apply Debian security updates and drop npm from the runtime image ([802e0f8f](https://gitlab.com/yayitazale/eink-hub/-/commit/802e0f8f3819eb766b044b7dd7d06b2f56c6ff50))
- **web**: Narrower send dialog when not cropping ([efe3ceee](https://gitlab.com/yayitazale/eink-hub/-/commit/efe3ceee190a219269f8bc83c68a0c2f904c4e02))
- **web**: "Show on a Canvas" dialog no longer clips long translations ([09b48eff](https://gitlab.com/yayitazale/eink-hub/-/commit/09b48effc83ab63e6e1e87ab543d9562acb5d45c))
- **docs**: Build the site for the Pages unique domain ([7bb1e81e](https://gitlab.com/yayitazale/eink-hub/-/commit/7bb1e81e3b776a5adc115e1b8f88edd45b347727))
- **release**: Don't repeat the changelog header on each release ([cb8cd4b7](https://gitlab.com/yayitazale/eink-hub/-/commit/cb8cd4b7dfa3e0073f8ae7fc084606e09bc35a9a))

### Documentation

- Refer to UI actions by their English labels ([1331ad0b](https://gitlab.com/yayitazale/eink-hub/-/commit/1331ad0b1975ae9e3888d71d58de4e4515eb0f24))
- Add logo next to the README title ([c97d05ee](https://gitlab.com/yayitazale/eink-hub/-/commit/c97d05ee113f6b4066bf6ceb6f0db9144877d5ac))
- Project website on GitLab Pages, Open Frame spec and DIY examples ([8b7a3e50](https://gitlab.com/yayitazale/eink-hub/-/commit/8b7a3e508b5b3da066f6fbe1b81812f4d743fe3c))
- Versioned website, local/cloud matrix, exposure guide, shorter README ([611a7430](https://gitlab.com/yayitazale/eink-hub/-/commit/611a74304215185e36bb201bafe6a5ac977287d4))
- Not-tested badges, trademarks and new third-party components ([72145eb7](https://gitlab.com/yayitazale/eink-hub/-/commit/72145eb7d5682f4f800ed95beb78d6dcdc72700d))
- How to add a language and which ones are machine-translated ([f8cf9c63](https://gitlab.com/yayitazale/eink-hub/-/commit/f8cf9c635253f24d2997fdba85cba0b86b686a8a))
- Move docs/ into docs-site ([7ffa36df](https://gitlab.com/yayitazale/eink-hub/-/commit/7ffa36df44be436a25ec82f3cc3055fb13180339))

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
