# <img src="docs/logo.png" alt="" width="40" align="absmiddle" /> E-Ink Hub

Self-hosted control center for e-ink photo frames, with **Immich** integration.
A single Docker container (Node + SQLite) with a web UI inspired by the official BLOOMIN8 app.

📖 **Website and documentation: https://yayitazale.gitlab.io/eink-hub/**

| Frame | How | |
| --- | --- | --- |
| BLOOMIN8 E-Ink Canvas | Local API, push or scheduled pull, Bluetooth wake | ✅ |
| SwitchBot AI Art Frame | SwitchBot cloud API (needs an https external URL) | ✅ |
| TRMNL firmware (TRMNL, Waveshare PhotoPainter, reTerminal…) | The hub is their BYOS server | ✅ |
| Your own ESP32 / Raspberry Pi frame | [Open Frame protocol](https://yayitazale.gitlab.io/eink-hub/diy/protocol), examples in [`examples/`](examples) | ✅ |

- Discover frames (mDNS / subnet scan) or add them by IP
- Send any photo with an exact preview: smart auto-crop, manual crop, fit with border, or blurred background
- Collections: manual uploads, or dynamic ones synced from Immich (album, people, favorites, smart CLIP search, "on this day" memories)
- Per-frame rotation: interval, order (random / sequential / newest), active hours
- Two delivery modes:
  - **Push** – the hub uploads to the frame (`/upload?show_now=1`). Instant, but the frame must be awake.
  - **Pull (recommended)** – uses the frame's *Schedule Pull* protocol: the frame sleeps, wakes at the time the hub tells it, calls `GET /eink_pull`, downloads the image and goes back to sleep. Best battery life. Photos sent while a frame is asleep are queued for its next wake.
- Manage on-device galleries & playlists, device settings, sleep/reboot/clear
- **Bluetooth wake**: wake a sleeping frame without touching it, from the server's Bluetooth (Linux) or from your phone's browser, optionally before every send. See [docs/bluetooth.md](docs/bluetooth.md)
- Simple admin login, light/dark theme, mobile-friendly (installable PWA)
- **Test Canvas** button (**Add Canvas** → *Create test Canvas*): a simulated frame running inside the hub, to try everything without hardware. No extra port needed; it survives restarts.

## Run with Docker

```bash
cp .env.example .env   # set LOCAL_URL to this machine's LAN IP
docker compose up -d
```

This pulls the released image `registry.gitlab.com/yayitazale/eink-hub:latest`. To build from
your checkout instead, copy `docker-compose.override.yml.example` to `docker-compose.override.yml`
and run `docker compose up -d --build`.

Open `http://<host>:8080`, choose an admin password, then **Add Canvas**.
Data (SQLite DB, originals, render cache) lives in `./data`.

`network_mode: host` is used so mDNS discovery works. With bridge networking, add frames by IP.

For Bluetooth wake from the server, also mount `/run/dbus` (Linux hosts only); see
[docs/bluetooth.md](docs/bluetooth.md) for what works where.

### Hub addresses
- **Local URL** (`LOCAL_URL`, or Settings): the LAN address Canvases use in pull mode, e.g. `http://192.168.1.10:8080`. Auto-detected when unset. `PUBLIC_URL` is still accepted as its old name.
- **Public address** (`EXTERNAL_URL`, optional): where people open the hub through a reverse proxy or Tailscale. The QR code on the Canvas welcome picture opens it; without it, the QR uses the local URL.

### Pull mode
1. Check **Settings → Hub local URL** is an address the Canvas can reach.
2. Wake the frame (press its button, or **Wake** with Bluetooth), open the frame → **Mode** → *Scheduled pull* and press **Save**.
3. Give the frame a collection under **Schedule**. It will wake at each interval, pull the next photo and sleep.

### Immich
Create an API key in Immich (Account settings → API keys) with read access to assets, albums, people and memories, then add it in **Settings**. The key stays on the server; the browser only talks to the hub.

## Development

```bash
npm install
npm run dev:server          # API on :8080 (tsx watch, data in apps/server/data)
npm run dev:web             # UI on :5173, proxies /api to :8080
npm run fake-frame          # simulated canvas on :8090 (add it as 127.0.0.1:8090)
npm test                    # vitest: imaging pipeline, rotation logic, pull protocol
```

`FAKE_FAST=1 npm run fake-frame` makes the simulator pull every 5 s so you can watch the
pull → download → signal loop. It warns if an image isn't baseline JPEG at native resolution.

## Layout

```
apps/server   Fastify + Drizzle/better-sqlite3 + sharp
  src/device      frame drivers (BLOOMIN8, SwitchBot, Open Frame, TRMNL), discovery, Bluetooth wake
  src/upstream    device-facing endpoints: BLOOMIN8 pull, Open Frame, TRMNL BYOS, /u/img
  src/imaging     render pipeline (JPEG/PNG/BMP, native resolution, orientation, dithering)
  src/immich      Immich API client
  src/lib         collections sync, image store, rotation/selection
  src/scheduler   push rotation, status polling, collection sync
  scripts/fake-frame.ts
apps/web      React + Vite + Tailwind + TanStack Query
docs-site     project website (VitePress), published to GitLab Pages
examples      DIY Open Frame firmware: ESP32 (PlatformIO) and Raspberry Pi + Inky (Python)
```

## API references
- BLOOMIN8 local API: https://bloomin8.readme.io/ and the `openapi.yaml` / `docs/Schedule_Pull_API.md` in
  https://github.com/ARPOBOT-BLOOMIN8/eink_canvas_home_assistant_component
- Immich: https://api.immich.app/

## Not yet covered
- Bluetooth wake is tested against a mocked BlueZ; verify it on real hardware and hosts
- Pre-dithered uploads to BLOOMIN8 (`/image/dataUpload`) — the frame dithers JPEGs itself
- Tested against the simulator only; verify resolution/rotation on real hardware
- SwitchBot and TRMNL support is tested against mocks and the published protocols, not real devices yet

## Versions and images

Releases follow [Semantic Versioning](https://semver.org/) and are listed in [CHANGELOG.md](CHANGELOG.md)
and on the GitLab *Releases* page. The running version appears at the bottom of the sidebar and in `GET /api/health`.

| Image tag | What it is |
| --- | --- |
| `:latest` | The latest release (recommended) |
| `:vX.Y.Z` | A specific release, to pin a version |
| `:main` | Latest build of `main` — untested, for trying unreleased changes |

To update: `docker compose pull && docker compose up -d`. How releases are cut is described in
[docs/versioning.md](docs/versioning.md).

## Contributing

Contributions are welcome! In short:

1. Open an [issue](https://gitlab.com/yayitazale/eink-hub/-/issues) for bugs or ideas.
2. Fork, branch from `main` and open a **merge request** against `main`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat: …`, `fix: …`): the changelog is generated from them.
4. Make sure `npm run build` and `npm test` pass; the MR pipeline runs them too.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details.

## License

[MIT](LICENSE) © 2026 Joseba Egia. Third-party components are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
