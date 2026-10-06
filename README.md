# <img src="docs/logo.png" alt="" width="40" align="absmiddle" /> E-Ink Hub

Self-hosted control center for e-ink photo frames, with **Immich** integration. A single Docker container (Node + SQLite) with a mobile-friendly web UI.

📖 **Documentation: https://yayitazale.gitlab.io/eink-hub/**

| Frame | Integration | |
| --- | --- | --- |
| [BLOOMIN8 E-Ink Canvas](https://yayitazale.gitlab.io/eink-hub/devices/bloomin8) | 🏠 Local | ✅ |
| [SwitchBot AI Art Frame](https://yayitazale.gitlab.io/eink-hub/devices/switchbot) | ☁️ Cloud | ✅ |
| [TRMNL firmware](https://yayitazale.gitlab.io/eink-hub/devices/trmnl) (TRMNL, Waveshare PhotoPainter, reTerminal…) | 🏠 Local | ✅ |
| [Your own ESP32 / Raspberry Pi frame](https://yayitazale.gitlab.io/eink-hub/diy/) | 🏠 Local | ✅ |

- Exact previews with smart crop, manual crop, border or blurred background
- Collections from uploads or Immich (albums, people, favourites, smart search, "on this day")
- Schedules with active hours; battery-friendly pull mode; Bluetooth wake for BLOOMIN8
- An open protocol for DIY frames, with ESP32 and Raspberry Pi [examples](examples)

## Quick start

```bash
cp .env.example .env   # set LOCAL_URL to this machine's LAN address
docker compose up -d
```

Open `http://<host>:8080`, choose an admin password and **Add Canvas**. No hardware? Add a *Simulated Canvas*.
See [Getting started](https://yayitazale.gitlab.io/eink-hub/guide/getting-started) for the rest.

## Development

```bash
npm install
npm run dev:server   # API on :8080
npm run dev:web      # UI on :5173
npm test
```

The website lives in [`docs-site/`](docs-site) (VitePress). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) and the [development docs](https://yayitazale.gitlab.io/eink-hub/development/).

> 🤖 This project has been developed together with [Claude](https://claude.ai).

## License

[MIT](LICENSE) © 2026 Joseba Egia. Third-party components are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Not affiliated with BLOOMIN8, SwitchBot or TRMNL.
