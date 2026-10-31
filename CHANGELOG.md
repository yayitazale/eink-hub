# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/): server and
web share a single number (see `VERSION` at the repository root).

Generated automatically from commit messages. The 0.1.0 entry is the only
one written by hand: it summarises everything before the first release.

## [0.7.0] - 2026-10-31

### Added

- User accounts with admin and member roles, invite links and passkey sign-in ([bdc610ac](https://github.com/yayitazale/eink-hub/commit/bdc610ac0332db9e12bb6d2cdbee49bfaa42ffcd))
- **web**: Capitalized role names with an icon in the role pickers ([5630dca5](https://github.com/yayitazale/eink-hub/commit/5630dca59715be87053fa7279305eef75547dd59))

### Fixed

- Deliver the queued photo as soon as the Canvas is found awake; history refreshes with the frame ([3b5ad129](https://github.com/yayitazale/eink-hub/commit/3b5ad12949b6c7ba6f57682cbf675d7c46cb6559))

## [0.6.0] - 2026-10-23

### Added

- Wake with the phone from a bottom sheet; Bluetooth settings show the server's status ([64af84b0](https://github.com/yayitazale/eink-hub/commit/64af84b01e07851aa9f39c7119a6133ee98be470))

## [0.5.1] - 2026-10-22

### Fixed

- Update check reads the docs' versions.json, every 2 h, only when the hub is opened ([bfa1d8ab](https://github.com/yayitazale/eink-hub/commit/bfa1d8ab01bf30641e0ab76031d42f667211fcb8))

### Maintenance

- Release notes carry the version's CHANGELOG section ([a8c7a4bd](https://github.com/yayitazale/eink-hub/commit/a8c7a4bde6b1d6315ee9ca2d2e7d14a5c621d2b7))

## [0.5.0] - 2026-10-22

### Added

- **web**: Our own Material You dropdowns and time picker instead of the native ones ([97f900bd](https://github.com/yayitazale/eink-hub/commit/97f900bdde443c083d455b9e1bb7c1b5046d8087))
- **web**: Firmware always shown on the Canvas page, under the model ([08c3464d](https://github.com/yayitazale/eink-hub/commit/08c3464d18399dd61c8f4bb4723ccb4fa58dc7e2))
- **web**: The same eight fields on every Canvas page ([3cc15964](https://github.com/yayitazale/eink-hub/commit/3cc15964d59ea191549ff25bbe62536b3bc3f297))
- DIY frames report their Wi-Fi, address and free storage ([c6f833f6](https://github.com/yayitazale/eink-hub/commit/c6f833f6ef38354f6ae80be8790ac50343dcd7a2))
- **web**: "Wakes up" and "Pending" say what actually happens ([43d6ee03](https://github.com/yayitazale/eink-hub/commit/43d6ee039143ac696fa68cdb5cfa6cf0e369e489))

### Fixed

- **web**: Page action buttons always under the subtitle on phones ([7aa3347e](https://github.com/yayitazale/eink-hub/commit/7aa3347e2b2967acedc552384189f43723d8b0b2))
- **server**: Welcome picture with the same sizes in both orientations, even margins ([617f17a7](https://github.com/yayitazale/eink-hub/commit/617f17a787c0f5f293233457b12086a30a8a28a9))

## [0.4.0] - 2026-10-22

### Added

- Ask for the orientation when adding a Canvas; landscape welcome picture ([94c043b3](https://github.com/yayitazale/eink-hub/commit/94c043b3d2397def070a79fc45726dcf09c86fb0))
- **web**: "Show the photo's date" when sending from the library ([c9a7bbfc](https://github.com/yayitazale/eink-hub/commit/c9a7bbfc652d16dce35cf865ab0dbc6a4159c202))
- **web**: Roomier schedule cards and swipe-down-to-close sheets on phones ([04a6b432](https://github.com/yayitazale/eink-hub/commit/04a6b432a099018e418b29704ef66809e577ecb4))
- **web**: Schedule cards open the editor on click, with the Canvas cards' hover ([94a7aa8d](https://github.com/yayitazale/eink-hub/commit/94a7aa8d7de9fd627c6f4df2f1249801d03fa281))
- **web**: Push/Pull chip on schedule cards with its own icon and colour ([f281849f](https://github.com/yayitazale/eink-hub/commit/f281849ff1b11ea4fa830233cf1dfd431241dfdf))
- **web**: In-app confirmation dialogs instead of the browser's confirm() ([637b4229](https://github.com/yayitazale/eink-hub/commit/637b4229faa9b8991838030917dd716f7bd613ab))
- Create, pause and remove schedules from the Schedule page; empty editor for a new one ([52ce8e19](https://github.com/yayitazale/eink-hub/commit/52ce8e19ac000f3ef41fa93531ab83e60eaf3286))
- **web**: Schedule page lists only existing schedules; create picks the Canvas ([749b8acd](https://github.com/yayitazale/eink-hub/commit/749b8acd50c1ba0563fcac6236496b86a2081462))
- **web**: Next change row and soonest-first order on schedule cards ([09313fdf](https://github.com/yayitazale/eink-hub/commit/09313fdf3caaf5d83520bdb8ba230d9dc5905532))
- **web**: Paused schedules grouped at the end and visibly dimmed ([7f1d780a](https://github.com/yayitazale/eink-hub/commit/7f1d780ad8f151f2b50d7d21bbc11c2001744d21))
- Docs and repo links next to the version; update check with a notice ([2e71f570](https://github.com/yayitazale/eink-hub/commit/2e71f5706065cf435e4de49d84c4bca82dfa4d85))

### Fixed

- **web**: Phone schedule buttons stay bottom-right when paused; icon on the Paused chip ([aaa874f8](https://github.com/yayitazale/eink-hub/commit/aaa874f8a86ae90351ae4ab7ff3fe50383017f25))
- **web**: Schedule cards say when a change is pending instead of hiding it ([0b4f8db1](https://github.com/yayitazale/eink-hub/commit/0b4f8db11846186b5500c2c654fa110303dd705b))

### Documentation

- Add UI screenshots to the README and docs home ([187d47dc](https://github.com/yayitazale/eink-hub/commit/187d47dc12dcc7c961896d7783608928e779c3e4))
- Drop the phone screenshot ([b6952573](https://github.com/yayitazale/eink-hub/commit/b6952573f2dd065de253d7285b33ac3d2b00d485))
- Add the Canvas detail screenshot ([ea053743](https://github.com/yayitazale/eink-hub/commit/ea053743df2cec8fe0c5507b70a3259deac5b379))
- Click a screenshot to see it full size ([cec9f3c6](https://github.com/yayitazale/eink-hub/commit/cec9f3c60f49c639c813071cfca7b79468b56a69))

## [0.3.5] - 2026-10-18

### Maintenance

- Move the project to GitHub ([8c7762e3](https://github.com/yayitazale/eink-hub/commit/8c7762e3cb960e1764b6dd3d0422b806e18f5768))

## [0.3.4] - 2026-10-09

### Documentation

- Drop unreleased main from the version switcher ([a2874bda](https://gitlab.com/yayitazale/eink-hub/-/commit/a2874bda9be1df7be6d2abd938e6d873a93b0592))

### Maintenance

- Publish images only for releases ([f8afd796](https://gitlab.com/yayitazale/eink-hub/-/commit/f8afd796fb3c786a39a23b6448f6149097e37de1))

## [0.3.3] - 2026-10-09

### Added

- **web**: Show Canvas free space as a share of the card ([4e72e7c6](https://gitlab.com/yayitazale/eink-hub/-/commit/4e72e7c6a8bf26cf19f0255ea16476e1d4a0d3ee))

### Fixed

- **bloomin8**: Trim the hub gallery before uploading ([ad5c16f1](https://gitlab.com/yayitazale/eink-hub/-/commit/ad5c16f17e546bfebf99023f839b98ce8e532361))
- **bloomin8**: Show a Canvas as asleep once max_idle has passed ([5953df58](https://gitlab.com/yayitazale/eink-hub/-/commit/5953df581717069195e39fdfb90daaff8b10a571))
- **server**: Log unhandled errors to hub.log before exiting ([aacae127](https://gitlab.com/yayitazale/eink-hub/-/commit/aacae1273c0d2c0bb575ffa212b49d6473ed48fe))

## [0.3.2] - 2026-10-07

### Documentation

- **unraid**: Explain Bluetooth wake needs BlueZ ([97509226](https://gitlab.com/yayitazale/eink-hub/-/commit/975092264bf59c0d84126de8df03affcf82b6c93))

## [0.3.1] - 2026-10-07

### Fixed

- **immich**: Document every API key permission the hub needs ([a789d750](https://gitlab.com/yayitazale/eink-hub/-/commit/a789d750b63df57c2220fef7fc6a4bd4895ae55b))

### Maintenance

- Generic time zone and Unraid template docs ([b8052d3d](https://gitlab.com/yayitazale/eink-hub/-/commit/b8052d3dcc7c3ac99812750160c450d9ad3198c3))

## [0.3.0] - 2026-10-07

### Added

- Detect the Tailscale Serve address and keep tailnet hosts out of LOCAL_URL ([d1790ba1](https://gitlab.com/yayitazale/eink-hub/-/commit/d1790ba1653d113ccd10d8e4850c6f18dd0a0353))
- **unraid**: Community Applications template with Tailscale preset ([64d55431](https://gitlab.com/yayitazale/eink-hub/-/commit/64d554313c53386a9f7c776375f9481f812e60a1))
- **unraid**: Link the forum support thread ([3be80075](https://gitlab.com/yayitazale/eink-hub/-/commit/3be800758aa9907784398cec0cf5ad8f664a6ed8))

### Documentation

- Unraid install and Tailscale guide ([568cd2f0](https://gitlab.com/yayitazale/eink-hub/-/commit/568cd2f06f9b215e01bf45f0121324e8ad1fa767))

### Maintenance

- **unraid**: Move the template to the unraid-templates repo ([d24d0417](https://gitlab.com/yayitazale/eink-hub/-/commit/d24d0417cd02209cd17b76badf6cceaa18bfd56f))

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
